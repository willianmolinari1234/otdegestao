// Cliente da Shopee Open API v2 — assinatura, OAuth e chamadas autenticadas.
// App 1 (categoria "ERP System"): vendas (order) + ferramentas (promoções).
//
// Assinatura (v2):
//   API pública (sem loja): base = partner_id + path + timestamp
//   API de loja:            base = partner_id + path + timestamp + access_token + shop_id
//   sign = HMAC_SHA256(partner_key, base)  em hexadecimal

import crypto from "node:crypto";

// Produção. Sandbox: https://partner.test-stable.shopeemobile.com
export const SHOPEE_BASE = process.env.SHOPEE_BASE || "https://partner.shopeemobile.com";

const now = () => Math.floor(Date.now() / 1000);

function sign(partnerKey, baseString) {
  return crypto.createHmac("sha256", partnerKey).update(baseString).digest("hex");
}

// Link de autorização que o lojista abre para conceder acesso ao app.
export function buildAuthUrl({ partnerId, partnerKey, redirectUri }) {
  const path = "/api/v2/shop/auth_partner";
  const ts = now();
  const s = sign(partnerKey, `${partnerId}${path}${ts}`);
  const qs = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(ts),
    sign: s,
    redirect: redirectUri,
  });
  return `${SHOPEE_BASE}${path}?${qs.toString()}`;
}

// Chamada a um endpoint público (assinatura sem loja).
async function publicCall({ partnerId, partnerKey }, path, body) {
  const ts = now();
  const s = sign(partnerKey, `${partnerId}${path}${ts}`);
  const qs = new URLSearchParams({ partner_id: String(partnerId), timestamp: String(ts), sign: s });
  const res = await fetch(`${SHOPEE_BASE}${path}?${qs.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Troca o "code" (retorno do OAuth) por access_token + refresh_token.
export function getAccessToken(cfg, { code, shopId }) {
  return publicCall(cfg, "/api/v2/auth/token/get", {
    code,
    shop_id: Number(shopId),
    partner_id: Number(cfg.partnerId),
  });
}

// Renova o access_token (validade ~4h) usando o refresh_token.
export function refreshAccessToken(cfg, { refreshToken, shopId }) {
  return publicCall(cfg, "/api/v2/auth/access_token/get", {
    refresh_token: refreshToken,
    shop_id: Number(shopId),
    partner_id: Number(cfg.partnerId),
  });
}

// Chamada autenticada a um endpoint de loja (GET com query string assinada).
export async function shopCall(cfg, { path, accessToken, shopId, params = {} }) {
  const ts = now();
  const base = `${cfg.partnerId}${path}${ts}${accessToken}${shopId}`;
  const s = sign(cfg.partnerKey, base);
  const qs = new URLSearchParams({
    partner_id: String(cfg.partnerId),
    timestamp: String(ts),
    access_token: accessToken,
    shop_id: String(shopId),
    sign: s,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const res = await fetch(`${SHOPEE_BASE}${path}?${qs.toString()}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(`Shopee ${path} -> ${json.error}: ${json.message || ""}`);
  }
  return json;
}
