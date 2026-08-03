// Backend do OTDE — App 1 (categoria "ERP System"): vendas + ferramentas.
// Cloud Functions (2ª geração). Requer plano Blaze no Firebase.
//
// Fluxo:
//   1) /shopeeAuthLink?cliente=ID  -> redireciona o lojista para autorizar o app
//   2) /shopeeCallback             -> recebe code + shop_id, salva tokens em shopee_auth/{cliente}
//   3) syncVendas  (agendada)      -> grava faturamento do dia em sales/{cliente}_{data}
//   4) syncFerramentas (agendada)  -> grava promoções ativas em tools/{cliente}
//
// Segredos (definir com: firebase functions:secrets:set NOME):
//   SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_CALLBACK_URL

import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  buildAuthUrl, getAccessToken, refreshAccessToken, shopCall,
} from "./shopee.js";

initializeApp();
const db = getFirestore();

// Só a chave é segredo. partner_id, callback e base ficam no functions/.env (não sensíveis).
const PARTNER_KEY = defineSecret("SHOPEE_PARTNER_KEY");

const cfg = () => ({
  partnerId: (process.env.SHOPEE_PARTNER_ID || "").trim(),
  partnerKey: (PARTNER_KEY.value() || "").trim(),
});
const callbackUrl = () => process.env.SHOPEE_CALLBACK_URL;
const secrets = [PARTNER_KEY];

// ---------- Diagnóstico (temporário, não expõe a chave) ----------
export const debugKey = onRequest({ secrets }, (req, res) => {
  const raw = PARTNER_KEY.value() || "";
  const k = raw.trim();
  const estranhos = [...k]
    .map((c, i) => (/[0-9a-zA-Z]/.test(c) ? null : { i, code: c.charCodeAt(0) }))
    .filter(Boolean)
    .slice(0, 15);
  res.json({
    partnerId: (process.env.SHOPEE_PARTNER_ID || "").trim(),
    base: process.env.SHOPEE_BASE,
    rawLength: raw.length,
    keyLength: k.length,
    keyIsAlnum: /^[0-9a-zA-Z]+$/.test(k),
    keyHasWhitespace: /\s/.test(k),
    caracteresEstranhos: estranhos,
    inicio4: k.slice(0, 4),
    fim4: k.slice(-4),
  });
});

// ---------- 1) Link de autorização ----------
export const shopeeAuthLink = onRequest({ secrets }, (req, res) => {
  const cliente = req.query.cliente;
  if (!cliente) { res.status(400).send("Falta ?cliente=ID"); return; }
  const redirectUri = `${callbackUrl()}?cliente=${encodeURIComponent(cliente)}`;
  const url = buildAuthUrl({ ...cfg(), redirectUri });
  res.redirect(url);
});

