// Testes da regra da Oferta Relâmpago.
//
// A relâmpago se renova sozinha todo dia. Avisar "vence em 2h" diariamente é
// ruído — e aviso que a equipe aprende a pular deixa de proteger os outros.
// O que importa é a AUSÊNCIA: loja sem nenhuma rodando nem agendada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vencendo, semFerramentaNemAgendada, RENOVA_DIARIAMENTE } from "../js/prazos.js";

const AGORA = 1786000000;              // mesma referência fixa do prazos.test.js
const h = (n) => AGORA + n * 3600;     // daqui a N horas

const loja = (cliente, promocoes) => ({ cliente, promocoes });

// ─── vencendo() ignora quem se renova ─────────────────────────────────

test("relâmpago acabando NÃO entra no aviso de vencimento", () => {
  // O caso que motivou a mudança: todo dia ela vence, todo dia o painel gritava.
  const r = vencendo([loja("A", [{ tipo: "flash_sale", nome: "Relâmpago", inicio: h(-2), fim: h(2) }])], AGORA);
  assert.equal(r.length, 0);
});

test("as outras ferramentas continuam entrando no aviso de vencimento", () => {
  const r = vencendo([loja("A", [
    { tipo: "flash_sale", nome: "Relâmpago", inicio: h(-2), fim: h(2) },
    { tipo: "cupom", nome: "Cupom", inicio: h(-48), fim: h(5) },
  ])], AGORA);
  assert.deepEqual(r.map((x) => x.nome), ["Cupom"]);
});

test("só o flash_sale se renova sozinho, por enquanto", () => {
  assert.deepEqual([...RENOVA_DIARIAMENTE], ["flash_sale"]);
});

// ─── semFerramentaNemAgendada() ───────────────────────────────────────

test("loja com relâmpago rodando está coberta", () => {
  const r = semFerramentaNemAgendada([loja("A", [{ tipo: "flash_sale", inicio: h(-2), fim: h(2) }])], "flash_sale", AGORA);
  assert.equal(r.length, 0);
});

test("relâmpago apenas AGENDADA já cobre a loja", () => {
  // É a diferença para semFerramenta(): agendada para amanhã resolve o
  // problema, e cobrar de novo só ensina a ignorar o painel.
  const r = semFerramentaNemAgendada([loja("A", [{ tipo: "flash_sale", inicio: h(20), fim: h(24) }])], "flash_sale", AGORA);
  assert.equal(r.length, 0);
});

test("loja só com relâmpago já vencida é acusada", () => {
  const r = semFerramentaNemAgendada([loja("A", [{ tipo: "flash_sale", inicio: h(-10), fim: h(-1) }])], "flash_sale", AGORA);
  assert.deepEqual(r.map((x) => x.cliente), ["A"]);
});

test("relâmpago sem data de fim conta como coberta", () => {
  // A API só devolve as vigentes: falta de data é falta de dado, não de
  // promoção — inventar alerta em cima disso é o mesmo ruído por outro caminho.
  const r = semFerramentaNemAgendada([loja("A", [{ tipo: "flash_sale", inicio: h(-5) }])], "flash_sale", AGORA);
  assert.equal(r.length, 0);
});

test("promoção de outro tipo não cobre a falta de relâmpago", () => {
  const r = semFerramentaNemAgendada([loja("A", [{ tipo: "desconto", inicio: h(-5), fim: h(100) }])], "flash_sale", AGORA);
  assert.deepEqual(r.map((x) => ({ cliente: x.cliente, total: x.total })), [{ cliente: "A", total: 1 }]);
});

test("avalia várias lojas e não quebra com lista vazia ou nula", () => {
  const r = semFerramentaNemAgendada([
    loja("A", [{ tipo: "flash_sale", inicio: h(-1), fim: h(3) }]),   // rodando
    loja("B", [{ tipo: "flash_sale", inicio: h(30), fim: h(34) }]),  // agendada
    loja("C", [{ tipo: "flash_sale", inicio: h(-30), fim: h(-20) }]),// só passado
    loja("D", []),                                                   // nenhuma
  ], "flash_sale", AGORA);
  assert.deepEqual(r.map((x) => x.cliente).sort(), ["C", "D"]);
  assert.deepEqual(semFerramentaNemAgendada(null, "flash_sale", AGORA), []);
  assert.deepEqual(semFerramentaNemAgendada([null], "flash_sale", AGORA), []);
});
