// Backend do OTDE — App 1 (categoria "ERP System"): vendas + ferramentas.
// Cloud Functions (2ª geração). Requer plano Blaze no Firebase.
//
// Fluxo de conexão de uma loja:
//   1) /linkAutorizacao  (admin)  -> gera o link assinado de autorização
//   2) /shopeeCallback            -> valida a assinatura e salva os tokens
//                                    em shopee_auth/{cliente}
//
// Rotinas automáticas:
//   syncVendas      (30 min) -> vendas do dia em sales/{cliente}_{data}
//   syncFerramentas (6 h)    -> promoções ativas em tools/{cliente}
//   syncHistorico   (5 min)  -> recupera o histórico de lojas novas
//   conferirVendas  (7h BRT) -> reconfere com a Shopee e acusa divergência
//
// Segredos (definir com: firebase functions:secrets:set NOME):
//   SHOPEE_PARTNER_KEY   (o resto fica em functions/.env)

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
import {
  compararDia, detectarQuedas, montarResumo, diasParaConferir,
} from "./conferencia.js";

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

// ---------- Bloquear auto-cadastro no Firebase Auth ----------
// Mesmo com as regras fechadas, qualquer pessoa ainda conseguia CRIAR uma
// conta no Auth (ela não acessaria nada, mas polui a base e é degrau para
// outros ataques). Isto desliga o cadastro público — contas passam a ser
// criadas só pelo Admin SDK, em criarFuncionario.
// Equivale a: Authentication > Settings > User actions > Enable create (OFF).
export const bloquearAutoCadastro = onRequest(
  { secrets, cors: ["https://otdegestao.web.app", "https://otdegestao.firebaseapp.com"] },
  async (req, res) => {
    try {
      const admin = await exigirAdmin(req);
      if (!admin) { res.status(403).json({ erro: "apenas administradores" }); return; }
      const desligar = req.query.reverter !== "1";

      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
      const projeto = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
      const cliente = await auth.getClient();
      const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projeto}/config`
                + `?updateMask=client.permission.disabledUserSignup`;
      const r = await cliente.request({
        url, method: "PATCH",
        data: { client: { permission: { disabledUserSignup: desligar } } },
      });
      res.json({
        ok: true,
        autoCadastroBloqueado: r.data?.client?.permission?.disabledUserSignup === true,
        detalhe: r.data?.client?.permission || null,
      });
    } catch (e) {
      logger.error("bloquearAutoCadastro", e);
      res.status(500).json({ erro: e.message, dica: "Se faltar permissão, a conta de serviço precisa do papel Firebase Authentication Admin." });
    }
  }
);

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

// Converte para número tratando null/undefined como zero.
const n = (v) => Number(v || 0);

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
  // Itens vendidos, agrupados por código. Serve para cruzar com o custo da
  // planilha. Agrupado (e não linha a linha) porque uma loja movimentada faria
  // o documento do dia crescer sem necessidade — o que interessa é quanto de
  // cada código saiu.
  const porSku = new Map();
  let pedidos = 0, totalPago = 0;
  for (let i = 0; i < orderSns.length; i += 50) {
    const d = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
      // item_list entra na MESMA chamada que já fazíamos: nenhum pedido extra
      // à Shopee, nenhum custo novo.
      params: { order_sn_list: orderSns.slice(i, i + 50).join(","), response_optional_fields: "total_amount,order_status,item_list" },
    });
    (d.response?.order_list || []).forEach((o) => {
      const st = String(o.order_status || "").toUpperCase();
      statusPorSn.set(o.order_sn, st);
      if (STATUS_IGNORADOS.has(st)) return;
      pedidos += 1;
      totalPago += n(o.total_amount);

      // (os itens vêm da API financeira, mais abaixo — ver comentário lá)
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
      // ATENÇÃO — esta linha NÃO filtra nada. A API financeira não devolve
      // order_sn, então `item.order_sn` é indefinido e a comparação é sempre
      // falsa. Descoberto ao investigar a soma dos itens (46 pedidos vieram
      // com status "?" no diagnóstico).
      //
      // O faturamento continua certo porque pedido não pago e cancelado vêm
      // ZERADOS no escrow — é o zero que filtra, não esta linha. Mantida
      // apenas como registro: mexer nela sem entender isso pode alterar um
      // número que hoje bate com o Seller Centre.
      if (statusPorSn.get(item.order_sn) === "UNPAID") return;
      const desconto = n(inc.voucher_from_seller) + n(inc.seller_coin_cash_back);
      gmv += n(inc.order_selling_price) - desconto;
      freteComprador += n(inc.buyer_paid_shipping_fee);
      cupons += n(inc.voucher_from_seller);
      cashback += n(inc.seller_coin_cash_back);
      comissao += n(inc.commission_fee);
      taxaServico += n(inc.service_fee);
      liquido += n(inc.escrow_amount);

      // ---- Valor por produto, da MESMA fonte do faturamento ----
      // Antes o valor por item vinha de get_order_detail, que devolve o preço
      // que o COMPRADOR pagou. Em promoção subsidiada pela Shopee o vendedor
      // recebe mais, e a soma dos itens ficava 10-19% abaixo do faturamento —
      // fazendo produto lucrativo parecer prejuízo na tela.
      //
      // Aqui é a mesma conta do faturamento, só que por item:
      //   valor = preço de venda − cupom do vendedor − moedas do vendedor
      // O subsídio da Shopee (discount_from_voucher_shopee) NÃO é descontado,
      // porque o vendedor recebe essa parte.
      // Pedido cancelado vem ZERADO no total, então sai sozinho do
      // faturamento — mas os ITENS dele continuam vindo com preço cheio.
      //
      // A guarda usa o PRÓPRIO total do pedido, e não o status, porque a API
      // financeira não devolve order_sn: qualquer filtro por status compara
      // com indefinido e nunca dispara. Foi assim que a primeira tentativa
      // falhou sem dar erro — o diagnóstico pedido a pedido mostrou 46
      // pedidos com status "?" e o campo sn ausente.
      //
      // Regra: pedido que não entrou no faturamento não entra nos itens.
      if (n(inc.order_selling_price) <= 0) return;

      for (const it of (inc.items || [])) {
        const s = String(it.item_sku || "").trim();
        const m = String(it.model_sku || "").trim();
        // O ID do anúncio vem sempre, com ou sem SKU — chave reserva para
        // quem identifica o produto pelo link do anúncio na planilha.
        const id = String(it.item_id || "").trim();
        const q = n(it.quantity_purchased) || 1;
        // selling_price já é o total DA LINHA, não o preço unitário.
        // Multiplicar por quantidade inflava a soma em 10% a 20% — e foi
        // assim que descobrimos: itensConferem acusou o dia inteiro.
        // A prova está no pedido da sondagem: dois itens de quantidade 1
        // somando 49,90 + 72,99 = 122,89, exatamente o order_selling_price.
        const bruto = n(it.selling_price);
        const descontoVendedor = n(it.discount_from_voucher_seller) + n(it.discount_from_coin);
        const chave = `${s}|${m}|${id}`;
        const reg = porSku.get(chave) || { s, m, i: id, q: 0, v: 0, n: String(it.item_name || "").slice(0, 70) };
        reg.q += q;
        reg.v += bruto - descontoVendedor;
        porSku.set(chave, reg);
      }
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
    // Itens por código, para cruzar com o custo da planilha.
    //   s = código do anúncio (item_sku) · m = código da variação (model_sku)
    //   i = ID do anúncio · q = quantidade · v = valor · n = nome
    //
    // `v` sai da MESMA conta do `gmv`, só que por item, então a soma dos itens
    // fecha com o faturamento do dia. `itensConferem` registra isso: se um dia
    // deixar de fechar, é sinal de mudança na API e aparece sem ninguém caçar.
    itens: [...porSku.values()].map((x) => ({ ...x, v: r2(x.v) })),
    itensSoma: r2([...porSku.values()].reduce((a, x) => a + x.v, 0)),
    // Tolerância relativa: cada item é arredondado em 2 casas, e um dia com
    // dezenas de itens acumula centavos. Exigir exatidão faria o dia ser
    // reprocessado para sempre por causa de arredondamento.
    itensConferem: Math.abs([...porSku.values()].reduce((a, x) => a + x.v, 0) - gmv)
      <= Math.max(0.05, Math.abs(gmv) * 0.001),
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

// ---------- Preencher os itens vendidos no histórico ----------
// Os dias antigos foram gravados antes de o sistema pedir item_list à Shopee,
// então não têm código de produto nem ID de anúncio — e sem isso não há como
// cruzar com o custo. Esta rotina volta no tempo e recompõe, loja por loja.
//
// É automática de propósito: são 17 lojas × 60 dias. Disparar uma por uma na
// mão consome a atenção de alguém e alguém sempre esquece uma.
const DIAS_ITENS = 60;          // janela suficiente para preço e margem
const DIAS_ITENS_POR_EXEC = 5;  // por loja, por execução
const LOJAS_ITENS_POR_EXEC = 5;

async function completarItensPendente() {
  const pend = await db.collection("integracoes")
    .where("itensCompletos", "==", false).limit(LOJAS_ITENS_POR_EXEC).get();
  if (pend.empty) return { lojas: 0, dias: 0 };

  let totalDias = 0;
  const resumo = [];
  for (const docInt of pend.docs) {
    const info = docInt.data();
    const cliente = docInt.id;
    const limite = info.itensDe || dataLocal(new Date(Date.now() - DIAS_ITENS * 86400000));
    let cursor = info.itensProximo || dataLocal();

    const dias = [];
    while (dias.length < DIAS_ITENS_POR_EXEC && cursor >= limite) {
      dias.push(cursor);
      const d = new Date(`${cursor}T12:00:00${TZ_OFFSET}`);
      d.setDate(d.getDate() - 1);
      cursor = dataLocal(d);
    }
    if (!dias.length) {
      await docInt.ref.set({ itensCompletos: true }, { merge: true });
      continue;
    }

    let gravados = 0;
    await forEachShop(async ({ shopId, token }) => {
      for (const dia of dias) {
        try {
          const ref = db.collection("sales").doc(`${cliente}_${dia}`);
          const atual = await ref.get();
          // Dia pronto = tem item com ID de anúncio E foi gravado já com o
          // valor vindo da API financeira (marcado por itensConferem).
          // Sem a segunda condição, os dias preenchidos na versão anterior
          // — quando o valor vinha do preço do comprador — nunca seriam
          // refeitos e ficariam com o número errado para sempre.
          // Só considera pronto o dia que FECHOU com o faturamento. Dia que
          // não fecha é dia com conta errada — refazer é o certo, e assim uma
          // correção de fórmula se propaga sozinha pelo histórico.
          const d = atual.exists ? atual.data() : null;
          const pronto = d
            && Array.isArray(d.itens) && d.itens.some((i) => i && i.i)
            && d.itensConferem === true;
          if (pronto) continue;

          const v = await fetchVendasDoDia(dia, shopId, token);
          if (v.pedidos === 0) continue; // dia sem venda: nada a completar

          // Trava contra o erro que já aconteceu (Vic.Ti: R$ 64.484 → 12.824).
          // Esta rotina existe para ACRESCENTAR os itens, não para mudar
          // faturamento. Se o novo valor for muito menor que o guardado, é
          // mais provável ser resposta ruim da API do que a verdade — então
          // não gravamos e registramos para conferir.
          const antes = Number((atual.data() || {}).gmv || 0);
          if (antes > 0 && v.gmv < antes * 0.9) {
            logger.error("itens: recusado por queda suspeita", {
              cliente, dia, antes, agora: v.gmv,
            });
            continue;
          }

          await ref.set({
            cliente, data: dia, ...v,
            ticketMedio: v.gmv / v.pedidos,
            atualizadoEm: FieldValue.serverTimestamp(),
          }, { merge: true });
          gravados += 1;
        } catch (e) {
          logger.warn(`itens ${cliente} ${dia}: ${e.message}`);
        }
      }
    }, { cliente });

    totalDias += dias.length;
    await docInt.ref.set({
      itensProximo: cursor,
      itensCompletos: cursor < limite,
      itensAtualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
    resumo.push({ cliente, dias: dias.length, gravados, proximo: cursor, completo: cursor < limite });
  }
  return { lojas: pend.size, dias: totalDias, resumo };
}

export const syncItens = onSchedule(
  { schedule: "every 5 minutes", secrets, timeoutSeconds: 540 },
  async () => { await completarItensPendente(); }
);

// Enfileira todas as lojas conectadas para o preenchimento dos itens.
//   /completarItens?token=SEU_TOKEN&reiniciar=1
export const completarItens = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  try {
    if (req.query.reiniciar === "1") {
      const auth = await db.collection("shopee_auth").get();
      const de = dataLocal(new Date(Date.now() - DIAS_ITENS * 86400000));
      for (const d of auth.docs) {
        await db.collection("integracoes").doc(d.id).set({
          itensDe: de, itensProximo: dataLocal(), itensCompletos: false,
        }, { merge: true });
      }
      res.json({ ok: true, enfileiradas: auth.size, de });
      return;
    }
    res.json({ ok: true, ...(await completarItensPendente()) });
  } catch (e) {
    logger.error("completarItens", e);
    res.status(500).json({ erro: e.message });
  }
});

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

// ---------- Conferência diária ----------
// A OTDE cobra % sobre o faturamento bruto. Um número errado no sistema vira
// fatura errada, e erro de fatura só aparece quando o cliente reclama.
// Esta rotina faz o sistema desconfiar de si mesmo todo dia:
//
//   1) recalcula os últimos dias direto na Shopee e compara com o salvo;
//   2) compara o total do mês de cada loja com a medição do dia anterior —
//      venda que já aconteceu não some, então queda é sinal de problema.
//
// O resultado fica em conferencias/{data} e aparece no painel.

// Dias FECHADOS conferidos por execução. Hoje fica de fora: a sincronização
// roda a cada 30 min, então o salvo está sempre legitimamente atrás da API
// enquanto o dia corre. Conferir hoje geraria alerta todos os dias.
const DIAS_CONFERIDOS = 3;

/** Total do mês corrente por loja, lido do que está salvo. */
async function totaisDoMesPorLoja() {
  const mes = dataLocal().slice(0, 7); // "2026-08"
  const snap = await db.collection("sales").where("data", ">=", `${mes}-01`).get();
  const totais = {};
  for (const doc of snap.docs) {
    const v = doc.data();
    if (String(v.data || "").slice(0, 7) !== mes) continue;
    totais[v.cliente] = (totais[v.cliente] || 0) + Number(v.gmv || 0);
  }
  return totais;
}

async function rodarConferencia() {
  const hoje = dataLocal();
  const comparacoes = [];

  // Dias FECHADOS apenas. O dia em curso ainda está sendo sincronizado.
  const dias = diasParaConferir(hoje, DIAS_CONFERIDOS);

  await forEachShop(async ({ cliente, shopId, token }) => {
    for (const dia of dias) {
      const api = await fetchVendasDoDia(dia, shopId, token);
      const ref = db.collection("sales").doc(`${cliente}_${dia}`);
      const doc = await ref.get();
      const salvo = doc.exists ? doc.data() : null;
      const r = compararDia(api, salvo);

      // Divergiu num dia FECHADO: a Shopee é a fonte, o nosso número é cópia.
      // Quase sempre é pedido cancelado ou devolvido DEPOIS da sincronização
      // daquele dia — a cópia envelheceu. Corrigimos para o valor da Shopee,
      // que é o mesmo que você vê no Seller Centre e o que deve ser cobrado.
      //
      // A correção é REGISTRADA, não silenciosa: o alerta mostra o valor
      // antigo e o novo. O importante não é só ter o número certo agora, é
      // você saber que ele mudou depois — se já cobrou, precisa acertar.
      // A guarda `api.pedidos > 0` é proposital: se a Shopee devolver um dia
      // vazio onde temos venda registrada, NÃO apagamos. Pode ser instabilidade
      // da API, e zerar faturamento por causa de uma resposta ruim seria bem
      // pior do que conviver com um alerta. Nesse caso só avisamos.
      if (!r.confere && api.pedidos > 0) {
        await ref.set({
          cliente, data: dia, ...api,
          ticketMedio: api.pedidos ? api.gmv / api.pedidos : 0,
          atualizadoEm: FieldValue.serverTimestamp(),
          corrigidoPelaConferencia: hoje,
        }, { merge: true });
      }

      comparacoes.push({
        cliente, dia,
        api: { gmv: Number(api.gmv.toFixed(2)), pedidos: api.pedidos },
        salvo: salvo ? { gmv: Number(Number(salvo.gmv || 0).toFixed(2)), pedidos: Number(salvo.pedidos || 0) } : null,
        confere: r.confere,
        tipo: r.tipo,
        diferenca: Number(r.diferenca.toFixed(2)),
        corrigido: !r.confere && api.pedidos > 0,
      });
    }
  });

  // Queda no mês: compara com a medição da última conferência.
  const totaisHoje = await totaisDoMesPorLoja();
  const anterior = await db.collection("conferencias")
    .orderBy("data", "desc").limit(1).get();
  const totaisAntes = anterior.empty ? {} : (anterior.docs[0].data().totaisDoMes || {});

  // Só compara dentro do mesmo mês: na virada, o total zera legitimamente.
  const mesmoMes = !anterior.empty
    && String(anterior.docs[0].data().data || "").slice(0, 7) === hoje.slice(0, 7);
  const quedas = mesmoMes ? detectarQuedas(totaisHoje, totaisAntes) : [];

  const resumo = montarResumo({ dia: hoje, comparacoes, quedas });
  await db.collection("conferencias").doc(hoje).set({
    ...resumo,
    totaisDoMes: totaisHoje,
    geradoEm: FieldValue.serverTimestamp(),
  });

  if (!resumo.tudoCerto) {
    logger.error("conferencia: problemas encontrados", {
      divergencias: resumo.divergencias, quedas: resumo.quedas,
    });
  }
  return resumo;
}

export const conferirVendas = onSchedule(
  { schedule: "0 7 * * *", timeZone: "America/Sao_Paulo", secrets, timeoutSeconds: 540 },
  async () => { await rodarConferencia(); }
);

// Mesma conferência sob demanda, para não precisar esperar o horário.
export const conferirAgora = onRequest({ secrets, timeoutSeconds: 540 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  try {
    res.json({ ok: true, ...(await rodarConferencia()) });
  } catch (e) {
    logger.error("conferirAgora", e);
    res.status(500).json({ erro: e.message });
  }
});

// ---------- Sondagem: que SKU a Shopee devolve? ----------
// Existe para responder UMA pergunta antes de construir o cálculo de lucro:
// o código que a Shopee devolve em cada item é o mesmo que o cliente usa na
// planilha de custo? Se não for, cruzar custo com venda vira trabalho manual
// loja por loja, e a funcionalidade muda de tamanho.
//
// Mostra a estrutura BRUTA de um pedido na API financeira (escrow), para
// descobrir se ela traz o valor por item — que é o que o vendedor realmente
// recebe daquele produto, já sem cupom. Se trouxer, some a aproximação de
// distribuir o faturamento proporcionalmente.
// Uso: /amostraEscrow?token=...&cliente=ID
export const amostraEscrow = onRequest({ secrets, timeoutSeconds: 300 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const filtro = req.query.cliente || null;
  let saida = null;
  try {
    await forEachShop(async ({ cliente, shopId, token }) => {
      if (saida) return;
      const { inicio, fim } = limitesDoDia(dataLocal(new Date(Date.now() - 86400000)));
      const l = await shopCall(cfg(), {
        path: "/api/v2/order/get_order_list", accessToken: token, shopId,
        params: { time_range_field: "create_time", time_from: inicio, time_to: fim, page_size: 5, cursor: "" },
      });
      const sns = (l.response?.order_list || []).map((o) => o.order_sn).slice(0, 2);
      if (!sns.length) return;
      const r = await shopPost(cfg(), {
        path: "/api/v2/payment/get_escrow_detail_batch", accessToken: token, shopId,
        body: { order_sn_list: sns },
      });
      const p = (r.response || [])[0];
      const inc = p?.escrow_detail?.order_income;
      saida = {
        cliente,
        order_sn: p?.order_sn,
        // Campos de nível de PEDIDO que já usamos hoje.
        pedido: {
          order_selling_price: inc?.order_selling_price ?? null,
          voucher_from_seller: inc?.voucher_from_seller ?? null,
          seller_coin_cash_back: inc?.seller_coin_cash_back ?? null,
          escrow_amount: inc?.escrow_amount ?? null,
        },
        // O que interessa descobrir: existe detalhe por item?
        temItems: Array.isArray(inc?.items),
        quantosItems: Array.isArray(inc?.items) ? inc.items.length : 0,
        // Primeiro item cru, com todos os campos que a Shopee mandar.
        primeiroItem: Array.isArray(inc?.items) ? inc.items[0] : null,
        camposDoItem: Array.isArray(inc?.items) && inc.items[0] ? Object.keys(inc.items[0]) : [],
      };
    }, { cliente: filtro });
    res.json(saida ? { ok: true, ...saida } : { ok: true, aviso: "nenhum pedido ontem nessa loja" });
  } catch (e) {
    logger.error("amostraEscrow", e);
    res.status(500).json({ erro: e.message });
  }
});

// Reconciliação PEDIDO A PEDIDO de um dia.
// Existe porque eu errei duas vezes tentando explicar a diferença entre o
// faturamento e a soma dos itens só olhando o total do dia. Aqui dá para ver
// qual pedido não fecha e por quê, em vez de formular hipótese.
// Uso: /conferirDia?token=...&cliente=ID&dia=2026-07-23
export const conferirDia = onRequest({ secrets, timeoutSeconds: 300 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const dia = String(req.query.dia || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) { res.status(400).json({ erro: "informe dia=YYYY-MM-DD" }); return; }
  let saida = null;
  try {
    await forEachShop(async ({ cliente, shopId, token }) => {
      if (saida) return;
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

      const status = new Map();
      for (let i = 0; i < sns.length; i += 50) {
        const d = await shopCall(cfg(), {
          path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
          params: { order_sn_list: sns.slice(i, i + 50).join(","), response_optional_fields: "order_status" },
        });
        (d.response?.order_list || []).forEach((o) => status.set(o.order_sn, o.order_status));
      }

      const pedidos = [];
      for (let i = 0; i < sns.length; i += 50) {
        const r = await shopPost(cfg(), {
          path: "/api/v2/payment/get_escrow_detail_batch", accessToken: token, shopId,
          body: { order_sn_list: sns.slice(i, i + 50) },
        });
        (r.response || []).forEach((p) => {
          const inc = p?.escrow_detail?.order_income;
          if (!inc) return;
          const itens = inc.items || [];
          const somaItens = itens.reduce((a, it) => a + n(it.selling_price), 0);
          const somaComQtd = itens.reduce((a, it) => a + n(it.selling_price) * (n(it.quantity_purchased) || 1), 0);
          pedidos.push({
            sn: p.order_sn,
            status: status.get(p.order_sn) || "?",
            order_selling_price: n(inc.order_selling_price),
            voucher_vendedor: n(inc.voucher_from_seller),
            escrow: n(inc.escrow_amount),
            qtdItens: itens.length,
            somaItens: Number(somaItens.toFixed(2)),
            somaComQtd: Number(somaComQtd.toFixed(2)),
            // A pergunta central: a soma dos itens bate com o total do pedido?
            fecha: Math.abs(somaItens - n(inc.order_selling_price)) < 0.05,
            fechaComQtd: Math.abs(somaComQtd - n(inc.order_selling_price)) < 0.05,
            quantidades: itens.map((it) => n(it.quantity_purchased)),
            principais: itens.map((it) => it.is_main_item),
            kits: itens.map((it) => it.is_kit),
          });
        });
      }
      const naoFecham = pedidos.filter((p) => !p.fecha && !p.fechaComQtd);
      saida = {
        cliente, dia, pedidos: pedidos.length,
        somaOrderSellingPrice: Number(pedidos.reduce((a, p) => a + p.order_selling_price, 0).toFixed(2)),
        somaItensSemQtd: Number(pedidos.reduce((a, p) => a + p.somaItens, 0).toFixed(2)),
        somaItensComQtd: Number(pedidos.reduce((a, p) => a + p.somaComQtd, 0).toFixed(2)),
        fechamSemQtd: pedidos.filter((p) => p.fecha).length,
        fechamComQtd: pedidos.filter((p) => p.fechaComQtd).length,
        porStatus: pedidos.reduce((m, p) => { m[p.status] = (m[p.status] || 0) + 1; return m; }, {}),
        exemplosQueNaoFecham: naoFecham.slice(0, 5),
      };
    }, { cliente: req.query.cliente || null });
    res.json(saida || { aviso: "sem dados" });
  } catch (e) {
    logger.error("conferirDia", e);
    res.status(500).json({ erro: e.message });
  }
});

// Só lê. Não grava nada. Uso: /amostraSku?token=...&cliente=ID (opcional)
export const amostraSku = onRequest({ secrets, timeoutSeconds: 300 }, async (req, res) => {
  const esperado = (process.env.SYNC_TOKEN || "").trim();
  if (!esperado || req.query.token !== esperado) { res.status(403).json({ erro: "token inválido" }); return; }
  const filtro = req.query.cliente || null;
  const porLoja = [];
  try {
    await forEachShop(async ({ cliente, shopId, token }) => {
      if (porLoja.length >= 4) return; // amostra: não precisa varrer tudo
      const { inicio, fim } = limitesDoDia(dataLocal(new Date(Date.now() - 86400000)));
      const r = await shopCall(cfg(), {
        path: "/api/v2/order/get_order_list", accessToken: token, shopId,
        params: { time_range_field: "create_time", time_from: inicio, time_to: fim, page_size: 10, cursor: "" },
      });
      const sns = (r.response?.order_list || []).map((o) => o.order_sn).slice(0, 5);
      if (!sns.length) { porLoja.push({ cliente, semPedidos: true }); return; }

      const d = await shopCall(cfg(), {
        path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
        params: { order_sn_list: sns.join(","), response_optional_fields: "item_list" },
      });
      const itens = [];
      for (const o of (d.response?.order_list || [])) {
        for (const it of (o.item_list || [])) {
          itens.push({
            item_id: it.item_id,
            item_sku: it.item_sku ?? null,
            model_sku: it.model_sku ?? null,
            nome: String(it.item_name || "").slice(0, 60),
            modelo: String(it.model_name || "").slice(0, 40),
            qtd: it.model_quantity_purchased,
            // Campos de preço, para descobrir qual deles reconcilia com o
            // faturamento. Hoje usamos model_discounted_price e a soma fica
            // 10-19% ABAIXO do escrow — ou seja, ele não é o que o comprador
            // pagou. Sem saber qual é o certo, não dá para afirmar que um
            // produto dá prejuízo.
            preco_desconto: it.model_discounted_price ?? null,
            preco_original: it.model_original_price ?? null,
            promo_tipo: it.promotion_type ?? null,
            promo_id: it.promotion_id ?? null,
            add_on: it.add_on_deal ?? null,
            brinde: it.is_main_item === false ? true : null,
          });
        }
      }
      // Total do pedido, para comparar com a soma dos itens.
      const totais = (d.response?.order_list || []).map((o) => ({
        sn: o.order_sn, status: o.order_status, total: o.total_amount ?? null,
      }));
      porLoja.push({
        cliente,
        itens: itens.slice(0, 12),
        totais,
        somaItens: Number(itens.reduce((a, i) => a + Number(i.preco_desconto || 0) * Number(i.qtd || 0), 0).toFixed(2)),
        somaPedidos: Number(totais.reduce((a, t) => a + Number(t.total || 0), 0).toFixed(2)),
        comItemSku: itens.filter((i) => i.item_sku).length,
        comModelSku: itens.filter((i) => i.model_sku).length,
        total: itens.length,
      });
    }, { cliente: filtro });

    const tot = porLoja.reduce((a, l) => a + (l.total || 0), 0);
    const comSku = porLoja.reduce((a, l) => a + (l.comItemSku || 0), 0);
    res.json({
      ok: true,
      veredito: tot === 0 ? "sem itens na amostra"
        : `${comSku} de ${tot} itens têm item_sku preenchido`,
      porLoja,
    });
  } catch (e) {
    logger.error("amostraSku", e);
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
