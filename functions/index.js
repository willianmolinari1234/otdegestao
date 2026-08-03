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
  buildAuthUrl, getAccessToken, refreshAccessToken, shopCall, shopPost,
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

// (debugKey removido: era um diagnóstico temporário SEM autenticação que
//  expunha o partner_id e o início/fim da chave — informação que ajuda ataques.)

// ---------- Gestão de funcionários (só admin, validado no servidor) ----------
// Substitui o fluxo antigo do front, que criava o usuário pelo navegador e
// trocava de sessão — e que dependia de regras frouxas para funcionar.
async function exigirAdmin(req) {
  const authz = req.headers.authorization || "";
  const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!idToken) return null;
  const decoded = await getAuth().verifyIdToken(idToken);
  const emp = await db.collection("employees").doc(decoded.uid).get();
  if (!emp.exists || emp.data().role !== "admin") return null;
  return decoded;
}

export const criarFuncionario = onRequest({ secrets, cors: ["https://otdegestao.web.app", "https://otdegestao.firebaseapp.com"] }, async (req, res) => {
  try {
    const admin = await exigirAdmin(req);
    if (!admin) { res.status(403).json({ erro: "apenas administradores" }); return; }
    const { nome, email, senha, cor, papel } = req.body || {};
    if (!nome || !email || !senha) { res.status(400).json({ erro: "nome, email e senha são obrigatórios" }); return; }
    if (String(senha).length < 8) { res.status(400).json({ erro: "a senha precisa de pelo menos 8 caracteres" }); return; }
    const role = papel === "admin" ? "admin" : "emp";
    const user = await getAuth().createUser({ email: String(email), password: String(senha), displayName: String(nome) });
    const ini = String(nome).split(" ").slice(0, 2).map((x) => x[0] || "").join("").toUpperCase() || "?";
    await db.collection("employees").doc(user.uid).set({
      id: user.uid, name: String(nome), ini, color: cor || "#ea580c", email: String(email), role,
    });
    res.json({ ok: true, uid: user.uid });
  } catch (e) {
    logger.error("criarFuncionario", e);
    const msg = e.code === "auth/email-already-exists" ? "Este e-mail já está em uso." : e.message;
    res.status(500).json({ erro: msg });
  }
});

