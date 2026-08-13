// Testes do aviso de ferramenta vencendo.
// Importa o módulo real — o mesmo que o navegador carrega.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vencendo, comoFalta, diaLocal, semFerramenta } from "../js/prazos.js";

const AGORA = 1786000000;              // referência fixa
const h = (n) => AGORA + n * 3600;     // daqui a N horas

const loja = (cliente, promocoes) => ({ cliente, promocoes });

test("promoção que termina hoje aparece", () => {
  const r = vencendo([loja("A", [{ nome: "Cupom", inicio: h(-48), fim: h(5) }])], AGORA);
  assert.equal(r.length, 1);
  assert.equal(r[0].horas, 5);
});

test("promoção que termina depois da janela não aparece", () => {
  const r = vencendo([loja("A", [{ nome: "Cupom", inicio: h(-48), fim: h(72) }])], AGORA, 2);
  assert.equal(r.length, 0);
});

test("promoção já vencida não aparece", () => {
  // Poluir o aviso com passado faz a equipe parar de ler o aviso.
  const r = vencendo([loja("A", [{ nome: "Cupom", inicio: h(-48), fim: h(-1) }])], AGORA);
  assert.equal(r.length, 0);
});

test("promoção agendada para daqui a um mês não é urgência de hoje", () => {
  const r = vencendo([loja("A", [{ nome: "Futuro", inicio: h(720), fim: h(760) }])], AGORA);
  assert.equal(r.length, 0);
});

test("promoção sem data de fim é ignorada em vez de virar alerta falso", () => {
  const r = vencendo([loja("A", [{ nome: "Sem fim", inicio: h(-10), fim: 0 }])], AGORA);
  assert.equal(r.length, 0);
});

test("ordena da mais urgente para a menos", () => {
  const r = vencendo([loja("A", [
    { nome: "Depois", inicio: h(-1), fim: h(40) },
    { nome: "Agora", inicio: h(-1), fim: h(2) },
  ])], AGORA);
  assert.deepEqual(r.map((x) => x.nome), ["Agora", "Depois"]);
});

test("junta promoções de lojas diferentes", () => {
  const r = vencendo([
    loja("A", [{ nome: "a", inicio: h(-1), fim: h(10) }]),
    loja("B", [{ nome: "b", inicio: h(-1), fim: h(3) }]),
  ], AGORA);
  assert.deepEqual(r.map((x) => x.cliente), ["B", "A"]);
});

test("marca se já está em andamento", () => {
  const r = vencendo([loja("A", [
    { nome: "rodando", inicio: h(-5), fim: h(10) },
    { nome: "comeca amanha", inicio: h(30), fim: h(40) },
  ])], AGORA);
  assert.equal(r.find((x) => x.nome === "rodando").emAndamento, true);
  assert.equal(r.find((x) => x.nome === "comeca amanha").emAndamento, false);
});

test("lista vazia ou nula não quebra", () => {
  assert.deepEqual(vencendo(null, AGORA), []);
  assert.deepEqual(vencendo([loja("A", null)], AGORA), []);
});

// ─── semFerramenta ────────────────────────────────────────────────────
// Loja sem desconto ativo vende menos sem nada quebrar — é a falha
// silenciosa da operação, e por isso precisa de alerta próprio.

test("loja com desconto ativo não é acusada", () => {
  const r = semFerramenta([loja("A", [{ tipo: "desconto", inicio: h(-10), fim: h(50) }])], "desconto", AGORA);
  assert.equal(r.length, 0);
});

test("loja sem nenhuma promoção do tipo é acusada", () => {
  const r = semFerramenta([loja("A", [{ tipo: "cupom", inicio: h(-10), fim: h(50) }])], "desconto", AGORA);
  assert.deepEqual(r.map((x) => x.cliente), ["A"]);
});

test("loja sem promoção nenhuma é acusada", () => {
  const r = semFerramenta([loja("A", [])], "desconto", AGORA);
  assert.equal(r.length, 1);
});

test("desconto que já acabou não conta como ativo", () => {
  // A Shopee é consultada a cada 6h; sem checar o fim, diríamos que está
  // tudo certo numa loja que ficou sem desconto no meio do caminho.
  const r = semFerramenta([loja("A", [{ tipo: "desconto", inicio: h(-50), fim: h(-1) }])], "desconto", AGORA);
  assert.equal(r.length, 1);
});

test("desconto agendado para depois ainda não vale", () => {
  const r = semFerramenta([loja("A", [{ tipo: "desconto", inicio: h(10), fim: h(50) }])], "desconto", AGORA);
  assert.equal(r.length, 1);
});

test("desconto sem datas conta como ativo", () => {
  // A API só devolve as em andamento; sem data, confiamos no filtro dela.
  const r = semFerramenta([loja("A", [{ tipo: "desconto" }])], "desconto", AGORA);
  assert.equal(r.length, 0);
});

test("avalia várias lojas de uma vez", () => {
  const r = semFerramenta([
    loja("A", [{ tipo: "desconto", inicio: h(-1), fim: h(50) }]),
    loja("B", [{ tipo: "combo", inicio: h(-1), fim: h(50) }]),
    loja("C", []),
  ], "desconto", AGORA);
  assert.deepEqual(r.map((x) => x.cliente).sort(), ["B", "C"]);
});

test("lista vazia não quebra", () => {
  assert.deepEqual(semFerramenta(null, "desconto", AGORA), []);
});

// ─── comoFalta ────────────────────────────────────────────────────────

test("texto do prazo", () => {
  assert.equal(comoFalta(0), "vence em menos de 1 hora");
  assert.equal(comoFalta(5), "vence em 5h");
  assert.equal(comoFalta(30), "vence amanhã");
  assert.equal(comoFalta(50), "vence em 2 dias");
});

// ─── diaLocal ─────────────────────────────────────────────────────────

test("converte para o dia de São Paulo, não UTC", () => {
  // 2026-08-14 01:00 UTC = 2026-08-13 22:00 em Brasília.
  const seg = Math.floor(Date.parse("2026-08-14T01:00:00Z") / 1000);
  assert.equal(diaLocal(seg), "2026-08-13");
});
