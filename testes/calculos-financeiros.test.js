// Testes das contas que envolvem dinheiro.
// Rodar:  node --test testes/
//
// Estas fórmulas definem quanto a OTDE cobra e quanto o lojista recebe.
// Um erro aqui vira fatura errada — por isso são as primeiras a ter teste.

import { test } from "node:test";
import assert from "node:assert/strict";

// ─── Fórmulas extraídas do sistema ────────────────────────────────────
// Mantidas idênticas às usadas em relatorio-cliente.html.

/** Aceita "8%", "7,5%", "8" e devolve número. Vazio → null. */
export function pctNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace("%", "").replace(",", ".").trim());
  return isFinite(n) ? n : null;
}

/** % efetivo de uma loja: valor próprio → do proprietário → padrão. */
export function pctEfetivo(loja, proprietario, campoLoja, campoDono, padrao) {
  if (!loja) return padrao;
  const proprio = pctNum(loja[campoLoja]);
  if (proprio !== null) return proprio;
  const herdado = proprietario ? pctNum(proprietario[campoDono]) : null;
  return herdado !== null ? herdado : padrao;
}

/** Faturamento no padrão do Seller Centre: venda − descontos do vendedor. */
export function faturamentoShopee(pedidos) {
  return Number(pedidos.reduce((a, p) =>
    a + (p.venda - (p.cupom || 0) - (p.cashback || 0)), 0).toFixed(2));
}

/** Cascata até o líquido do lojista. */
export function liquidoDoLojista({ liquidoShopee, gmv, pctComissao, pctImposto }) {
  const comissao = gmv * pctComissao / 100;
  const imposto = gmv * pctImposto / 100;
  return {
    comissao: Number(comissao.toFixed(2)),
    imposto: Number(imposto.toFixed(2)),
    liquido: Number((liquidoShopee - comissao - imposto).toFixed(2)),
  };
}

// ─── Faturamento ──────────────────────────────────────────────────────

test("faturamento desconta cupom do vendedor (caso real 02/08 WSX Pet)", () => {
  // 10 pedidos de 30,98 + 2 de 56,89, todos com cupom de 0,70
  const pedidos = [
    ...Array(10).fill({ venda: 30.98, cupom: 0.70 }),
    ...Array(2).fill({ venda: 56.89, cupom: 0.70 }),
  ];
  // Confere com o painel da Shopee daquele dia.
  assert.equal(faturamentoShopee(pedidos), 415.18);
});

test("cupom de cashback também é desconto do vendedor", () => {
  // Foi o que faltava para bater ao centavo: cashback fica noutro campo.
  const pedidos = [{ venda: 100, cupom: 0 }, { venda: 100, cashback: 5 }];
  assert.equal(faturamentoShopee(pedidos), 195);
});

test("pedido sem desconto entra pelo valor cheio", () => {
  assert.equal(faturamentoShopee([{ venda: 250.5 }]), 250.5);
});

test("dia sem pedidos resulta em zero", () => {
  assert.equal(faturamentoShopee([]), 0);
});

// ─── Percentuais e herança ────────────────────────────────────────────

test("aceita percentual escrito como texto com % e vírgula", () => {
  assert.equal(pctNum("8%"), 8);
  assert.equal(pctNum("7,5%"), 7.5);
  assert.equal(pctNum("3"), 3);
  assert.equal(pctNum(""), null);
  assert.equal(pctNum(null), null);
});

test("texto inválido não vira zero silencioso", () => {
  // Zero silencioso seria pior que null: sumiria a dedução sem avisar.
  assert.equal(pctNum("abc"), null);
});

test("loja herda o percentual do cliente proprietário", () => {
  const dono = { fee: "8%", imposto: "7,5%" };
  const loja = { custId: "D1" };
  assert.equal(pctEfetivo(loja, dono, "comissao", "fee", 2), 8);
  assert.equal(pctEfetivo(loja, dono, "imposto", "imposto", 0), 7.5);
});

test("percentual próprio da loja tem prioridade sobre o do cliente", () => {
  const dono = { fee: "8%" };
  const loja = { custId: "D1", comissao: 5 };
  assert.equal(pctEfetivo(loja, dono, "comissao", "fee", 2), 5);
});

test("sem proprietário e sem valor próprio, usa o padrão", () => {
  assert.equal(pctEfetivo({}, null, "comissao", "fee", 2), 2);
  assert.equal(pctEfetivo({}, null, "imposto", "imposto", 0), 0);
});

test("comissão zero é respeitada e não cai no padrão", () => {
  // Cliente isento precisa ficar isento — não pode virar 2%.
  const loja = { comissao: 0 };
  assert.equal(pctEfetivo(loja, null, "comissao", "fee", 2), 0);
});

// ─── Cascata até o líquido ────────────────────────────────────────────

test("líquido do lojista desconta comissão e imposto", () => {
  const r = liquidoDoLojista({ liquidoShopee: 700, gmv: 1000, pctComissao: 5, pctImposto: 7.5 });
  assert.equal(r.comissao, 50);
  assert.equal(r.imposto, 75);
  assert.equal(r.liquido, 575);
});

test("sem imposto cadastrado, só a comissão é descontada", () => {
  const r = liquidoDoLojista({ liquidoShopee: 350, gmv: 500, pctComissao: 2, pctImposto: 0 });
  assert.equal(r.imposto, 0);
  assert.equal(r.liquido, 340);
});

test("comissão incide sobre o faturamento bruto, não sobre o líquido", () => {
  // Regra de negócio: a OTDE cobra sobre o bruto.
  const r = liquidoDoLojista({ liquidoShopee: 100, gmv: 1000, pctComissao: 10, pctImposto: 0 });
  assert.equal(r.comissao, 100);          // 10% de 1000, não de 100
});

// ─── Regressões: erros que já aconteceram ─────────────────────────────

test("REGRESSÃO: faturamento não inclui frete", () => {
  // O sistema já somou o frete e ficou 17% acima do Seller Centre.
  const pedidos = [{ venda: 30.98, cupom: 0.70 }];
  const totalPagoComFrete = 43.87;
  assert.notEqual(faturamentoShopee(pedidos), totalPagoComFrete);
  assert.equal(faturamentoShopee(pedidos), 30.28);
});

test("REGRESSÃO: soma de muitos pedidos não acumula erro de centavo", () => {
  const pedidos = Array(1000).fill({ venda: 10.10, cupom: 0.07 });
  assert.equal(faturamentoShopee(pedidos), 10030);
});