export const removerFuncionario = onRequest({ secrets, cors: ["https://otdegestao.web.app", "https://otdegestao.firebaseapp.com"] }, async (req, res) => {
  try {
    const admin = await exigirAdmin(req);
    if (!admin) { res.status(403).json({ erro: "apenas administradores" }); return; }
    // Aceita uid OU email — o email cobre contas órfãs do Auth que nunca
    // tiveram cadastro de funcionário (ex.: contas de teste antigas).
    let uid = String(req.query.uid || req.body?.uid || "");
    const email = String(req.query.email || req.body?.email || "");
    if (!uid && email) {
      const u = await getAuth().getUserByEmail(email).catch(() => null);
      if (!u) { res.status(404).json({ erro: "e-mail não encontrado no Auth" }); return; }
      uid = u.uid;
    }
    if (!uid) { res.status(400).json({ erro: "falta uid ou email" }); return; }
    if (uid === admin.uid) { res.status(400).json({ erro: "não é possível remover a si mesmo" }); return; }
    await db.collection("employees").doc(uid).delete().catch(() => {});
    await getAuth().deleteUser(uid).catch(() => {});
    res.json({ ok: true, uid });
  } catch (e) {
    logger.error("removerFuncionario", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- 1) Link de autorização (só admin, com estado assinado) ----------
// O antigo shopeeAuthLink era público: qualquer pessoa podia gerar um link
// válido para QUALQUER cliente e autorizar a própria loja no lugar dele
// (sequestro do OAuth / poluição de dados). Agora:
//   1. só um admin logado gera o link;
//   2. o link carrega um "st" = HMAC(cliente), que o callback confere.
// Sem o st correto, o callback rejeita — links não podem ser forjados.
import crypto from "node:crypto";

function assinarEstado(cliente) {
  const chave = (process.env.SYNC_TOKEN || "").trim();
  return crypto.createHmac("sha256", chave).update(String(cliente)).digest("hex").slice(0, 32);
}
function estadoValido(cliente, st) {
  const esperado = assinarEstado(cliente);
  const a = Buffer.from(String(st || ""));
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const linkAutorizacao = onRequest(
  { secrets, cors: ["https://otdegestao.web.app", "https://otdegestao.firebaseapp.com"], maxInstances: 5 },
  async (req, res) => {
    try {
      const admin = await exigirAdmin(req);
      if (!admin) { res.status(403).json({ erro: "apenas administradores" }); return; }
      const cliente = String(req.query.cliente || "");
      if (!cliente) { res.status(400).json({ erro: "falta cliente" }); return; }
      const st = assinarEstado(cliente);
      const redirectUri = `${callbackUrl()}?cliente=${encodeURIComponent(cliente)}&st=${st}`;
      res.json({ url: buildAuthUrl({ ...cfg(), redirectUri }) });
    } catch (e) {
      logger.error("linkAutorizacao", e);
      res.status(500).json({ erro: e.message });
    }
  }
);

// ---------- 2) Callback do OAuth ----------
export const shopeeCallback = onRequest({ secrets, maxInstances: 10 }, async (req, res) => {
  const { code, shop_id: shopId, cliente, st } = req.query;
  if (!code || !shopId || !cliente) { res.status(400).send("Parâmetros ausentes."); return; }
  // Só aceita callbacks de links emitidos por um admin (estado assinado).
  if (!estadoValido(cliente, st)) {
    logger.warn("callback com estado inválido", { cliente });
    res.status(403).send("Link de autorização inválido ou expirado. Gere um novo na tela Integrações.");
    return;
  }
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
    // Também agenda a recuperação do histórico: sem isso a loja só teria os
    // dados de hoje, e os períodos longos apareceriam errados.
    await db.collection("integracoes").doc(String(cliente)).set({
      cliente: String(cliente),
      shopId: Number(shopId),
      conectado: true,
      conectadoEm: FieldValue.serverTimestamp(),
      historicoDe: INICIO_HISTORICO(),   // até onde voltar
      historicoProximo: dataLocal(),     // por onde a recuperação continua
      historicoCompleto: false,
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

// Processa as lojas em paralelo, com limite de simultaneidade.
// Sequencial não escala: com 54 lojas o sync levaria ~13 min e estouraria o
// limite de 9 min da função. Com 6 de cada vez, cai para ~2 min.
// O limite existe para não sobrecarregar a API da Shopee (rate limit).
const SIMULTANEAS = 6;

// Aceita filtrar uma loja específica (útil para reprocessar só a nova).
async function forEachShop(fn, { cliente = null } = {}) {
  const snap = await db.collection("shopee_auth").get();
  const docs = cliente ? snap.docs.filter((d) => d.id === cliente) : snap.docs;

  const fila = [...docs];
  const trabalhador = async () => {
    while (fila.length) {
      const doc = fila.shift();
      if (!doc) return;
      try {
        const data = doc.data();
        const token = await ensureToken(doc.ref, data);
        await fn({ cliente: doc.id, shopId: data.shopId, token });
      } catch (e) {
        logger.error("shop " + doc.id, e);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SIMULTANEAS, docs.length) }, trabalhador)
  );
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

  // Status de cada pedido. Guardamos por order_sn porque o faturamento (vindo
  // do escrow) precisa ignorar os NÃO PAGOS: a Shopee só conta "pedidos pagos"
  // no Vendas, mas o escrow devolve o pedido mesmo antes do pagamento.
  const statusPorSn = new Map();
  let pedidos = 0, totalPago = 0;
  for (let i = 0; i < orderSns.length; i += 50) {
    const d = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
      params: { order_sn_list: orderSns.slice(i, i + 50).join(","), response_optional_fields: "total_amount,order_status" },
    });
    (d.response?.order_list || []).forEach((o) => {
      const st = String(o.order_status || "").toUpperCase();
      statusPorSn.set(o.order_sn, st);
      if (STATUS_IGNORADOS.has(st)) return;
      pedidos += 1;
      totalPago += n(o.total_amount);
    });
  }

  // Faturamento: usa a API financeira (escrow), única que expõe os descontos
  // custeados pelo vendedor. Fórmula idêntica à do Seller Centre:
  //   Vendas = preço de venda − desconto do vendedor
  // onde "desconto do vendedor" = cupom da loja + cashback em moedas custeado
  // pelo vendedor (dois campos distintos: um cupom comum cai em
  // voucher_from_seller, um cupom de cashback cai em seller_coin_cash_back).
  // Pedidos cancelados vêm zerados no escrow, então saem naturalmente.
  let gmv = 0, comissao = 0, taxaServico = 0, liquido = 0, cupons = 0, cashback = 0, freteComprador = 0;
  for (let i = 0; i < orderSns.length; i += 50) {
    const r = await shopPost(cfg(), {
      path: "/api/v2/payment/get_escrow_detail_batch", accessToken: token, shopId,
      body: { order_sn_list: orderSns.slice(i, i + 50) },
    });
    (r.response || []).forEach((item) => {
      const inc = item?.escrow_detail?.order_income;
      if (!inc) return;
      // Pedido ainda não pago não entra no faturamento (a Shopee também não conta).
      if (statusPorSn.get(item.order_sn) === "UNPAID") return;
      const desconto = n(inc.voucher_from_seller) + n(inc.seller_coin_cash_back);
      gmv += n(inc.order_selling_price) - desconto;
      freteComprador += n(inc.buyer_paid_shipping_fee);
      cupons += n(inc.voucher_from_seller);
      cashback += n(inc.seller_coin_cash_back);
      comissao += n(inc.commission_fee);
      taxaServico += n(inc.service_fee);
      liquido += n(inc.escrow_amount);
    });
  }

  const r2 = (v) => Number(v.toFixed(2));
  return {
    gmv: r2(gmv),                       // igual ao "Vendas" do Seller Centre
    totalPago: r2(totalPago),           // total pago pelo comprador (com frete)
    // Frete vem direto do escrow. Antes era deduzido por subtração e dava
    // negativo quando havia moedas/descontos que não entram nessa conta.
    frete: r2(freteComprador),
    cupons: r2(cupons),
    cashback: r2(cashback),
    comissao: r2(comissao),
    taxaServico: r2(taxaServico),
    liquido: r2(liquido),               // escrow: o que cai na conta
    pedidos,
  };
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
      const v = await fetchVendasDoDia(dia, shopId, token);
      await db.collection("sales").doc(`${cliente}_${dia}`).set({
        cliente, data: dia, ...v,
        ticketMedio: v.pedidos ? v.gmv / v.pedidos : 0,
        atualizadoEm: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (dia === hoje) resultado.push({ cliente, shopId, ...v });
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

// ---------- FINANCEIRO (repasse / escrow) ----------------------------------
// Fonte da verdade para fechamento: o quanto de fato entra na conta.
// get_escrow_detail_batch traz, por pedido, o bruto pago pelo comprador, as
// comissões e taxas da Shopee, e o líquido a receber (escrow_amount).

// Lista os order_sn de um dia (mesma janela usada nas vendas).
async function pedidosDoDia(dia, shopId, token) {
  const { inicio, fim } = limitesDoDia(dia);
  if (fim <= inicio) return [];
  let cursor = "", sns = [];
  do {
    const r = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_list", accessToken: token, shopId,
      params: { time_range_field: "create_time", time_from: inicio, time_to: fim, page_size: 100, cursor },
    });
    sns.push(...(r.response?.order_list || []).map((o) => o.order_sn));
    cursor = r.response?.next_cursor || "";
    if (!r.response?.more) break;
  } while (cursor);
  return sns;
}

const n = (v) => Number(v || 0);

// Repasse de um dia: soma o detalhamento financeiro de cada pedido.
async function fetchFinanceiroDoDia(dia, shopId, token) {
  const sns = await pedidosDoDia(dia, shopId, token);
  const tot = {
    pedidos: 0,
    bruto: 0,          // valor dos produtos (antes de taxas)
    pagoPeloComprador: 0,
    comissao: 0,       // comissão da Shopee
    taxaServico: 0,    // taxa de serviço / programas
    taxaTransacao: 0,  // taxa de transação (pagamento)
    freteComprador: 0,
    freteReal: 0,
    descontoVendedor: 0,
    descontoShopee: 0,
    liquido: 0,        // escrow_amount — o que cai na conta
  };
  const amostra = [];
  for (let i = 0; i < sns.length; i += 50) {
    // Atenção: este endpoint é POST e exige order_sn_list como ARRAY, ao
    // contrário do get_order_detail, que é GET com os SNs separados por vírgula.
    const r = await shopPost(cfg(), {
      path: "/api/v2/payment/get_escrow_detail_batch", accessToken: token, shopId,
      body: { order_sn_list: sns.slice(i, i + 50) },
    });
    const lista = r.response || [];
    lista.forEach((item) => {
      const inc = item?.escrow_detail?.order_income;
      if (!inc) return;
      tot.pedidos += 1;
      tot.bruto += n(inc.original_price) - n(inc.seller_discount);
      tot.pagoPeloComprador += n(inc.buyer_total_amount);
      tot.comissao += n(inc.commission_fee);
      tot.taxaServico += n(inc.service_fee);
      tot.taxaTransacao += n(inc.seller_transaction_fee);
      tot.freteComprador += n(inc.buyer_paid_shipping_fee);
      tot.freteReal += n(inc.actual_shipping_fee);
      tot.descontoVendedor += n(inc.seller_discount);
      tot.descontoShopee += n(inc.shopee_discount);
      tot.liquido += n(inc.escrow_amount);
      tot.cupomVendedor = n(tot.cupomVendedor) + n(inc.voucher_from_seller);
      // Uma linha por pedido: o suficiente para conferir cupom a cupom.
      const it = inc.items || [];
      const somaIt = (campo) => it.reduce((a, x) => a + n(x[campo]), 0);
      amostra.push({
        sn: item.order_sn,
        venda: n(inc.order_selling_price),
        cupomPedido: n(inc.voucher_from_seller),
        cupomItens: Number(somaIt("discount_from_voucher_seller").toFixed(2)),
        moedas: Number(somaIt("discount_from_coin").toFixed(2)),
        coins: n(inc.coins),
        cashback: n(inc.seller_coin_cash_back),
        codigo: (inc.seller_voucher_code || []).join(","),
        liquido: n(inc.escrow_amount),
      });
    });
  }
  Object.keys(tot).forEach((k) => { if (k !== "pedidos") tot[k] = Number(tot[k].toFixed(2)); });
  return { ...tot, amostra };
}

// Diagnóstico: /financeiroDia?token=SEU_TOKEN&dia=2026-08-02[&bruto=1]
export const financeiroDia = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const dia = String(req.query.dia || dataLocal());
  // Itera as lojas SEM engolir erros — aqui o erro é justamente o diagnóstico.
  const out = [], erros = [];
  const snap = await db.collection("shopee_auth").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    try {
      const token = await ensureToken(doc.ref, data);
      const f = await fetchFinanceiroDoDia(dia, data.shopId, token);
      if (req.query.bruto !== "1") delete f.amostra;
      out.push({ cliente: doc.id, dia, ...f });
    } catch (e) {
      erros.push({ cliente: doc.id, erro: e.message });
    }
  }
  res.json({
    ok: erros.length === 0,
    resultado: out,
    erros,
    dica: erros.length ? "Erro 'no_permission'/'error_auth' significa que o app não tem o escopo de Payment liberado na Shopee." : undefined,
  });
});

// Grava o financeiro de um intervalo em "financeiro/{cliente}_{dia}".
// Uso: /syncFinanceiro?token=SEU_TOKEN&de=2026-07-01&ate=2026-07-31
export const syncFinanceiro = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const filtroCliente = req.query.cliente ? String(req.query.cliente) : null;
  const de = String(req.query.de || dataLocal()), ate = String(req.query.ate || de);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
    res.status(400).json({ erro: "informe de=YYYY-MM-DD e ate=YYYY-MM-DD" }); return;
  }
  const dias = [];
  for (let t = Date.parse(`${de}T12:00:00${TZ_OFFSET}`); t <= Date.parse(`${ate}T12:00:00${TZ_OFFSET}`); t += 86400000) {
    dias.push(dataLocal(new Date(t)));
    if (dias.length > 31) { res.status(400).json({ erro: "máximo de 31 dias por chamada" }); return; }
  }
  try {
    const gravados = [];
    await forEachShop(async ({ cliente, shopId, token }) => {
      for (const dia of dias) {
        const f = await fetchFinanceiroDoDia(dia, shopId, token);
        delete f.amostra;
        await db.collection("financeiro").doc(`${cliente}_${dia}`).set({
          cliente, data: dia, ...f, atualizadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (f.pedidos > 0) gravados.push({ cliente, dia, bruto: f.bruto, liquido: f.liquido, pedidos: f.pedidos });
      }
    }, { cliente: filtroCliente });
    res.json({ ok: true, intervalo: { de, ate, dias: dias.length }, gravados });
  } catch (e) {
    logger.error("syncFinanceiro", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Comparador: testa variações de critério para bater com a Shopee --
// A Shopee conta "pedidos PAGOS no período". Nós filtramos por data de CRIAÇÃO.
// Este endpoint calcula as duas formas (e com/sem cancelados) para descobrir
// qual reproduz exatamente o número do Seller Centre.
// Uso: /compararVendas?token=SEU_TOKEN&dia=2026-08-02
export const compararVendas = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const dia = String(req.query.dia || dataLocal());
  try {
    const out = [];
    await forEachShop(async ({ cliente, shopId, token }) => {
      const alvo = limitesDoDia(dia);
      const inicioDia = Math.floor(Date.parse(`${dia}T00:00:00${TZ_OFFSET}`) / 1000);
      const fimDia = Math.floor(Date.parse(`${dia}T23:59:59${TZ_OFFSET}`) / 1000);
      // Janela de criação alargada (±2 dias) para pegar pedidos criados fora do
      // dia mas pagos dentro dele.
      let cursor = "", sns = [];
      do {
        const r = await shopCall(cfg(), {
          path: "/api/v2/order/get_order_list", accessToken: token, shopId,
          params: {
            time_range_field: "create_time",
            time_from: alvo.inicio - 2 * 86400, time_to: Math.min(fimDia + 86400, Math.floor(Date.now() / 1000)),
            page_size: 100, cursor,
          },
        });
        sns.push(...(r.response?.order_list || []).map((o) => o.order_sn));
        cursor = r.response?.next_cursor || "";
        if (!r.response?.more) break;
      } while (cursor);

      const todos = [];
      for (let i = 0; i < sns.length; i += 50) {
        const d = await shopCall(cfg(), {
          path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
          params: {
            order_sn_list: sns.slice(i, i + 50).join(","),
            response_optional_fields: "total_amount,order_status,item_list,create_time,pay_time,update_time",
          },
        });
        (d.response?.order_list || []).forEach((o) => {
          const itens = (o.item_list || []).reduce(
            (a, it) => a + Number(it.model_discounted_price || it.model_original_price || 0)
                         * Number(it.model_quantity_purchased || 1), 0);
          todos.push({
            status: String(o.order_status || "").toUpperCase(),
            criado: Number(o.create_time || 0),
            pago: Number(o.pay_time || 0),
            itens: Number(itens.toFixed(2)),
            total: Number(o.total_amount || 0),
          });
        });
      }
      const noDia = (t) => t >= inicioDia && t <= fimDia;
      const calc = (lista) => ({
        pedidos: lista.length,
        produtos: Number(lista.reduce((a, x) => a + x.itens, 0).toFixed(2)),
        totalPago: Number(lista.reduce((a, x) => a + x.total, 0).toFixed(2)),
      });
      const semUnpaid = (x) => x.status !== "UNPAID";
      const semCancel = (x) => !["UNPAID", "CANCELLED", "INVOICE_PENDING"].includes(x.status);

      // Dump bruto dos pedidos indicados (?bruto=1) para inspecionar todos os
      // campos que a Shopee devolve — usado para achar descontos não mapeados.
      let bruto = null;
      if (req.query.bruto === "1") {
        const coletados = [];
        for (let i = 0; i < sns.length; i += 50) {
          const d = await shopCall(cfg(), {
            path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
            params: {
              order_sn_list: sns.slice(i, i + 50).join(","),
              response_optional_fields: "total_amount,order_status,item_list,create_time,pay_time,payment_method",
            },
          });
          coletados.push(...(d.response?.order_list || []));
        }
        // Só os pedidos DO DIA pedido, resumidos item a item.
        bruto = coletados
          .filter((o) => noDia(Number(o.create_time || 0)))
          .map((o) => ({
            sn: o.order_sn,
            status: o.order_status,
            total_amount: o.total_amount,
            itens: (o.item_list || []).map((it) => ({
              nome: String(it.item_name || "").slice(0, 40),
              qtd: it.model_quantity_purchased,
              preco_com_desconto: it.model_discounted_price,
              preco_original: it.model_original_price,
              promo: it.promotion_type,
              promos: it.promotion_list,
            })),
          }));
      }

      out.push({
        cliente, dia,
        bruto,
        A_criacao_sem_cancelados: calc(todos.filter((x) => noDia(x.criado) && semCancel(x))),
        B_criacao_com_cancelados: calc(todos.filter((x) => noDia(x.criado) && semUnpaid(x))),
        C_pagamento_sem_cancelados: calc(todos.filter((x) => noDia(x.pago) && semCancel(x))),
        D_pagamento_com_cancelados: calc(todos.filter((x) => noDia(x.pago) && semUnpaid(x))),
        statusEncontrados: [...new Set(todos.map((x) => x.status))],
      });
    });
    res.json({ ok: true, resultado: out });
  } catch (e) {
    logger.error("compararVendas", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Inspeção: composição do valor dos pedidos de um dia ----------
// Mostra, pedido a pedido, os campos que compõem o total — para entender a
// diferença entre o nosso GMV e o "Vendas" do Seller Centre.
// Uso: /inspecionarPedidos?token=SEU_TOKEN&dia=2026-08-02
export const inspecionarPedidos = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const dia = String(req.query.dia || dataLocal());
  try {
    const saida = [];
    await forEachShop(async ({ cliente, shopId, token }) => {
      const { inicio, fim } = limitesDoDia(dia);
      let cursor = "", sns = [];
      do {
        const r = await shopCall(cfg(), {
          path: "/api/v2/order/get_order_list", accessToken: token, shopId,
          params: { time_range_field: "create_time", time_from: inicio, time_to: fim, page_size: 100, cursor },
        });
        sns.push(...(r.response?.order_list || []).map((o) => o.order_sn));
        cursor = r.response?.next_cursor || "";
        if (!r.response?.more) break;
      } while (cursor);

      const pedidos = [];
      for (let i = 0; i < sns.length; i += 50) {
        const d = await shopCall(cfg(), {
          path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
          params: {
            order_sn_list: sns.slice(i, i + 50).join(","),
            response_optional_fields: "total_amount,order_status,actual_shipping_fee,estimated_shipping_fee,item_list,voucher_from_seller,voucher_from_shopee,seller_discount,shopee_discount,payment_method",
          },
        });
        (d.response?.order_list || []).forEach((o) => {
          const itens = (o.item_list || []).reduce(
            (a, it) => a + Number(it.model_discounted_price || it.model_original_price || 0) * Number(it.model_quantity_purchased || 1), 0);
          const itensOriginal = (o.item_list || []).reduce(
            (a, it) => a + Number(it.model_original_price || 0) * Number(it.model_quantity_purchased || 1), 0);
          pedidos.push({
            status: o.order_status,
            total_amount: Number(o.total_amount || 0),
            frete_real: Number(o.actual_shipping_fee || 0),
            frete_estimado: Number(o.estimated_shipping_fee || 0),
            soma_itens: Number(itens.toFixed(2)),
            soma_itens_original: Number(itensOriginal.toFixed(2)),
            voucher_vendedor: Number(o.voucher_from_seller || 0),
            voucher_shopee: Number(o.voucher_from_shopee || 0),
            desconto_vendedor: Number(o.seller_discount || 0),
            desconto_shopee: Number(o.shopee_discount || 0),
          });
        });
      }
      const validos = pedidos.filter((p) => !STATUS_IGNORADOS.has(String(p.status || "").toUpperCase()));
      const som = (f) => Number(validos.reduce((a, p) => a + p[f], 0).toFixed(2));
      saida.push({
        cliente, dia, pedidos: validos.length,
        totais: {
          total_amount: som("total_amount"),
          soma_itens: som("soma_itens"),
          soma_itens_original: som("soma_itens_original"),
          voucher_vendedor: som("voucher_vendedor"),
          voucher_shopee: som("voucher_shopee"),
          desconto_vendedor: som("desconto_vendedor"),
          desconto_shopee: som("desconto_shopee"),
          itens_menos_voucher_vendedor: Number((som("soma_itens") - som("voucher_vendedor")).toFixed(2)),
          itens_menos_todos_vouchers: Number((som("soma_itens") - som("voucher_vendedor") - som("voucher_shopee")).toFixed(2)),
        },
        amostra: validos,
      });
    });
    res.json({ ok: true, resultado: saida });
  } catch (e) {
    logger.error("inspecionarPedidos", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Preencher histórico de vendas ----------
// Busca na Shopee cada dia do intervalo e grava em "sales". Serve para
// recuperar os dias anteriores ao início da integração.
// Uso: /preencherHistorico?token=SEU_TOKEN&de=2026-07-01&ate=2026-07-31
export const preencherHistorico = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const filtroCliente = req.query.cliente ? String(req.query.cliente) : null;
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
    // ?cliente=ID processa só aquela loja (ex.: uma recém-conectada).
    await forEachShop(async ({ cliente, shopId, token }) => {
      for (const dia of dias) {
        const v = await fetchVendasDoDia(dia, shopId, token);
        const ref = db.collection("sales").doc(`${cliente}_${dia}`);
        if (v.pedidos === 0) {
          // Dia sem vendas não vira documento — evita encher a coleção de
          // zeros ao sondar períodos anteriores à existência da loja.
          await ref.delete().catch(() => {});
          continue;
        }
        await ref.set({
          cliente, data: dia, ...v,
          ticketMedio: v.gmv / v.pedidos,
          atualizadoEm: FieldValue.serverTimestamp(),
        }, { merge: true });
        gravados.push({ cliente, dia, gmv: v.gmv, liquido: v.liquido, pedidos: v.pedidos });
      }
    }, { cliente: filtroCliente });
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

// ---------- Recuperação automática do histórico ----------
// Toda loja recém-conectada só teria os dados de hoje. Esta rotina volta no
// tempo, dia a dia, até 1º de junho do ano corrente.
// Roda em blocos pequenos para nunca estourar o tempo da função: cada execução
// processa alguns dias por loja e guarda por onde parou.
const INICIO_HISTORICO = () => `${new Date().getFullYear()}-06-01`;
// 4 dias × 5 lojas = 20 buscas por execução (~2,5 min), com folga no limite de 9.
const DIAS_POR_EXECUCAO = 4;
const LOJAS_POR_EXECUCAO = 5;

async function recuperarHistoricoPendente() {
  const pend = await db.collection("integracoes")
    .where("historicoCompleto", "==", false).limit(LOJAS_POR_EXECUCAO).get();
  if (pend.empty) return { lojas: 0, dias: 0 };

  let totalDias = 0;
  const resumo = [];
  for (const docInt of pend.docs) {
    const info = docInt.data();
    const cliente = docInt.id;
    const limite = info.historicoDe || INICIO_HISTORICO();
    let cursor = info.historicoProximo || dataLocal();

    // Monta os próximos dias a processar, andando para trás.
    const dias = [];
    while (dias.length < DIAS_POR_EXECUCAO && cursor >= limite) {
      dias.push(cursor);
      const d = new Date(`${cursor}T12:00:00${TZ_OFFSET}`);
      d.setDate(d.getDate() - 1);
      cursor = dataLocal(d);
    }
    if (!dias.length) {
      await docInt.ref.set({ historicoCompleto: true }, { merge: true });
      continue;
    }

    let gravados = 0;
    await forEachShop(async ({ shopId, token }) => {
      for (const dia of dias) {
        try {
          const v = await fetchVendasDoDia(dia, shopId, token);
          const ref = db.collection("sales").doc(`${cliente}_${dia}`);
          if (v.pedidos === 0) { await ref.delete().catch(() => {}); continue; }
          await ref.set({
            cliente, data: dia, ...v,
            ticketMedio: v.gmv / v.pedidos,
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });
          gravados += 1;
        } catch (e) {
          logger.warn(`historico ${cliente} ${dia}: ${e.message}`);
        }
      }
    }, { cliente });

    totalDias += dias.length;
    await docInt.ref.set({
      historicoProximo: cursor,
      historicoCompleto: cursor < limite,
      historicoAtualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    resumo.push({ cliente, dias: dias.length, comVenda: gravados, proximo: cursor, completo: cursor < limite });
  }
  return { lojas: pend.size, dias: totalDias, resumo };
}

// A cada 5 minutos, avança um pouco na recuperação de quem ainda tem pendência.
export const syncHistorico = onSchedule(
  { schedule: "every 5 minutes", secrets, timeoutSeconds: 540 },
  async () => { await recuperarHistoricoPendente(); }
);

// Disparo manual / enfileirar lojas já conectadas:
//   /recuperarHistorico?token=SEU_TOKEN            -> processa um bloco agora
//   /recuperarHistorico?token=SEU_TOKEN&reiniciar=1 -> reagenda TODAS as lojas
export const recuperarHistorico = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  try {
    if (req.query.reiniciar === "1") {
      const auth = await db.collection("shopee_auth").get();
      for (const d of auth.docs) {
        await db.collection("integracoes").doc(d.id).set({
          cliente: d.id, conectado: true,
          historicoDe: INICIO_HISTORICO(),
          historicoProximo: dataLocal(),
          historicoCompleto: false,
        }, { merge: true });
      }
    }
    const r = await recuperarHistoricoPendente();
    res.json({ ok: true, ...r });
  } catch (e) {
    logger.error("recuperarHistorico", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Sincronizar agora (botão da dashboard) ----------
// Igual ao syncAgora, mas autenticado pelo login do sistema em vez de token —
// assim o botão pode viver no front sem expor o SYNC_TOKEN.
export const syncPeloApp = onRequest({ secrets, cors: ["https://otdegestao.web.app", "https://otdegestao.firebaseapp.com"], timeoutSeconds: 540 }, async (req, res) => {
  try {
    const authz = req.headers.authorization || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) { res.status(401).json({ erro: "não autenticado" }); return; }
    const decoded = await getAuth().verifyIdToken(idToken);
    const emp = await db.collection("employees").doc(decoded.uid).get();
    if (!emp.exists || emp.data().role !== "admin") {
      res.status(403).json({ erro: "apenas administradores" }); return;
    }
    const vendas = await rodarSyncVendas();
    const ferramentas = await rodarSyncFerramentas();
    res.json({
      ok: true,
      lojas: vendas.lojas.length,
      pedidos: vendas.lojas.reduce((a, l) => a + (l.pedidos || 0), 0),
      faturamento: Number(vendas.lojas.reduce((a, l) => a + (l.gmv || 0), 0).toFixed(2)),
      promocoes: ferramentas.lojas.reduce((a, l) => a + (l.total || 0), 0),
    });
  } catch (e) {
    logger.error("syncPeloApp", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Desconectar uma loja ----------
// Chamado pela dashboard (usuário admin logado). Remove os tokens e marca o
// espelho como desconectado. Exige um ID token válido do Firebase Auth.
export const shopeeDesconectar = onRequest({ secrets, cors: ["https://otdegestao.web.app", "https://otdegestao.firebaseapp.com"] }, async (req, res) => {
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
