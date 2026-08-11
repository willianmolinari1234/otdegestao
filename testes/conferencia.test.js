// Testes da conferência diária.
//
// Diferente dos testes financeiros, aqui NÃO copiamos as fórmulas: importamos
// o módulo real. Se alguém mudar a regra no backend, estes testes acusam.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compararDia,
  detectarQuedas,
  montarResumo,
} from "../functions/conferencia.js";

// ─── compararDia ──────────────────────────────────────────────────────

test("valores iguais conferem", () => {
  const r = compararDia({ gmv: 415.18, pedidos: 12 }, { gmv: 415.18, pedidos: 12 });
  assert.equal(r.confere, true);
  assert.equal(r.tipo, null);
});

test("diferença de 1 centavo é arredondamento, não erro", () => {
  const r = compararDia({ gmv: 415.18, pedidos: 12 }, { gmv: 415.19, pedidos: 12 });
  assert.equal(r.confere, true);
});

test("diferença acima da tolerância acusa e informa o tamanho", () => {
  const r = compararDia({ gmv: 415.18, pedidos: 12 }, { gmv: 508.37, pedidos: 12 });
  assert.equal(r.confere, false);
  assert.equal(r.tipo, "valor");
  // O caso real do frete indevido: R$ 93,19 a mais.
  assert.equal(Number(r.diferenca.toFixed(2)), 93.19);
});

test("valor certo mas contagem de pedidos errada também acusa", () => {
  const r = compararDia({ gmv: 100, pedidos: 5 }, { gmv: 100, pedidos: 4 });
  assert.equal(r.confere, false);
  assert.equal(r.tipo, "pedidos");
});

test("dia sem venda e sem documento salvo está correto", () => {
  const r = compararDia({ gmv: 0, pedidos: 0 }, null);
  assert.equal(r.confere, true);
});

test("houve venda na Shopee mas nada foi salvo: acusa", () => {
  const r = compararDia({ gmv: 250.5, pedidos: 3 }, null);
  assert.equal(r.confere, false);
  assert.equal(r.tipo, "faltando");
  assert.equal(r.diferenca, 250.5);
});

// ─── detectarQuedas ───────────────────────────────────────────────────

test("o caso da Vic.Ti: total do mês despencou", () => {
  const q = detectarQuedas({ victi: 12824.0 }, { victi: 64484.0 });
  assert.equal(q.length, 1);
  assert.equal(q[0].loja, "victi");
  assert.equal(q[0].caiu, 51660);
});

test("oscilação pequena por cancelamento não vira alerta", () => {
  // R$ 30 de queda sobre R$ 60.000: nem valor nem proporção justificam.
  assert.equal(detectarQuedas({ a: 59970 }, { a: 60000 }).length, 0);
});

test("queda percentual grande mas em centavos não vira alerta", () => {
  // Loja com R$ 40 no mês zerou: proporção é 100%, mas o valor é irrelevante.
  assert.equal(detectarQuedas({ a: 0 }, { a: 40 }).length, 0);
});

test("queda em reais grande mas proporcionalmente ínfima não vira alerta", () => {
  // R$ 60 sobre R$ 1.000.000 é 0,006% — ruído de cancelamento.
  assert.equal(detectarQuedas({ a: 999940 }, { a: 1000000 }).length, 0);
});

test("loja que sumiu da medição conta como zerada", () => {
  const q = detectarQuedas({}, { some: 5000 });
  assert.equal(q.length, 1);
  assert.equal(q[0].agora, 0);
});

test("loja nova, sem medição anterior, não gera alerta", () => {
  assert.equal(detectarQuedas({ nova: 9000 }, {}).length, 0);
});

test("crescimento nunca é alerta", () => {
  assert.equal(detectarQuedas({ a: 90000 }, { a: 60000 }).length, 0);
});

test("quedas saem da maior para a menor", () => {
  const q = detectarQuedas({ a: 0, b: 0 }, { a: 1000, b: 9000 });
  assert.deepEqual(q.map((x) => x.loja), ["b", "a"]);
});

// ─── montarResumo ─────────────────────────────────────────────────────

test("resumo sem problema nenhum marca tudoCerto", () => {
  const r = montarResumo({
    dia: "2026-08-11",
    comparacoes: [
      { cliente: "a", dia: "2026-08-10", confere: true },
      { cliente: "a", dia: "2026-08-11", confere: true },
    ],
    quedas: [],
  });
  assert.equal(r.tudoCerto, true);
  assert.equal(r.lojasConferidas, 1);
  assert.equal(r.diasConferidos, 2);
});

test("uma única queda já derruba tudoCerto", () => {
  const r = montarResumo({
    dia: "2026-08-11",
    comparacoes: [{ cliente: "a", dia: "2026-08-11", confere: true }],
    quedas: [{ loja: "b", caiu: 5000 }],
  });
  assert.equal(r.tudoCerto, false);
  assert.equal(r.quedas, 1);
});