// ---------- 2) Callback do OAuth ----------
export const shopeeCallback = onRequest({ secrets }, async (req, res) => {
  const { code, shop_id: shopId, cliente } = req.query;
  if (!code || !shopId || !cliente) { res.status(400).send("Parâmetros ausentes."); return; }
  try {
    const tok = await getAccessToken(cfg(), { code, shopId });
    if (tok.error) throw new Error(`${tok.error}: ${tok.message}`);
    await db.collection("shopee_auth").doc(String(cliente)).set({
      cliente: String(cliente),
      shopId: Number(shopId),
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiraEm: Date.now() + (tok.expire_in || 14400) * 1000,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    // Espelho SEM tokens, para a dashboard poder mostrar o status da conexão.
    await db.collection("integracoes").doc(String(cliente)).set({
      cliente: String(cliente),
      shopId: Number(shopId),
      conectado: true,
      conectadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.send(`<!doctype html><meta charset="utf-8">
      <div style="font-family:system-ui;text-align:center;margin-top:80px">
        <h2 style="color:#16a34a">Loja conectada com sucesso ✓</h2>
        <p style="color:#475569">Pode fechar esta janela e voltar ao sistema.</p>
        <script>setTimeout(()=>window.close(),2500)<\/script>
      </div>`);
  } catch (e) {
    logger.error("callback", e);
    res.status(500).send("Erro ao conectar a loja: " + e.message);
  }
});

// Garante um access_token válido (renova se faltar menos de 10 min).
async function ensureToken(docRef, data) {
  if (Date.now() < (data.expiraEm || 0) - 10 * 60 * 1000) return data.accessToken;
  const r = await refreshAccessToken(cfg(), { refreshToken: data.refreshToken, shopId: data.shopId });
  if (r.error) throw new Error(`refresh ${r.error}: ${r.message}`);
  await docRef.set({
    accessToken: r.access_token,
    refreshToken: r.refresh_token || data.refreshToken,
    expiraEm: Date.now() + (r.expire_in || 14400) * 1000,
  }, { merge: true });
  return r.access_token;
}

async function forEachShop(fn) {
  const snap = await db.collection("shopee_auth").get();
  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      const token = await ensureToken(doc.ref, data);
      await fn({ cliente: doc.id, shopId: data.shopId, token });
    } catch (e) {
      logger.error("shop " + doc.id, e);
    }
  }
}

// ---------- 3) Vendas do dia ----------
// order.get_order_list -> order_sn; order.get_order_detail -> total_amount (GMV).
// Confirmar os nomes dos campos na "API List" do App 1 depois de criado.
// Fuso de operação das lojas. O Brasil não usa mais horário de verão (desde
// 2019), então o deslocamento -03:00 é fixo e seguro.
const TZ_OFFSET = "-03:00";

// Data de hoje (YYYY-MM-DD) no fuso de Brasília — não em UTC.
function dataLocal(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

// Início e fim (epoch em segundos) de um dia do calendário local.
function limitesDoDia(dia) {
  const inicio = Math.floor(Date.parse(`${dia}T00:00:00${TZ_OFFSET}`) / 1000);
  const fimDoDia = Math.floor(Date.parse(`${dia}T23:59:59${TZ_OFFSET}`) / 1000);
  const agora = Math.floor(Date.now() / 1000);
  return { inicio, fim: Math.min(fimDoDia, agora) };
}

// Pedidos que NÃO contam como venda: não pagos e cancelados.
const STATUS_IGNORADOS = new Set(["UNPAID", "CANCELLED", "INVOICE_PENDING"]);

// Faturamento de um dia do calendário, para uma loja.
async function fetchVendasDoDia(dia, shopId, token) {
  const { inicio, fim } = limitesDoDia(dia);
  if (fim <= inicio) return { gmv: 0, pedidos: 0 };

  let cursor = "", orderSns = [];
  do {
    const r = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_list", accessToken: token, shopId,
      params: { time_range_field: "create_time", time_from: inicio, time_to: fim, page_size: 100, cursor },
    });
    const list = r.response?.order_list || [];
    orderSns.push(...list.map((o) => o.order_sn));
    cursor = r.response?.next_cursor || "";
    if (!r.response?.more) break;
  } while (cursor);

  let gmv = 0, pedidos = 0;
  for (let i = 0; i < orderSns.length; i += 50) {
    const lote = orderSns.slice(i, i + 50).join(",");
    const d = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
      params: { order_sn_list: lote, response_optional_fields: "total_amount,order_status" },
    });
    (d.response?.order_list || []).forEach((o) => {
      if (STATUS_IGNORADOS.has(String(o.order_status || "").toUpperCase())) return;
      gmv += Number(o.total_amount || 0);
      pedidos += 1;
    });
  }
  return { gmv, pedidos };
}

