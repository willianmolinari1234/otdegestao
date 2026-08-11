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
  diasParaConferir,
} from "../functions/conferencia.js";

// ─── diasParaConferir ─────────────────────────────────────────────────
// A primeira execução em produção acusou 4 divergências, TODAS do próprio
// dia, todas com o salvo atrás da API. Não era erro de dado: era a sincronia
// de 30 em 30 minutos ainda não ter alcançado. Hoje ficou de fora.

test("o dia de hoje nunca é conferido", () => {
  const dias = diasParaConferir("2026-08-11", 3);
  assert.ok(!dias.includes("2026-08-11"));
});

test("confere os dias fechados, do mais recente ao mais antigo", () => {
  assert.deepEqual(diasParaConferir("2026-08-11", 3),
    ["2026-08-10", "2026-08-09", "2026-08-08"]);
});

test("atravessa a virada de mês", () => {
  assert.deepEqual(diasParaConferir("2026-08-02", 3),
    ["2026-08-01", "2026-07-31", "2026-07-30"]);
});

test("atravessa a virada de ano", () => {
  assert.deepEqual(diasParaConferir("2027-01-01", 2),
    ["2026-12-31", "2026-12-30"]);
});

test("data inválida devolve lista vazia em vez de quebrar", () => {
  assert.deepEqual(diasParaConferir("qualquer coisa", 3), []);
});

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
