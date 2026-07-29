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
  const k = (PARTNER_KEY.value() || "").trim();
  res.json({
    partnerId: (process.env.SHOPEE_PARTNER_ID || "").trim(),
    base: process.env.SHOPEE_BASE,
    keyLength: k.length,
    keyIsHex: /^[0-9a-fA-F]+$/.test(k),
    keyHasAsterisk: k.includes("*"),
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
    res.send("<h2>Loja conectada com sucesso ✓</h2><p>Pode fechar esta janela.</p>");
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
async function fetchVendasDoDia(c, shopId, token) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 24 * 3600;
  let cursor = "", orderSns = [];
  do {
    const r = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_list", accessToken: token, shopId,
      params: { time_range_field: "create_time", time_from: start, time_to: end, page_size: 100, cursor },
    });
    const list = r.response?.order_list || [];
    orderSns.push(...list.map((o) => o.order_sn));
    cursor = r.response?.next_cursor || "";
    if (!r.response?.more) break;
  } while (cursor);

  let gmv = 0;
  for (let i = 0; i < orderSns.length; i += 50) {
    const lote = orderSns.slice(i, i + 50).join(",");
    const d = await shopCall(cfg(), {
      path: "/api/v2/order/get_order_detail", accessToken: token, shopId,
      params: { order_sn_list: lote, response_optional_fields: "total_amount" },
    });
    (d.response?.order_list || []).forEach((o) => { gmv += Number(o.total_amount || 0); });
  }
  return { gmv, pedidos: orderSns.length };
}

export const syncVendas = onSchedule({ schedule: "every 30 minutes", secrets, timeoutSeconds: 540 }, async () => {
  const dia = new Date().toISOString().slice(0, 10);
  await forEachShop(async ({ cliente, shopId, token }) => {
    const { gmv, pedidos } = await fetchVendasDoDia(cliente, shopId, token);
    await db.collection("sales").doc(`${cliente}_${dia}`).set({
      cliente, data: dia, gmv, pedidos,
      ticketMedio: pedidos ? gmv / pedidos : 0,
      atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
});

// ---------- 4) Ferramentas (promoções ativas) ----------
// Cada tipo tem seu endpoint; todos trazem end_time. Confirmar campos na API List.
const PROMO_ENDPOINTS = [
  { tipo: "desconto", path: "/api/v2/discount/get_discount_list", listKey: "discount_list", nameKey: "discount_name", startKey: "start_time", endKey: "end_time" },
  { tipo: "leve_mais", path: "/api/v2/add_on_deal/get_add_on_deal_list", listKey: "add_on_deal_list", nameKey: "add_on_deal_name", startKey: "start_time", endKey: "end_time" },
  { tipo: "combo", path: "/api/v2/bundle_deal/get_bundle_deal_list", listKey: "bundle_deal_list", nameKey: "name", startKey: "start_time", endKey: "end_time" },
  { tipo: "flash_sale", path: "/api/v2/shop_flash_sale/get_shop_flash_sale_list", listKey: "flash_sale_list", nameKey: "timeslot_id", startKey: "start_time", endKey: "end_time" },
  { tipo: "cupom", path: "/api/v2/voucher/get_voucher_list", listKey: "voucher_list", nameKey: "voucher_name", startKey: "start_time", endKey: "end_time" },
];

async function fetchFerramentas(shopId, token) {
  const promocoes = [];
  for (const ep of PROMO_ENDPOINTS) {
    try {
      const r = await shopCall(cfg(), {
        path: ep.path, accessToken: token, shopId,
        params: { promotion_status: "ongoing", page_no: 1, page_size: 100 },
      });
      const list = r.response?.[ep.listKey] || [];
      list.forEach((p) => {
        promocoes.push({
          tipo: ep.tipo,
          nome: String(p[ep.nameKey] ?? ep.tipo),
          inicio: Number(p[ep.startKey] || 0),
          fim: Number(p[ep.endKey] || 0),
        });
      });
    } catch (e) {
      logger.warn(`${ep.tipo}: ${e.message}`);
    }
  }
  return promocoes;
}

export const syncFerramentas = onSchedule({ schedule: "every 6 hours", secrets, timeoutSeconds: 540 }, async () => {
  await forEachShop(async ({ cliente, shopId, token }) => {
    const promocoes = await fetchFerramentas(shopId, token);
    await db.collection("tools").doc(cliente).set({
      cliente, promocoes, atualizadoEm: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
});