// Lógica compartilhada entre o agendamento e o disparo manual.
async function rodarSyncVendas() {
  const hoje = dataLocal();
  // Também refaz o dia anterior: a última sincronização do dia acontece antes
  // da meia-noite, então sem isso as últimas vendas do dia ficariam de fora.
  const ontem = dataLocal(new Date(Date.now() - 24 * 3600 * 1000));
  const resultado = [];
  await forEachShop(async ({ cliente, shopId, token }) => {
    for (const dia of [ontem, hoje]) {
      const { gmv, pedidos } = await fetchVendasDoDia(dia, shopId, token);
      await db.collection("sales").doc(`${cliente}_${dia}`).set({
        cliente, data: dia, gmv, pedidos,
        ticketMedio: pedidos ? gmv / pedidos : 0,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (dia === hoje) resultado.push({ cliente, shopId, gmv, pedidos });
    }
  });
  return { dia: hoje, lojas: resultado };
}

export const syncVendas = onSchedule({ schedule: "every 30 minutes", secrets, timeoutSeconds: 540 }, async () => {
  await rodarSyncVendas();
});

// ---------- 4) Ferramentas (promoções ativas) ----------
// IMPORTANTE: cada endpoint da Shopee usa um parâmetro DIFERENTE para filtrar
// as promoções em andamento. Usar "promotion_status" em todos faz os endpoints
// de desconto, cupom e flash sale devolverem erro (ou lista vazia).
const AGORA = () => Math.floor(Date.now() / 1000);

// "04/08 10h" no fuso de Brasília, a partir de um epoch em segundos.
function rotuloHorario(epochSeg) {
  if (!epochSeg) return "sem data";
  const d = new Date(epochSeg * 1000);
  const p = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month} ${p.hour}h`;
}
const emAndamento = (inicio, fim) => {
  const agora = AGORA();
  return inicio && fim && inicio <= agora && agora <= fim;
};
const PROMO_ENDPOINTS = [
  {
    tipo: "desconto", path: "/api/v2/discount/get_discount_list",
    listKey: "discount_list", nameKey: "discount_name",
    params: () => ({ discount_status: "ongoing", page_no: 1, page_size: 100 }),
  },
  {
    tipo: "leve_mais", path: "/api/v2/add_on_deal/get_add_on_deal_list",
    listKey: "add_on_deal_list", nameKey: "add_on_deal_name",
    params: () => ({ promotion_status: "ongoing", page_no: 1, page_size: 100 }),
  },
  {
    tipo: "combo", path: "/api/v2/bundle_deal/get_bundle_deal_list",
    listKey: "bundle_deal_list", nameKey: "name",
    params: () => ({ time_status: 3, page_no: 1, page_size: 100 }), // 3 = ongoing
  },
  {
    tipo: "flash_sale", path: "/api/v2/shop_flash_sale/get_shop_flash_sale_list",
    listKey: "flash_sale_list", nameKey: "timeslot_id",
    params: () => ({ type: 2, start_time: AGORA() - 86400, end_time: AGORA() + 30 * 86400, offset: 0, limit: 100 }),
  },
  {
    tipo: "cupom", path: "/api/v2/voucher/get_voucher_list",
    listKey: "voucher_list", nameKey: "voucher_name",
    params: () => ({ status: "ongoing", page_no: 1, page_size: 100 }),
  },
];

// Retorna { promocoes, erros } — os erros ajudam a diagnosticar cada endpoint.
async function fetchFerramentas(shopId, token) {
  const promocoes = [], erros = {};
  for (const ep of PROMO_ENDPOINTS) {
    try {
      const r = await shopCall(cfg(), {
        path: ep.path, accessToken: token, shopId, params: ep.params(),
      });
      const list = r.response?.[ep.listKey] || [];
      list.forEach((p) => {
        const inicio = Number(p.start_time || 0);
        const fim = Number(p.end_time || 0);
        // A Shopee não dá nome às ofertas relâmpago — só o ID do horário.
        // Monta um rótulo legível a partir da data/hora de início.
        const nome = ep.tipo === "flash_sale"
          ? `Oferta relâmpago · ${rotuloHorario(inicio)}${emAndamento(inicio, fim) ? " · em andamento" : ""}`
          : String(p[ep.nameKey] ?? ep.tipo);
        promocoes.push({ tipo: ep.tipo, nome, inicio, fim });
      });
    } catch (e) {
      erros[ep.tipo] = e.message;
      logger.warn(`ferramenta ${ep.tipo}: ${e.message}`);
    }
  }
  return { promocoes, erros };
}

async function rodarSyncFerramentas() {
  const resultado = [];
  await forEachShop(async ({ cliente, shopId, token }) => {
    const { promocoes, erros } = await fetchFerramentas(shopId, token);
    await db.collection("tools").doc(cliente).set({
      cliente, promocoes, atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    const porTipo = promocoes.reduce((a, p) => { a[p.tipo] = (a[p.tipo] || 0) + 1; return a; }, {});
    resultado.push({ cliente, total: promocoes.length, porTipo, erros });
  });
  return { lojas: resultado };
}

export const syncFerramentas = onSchedule({ schedule: "every 6 hours", secrets, timeoutSeconds: 540 }, async () => {
  await rodarSyncFerramentas();
});

// ---------- 5) Disparo manual dos syncs (protegido por token) ----------
// Uso: /syncAgora?token=SEU_TOKEN            -> roda vendas + ferramentas
//      /syncAgora?token=SEU_TOKEN&o=vendas   -> só vendas
//      /syncAgora?token=SEU_TOKEN&o=tools    -> só ferramentas
export const syncAgora = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const only = String(req.query.o || "");
  try {
    const out = {};
    if (only !== "tools") out.vendas = await rodarSyncVendas();
    if (only !== "vendas") out.ferramentas = await rodarSyncFerramentas();
    res.json({ ok: true, ...out });
  } catch (e) {
    logger.error("syncAgora", e);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// ---------- Preencher histórico de vendas ----------
// Busca na Shopee cada dia do intervalo e grava em "sales". Serve para
// recuperar os dias anteriores ao início da integração.
// Uso: /preencherHistorico?token=SEU_TOKEN&de=2026-07-01&ate=2026-07-31
export const preencherHistorico = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const de = String(req.query.de || ""), ate = String(req.query.ate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    res.status(400).json({ erro: "informe de=YYYY-MM-DD e ate=YYYY-MM-DD" }); return;
  }
  // Lista de dias do intervalo (máx. 31 por chamada, para não estourar o tempo).
  const dias = [];
  for (let t = Date.parse(`${de}T12:00:00${TZ_OFFSET}`); t <= Date.parse(`${ate}T12:00:00${TZ_OFFSET}`); t += 86400000) {
    dias.push(dataLocal(new Date(t)));
    if (dias.length > 31) { res.status(400).json({ erro: "intervalo máximo de 31 dias por chamada" }); return; }
  }
  try {
    const gravados = [];
    await forEachShop(async ({ cliente, shopId, token }) => {
      for (const dia of dias) {
        const { gmv, pedidos } = await fetchVendasDoDia(dia, shopId, token);
        await db.collection("sales").doc(`${cliente}_${dia}`).set({
          cliente, data: dia, gmv, pedidos,
          ticketMedio: pedidos ? gmv / pedidos : 0,
          atualizadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (pedidos > 0) gravados.push({ cliente, dia, gmv: Number(gmv.toFixed(2)), pedidos });
      }
    });
    res.json({
      ok: true,
      intervalo: { de, ate, dias: dias.length },
      diasComVenda: gravados.length,
      totalGmv: Number(gravados.reduce((a, x) => a + x.gmv, 0).toFixed(2)),
      detalhe: gravados,
    });
  } catch (e) {
    logger.error("preencherHistorico", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Auditoria: recalcula N dias direto na API e compara ----------
// Uso: /auditarVendas?token=SEU_TOKEN&dias=7
// Busca de novo na Shopee cada um dos últimos N dias e compara com o que está
// salvo no Firestore, para confirmar que os números batem.
export const auditarVendas = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const dias = Math.min(Number(req.query.dias || 7), 15);
  try {
    const saida = [];
    await forEachShop(async ({ cliente, shopId, token }) => {
      for (let i = 0; i < dias; i++) {
        const dia = dataLocal(new Date(Date.now() - i * 86400000));
        const viaApi = await fetchVendasDoDia(dia, shopId, token);
        const doc = await db.collection("sales").doc(`${cliente}_${dia}`).get();
        const salvo = doc.exists ? doc.data() : null;
        saida.push({
          cliente, dia,
          api: { gmv: Number(viaApi.gmv.toFixed(2)), pedidos: viaApi.pedidos },
          salvo: salvo ? { gmv: Number(Number(salvo.gmv || 0).toFixed(2)), pedidos: Number(salvo.pedidos || 0) } : null,
          confere: salvo
            ? Math.abs(Number(salvo.gmv || 0) - viaApi.gmv) < 0.01 && Number(salvo.pedidos || 0) === viaApi.pedidos
            : viaApi.pedidos === 0,
        });
      }
    });
    const totalApi = saida.reduce((a, x) => a + x.api.gmv, 0);
    res.json({
      ok: true,
      resumo: {
        diasAnalisados: dias,
        totalApi: Number(totalApi.toFixed(2)),
        divergencias: saida.filter((x) => !x.confere).length,
      },
      detalhe: saida,
    });
  } catch (e) {
    logger.error("auditarVendas", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Desconectar uma loja ----------
// Chamado pela dashboard (usuário admin logado). Remove os tokens e marca o
// espelho como desconectado. Exige um ID token válido do Firebase Auth.
export const shopeeDesconectar = onRequest({ secrets, cors: true }, async (req, res) => {
  try {
    const authz = req.headers.authorization || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) { res.status(401).json({ erro: "não autenticado" }); return; }
    const decoded = await getAuth().verifyIdToken(idToken);
    const emp = await db.collection("employees").doc(decoded.uid).get();
    if (!emp.exists || emp.data().role !== "admin") {
      res.status(403).json({ erro: "apenas administradores" }); return;
    }
    const cliente = String(req.query.cliente || req.body?.cliente || "");
    if (!cliente) { res.status(400).json({ erro: "falta cliente" }); return; }
    await db.collection("shopee_auth").doc(cliente).delete();
    await db.collection("integracoes").doc(cliente).set({
      cliente, conectado: false, desconectadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    res.json({ ok: true, cliente });
  } catch (e) {
    logger.error("desconectar", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Diagnóstico das lojas conectadas ----------
export const lojasConectadas = onRequest({ secrets }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const snap = await db.collection("shopee_auth").get();
  res.json({
    total: snap.size,
    lojas: snap.docs.map((d) => {
      const v = d.data();
      return {
        cliente: d.id,
        shopId: v.shopId,
        tokenExpiraEm: v.expiraEm ? new Date(v.expiraEm).toISOString() : null,
        temRefresh: Boolean(v.refreshToken),
      };
    }),
  });
});
