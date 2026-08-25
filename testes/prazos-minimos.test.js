// Testes do mínimo de ferramentas por loja.
//
// A combinação da operação: 4 cupons ativos, um deles o Prêmio de Seguidor.
// Ficar abaixo não quebra nada — a loja só rende menos, calada, até alguém
// reparar. Por isso vira alerta.
//
// Desconto NÃO tem mínimo: contar campanhas não mede nada (uma loja pode ter
// todos os anúncios numa campanha só e estar perfeita). O que importa ali é o
// zero, e disso cuida semFerramenta, testada no prazos.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { abaixoDoMinimo, MINIMO_FERRAMENTAS, PREMIO_SEGUIDOR, ehPremioSeguidor } from "../js/prazos.js";

const AGORA = 1786000000;
const h = (n) => AGORA + n * 3600;

// Loja completa: 4 cupons (um deles o Prêmio) + 3 descontos.
const completa = (cliente = "OK") => ({
  cliente,
  promocoes: [
    { tipo: "cupom", nome: "15%", inicio: h(-10), fim: h(100) },
    { tipo: "cupom", nome: "25%", inicio: h(-10), fim: h(100) },
    { tipo: "cupom", nome: "70% Cash", inicio: h(-10), fim: h(100) },
    { tipo: "cupom", nome: "Prêmio de Seguidor", inicio: h(-10), fim: h(100) },
    { tipo: "desconto", nome: "promo", inicio: h(-10), fim: h(100) },
    { tipo: "desconto", nome: "novos", inicio: h(-10), fim: h(100) },
    { tipo: "desconto", nome: "novos 2", inicio: h(-10), fim: h(100) },
  ],
});
const semAs = (n) => { const l = completa(); l.promocoes.splice(n, 1); return l; };
// Regra de exemplo, do formato que PREMIO_SEGUIDOR espera quando configurado.
const REGRA = { campo: "voucher_type", valor: 3 };
const comBruto = (l, i, bruto) => { l.promocoes[i] = { ...l.promocoes[i], bruto }; return l; };
const textos = (r) => r[0].faltas.map((f) => f.texto);

test("loja completa não aparece", () => {
  assert.deepEqual(abaixoDoMinimo([completa()], AGORA), []);
});

test("o mínimo combinado é 4 cupons, e desconto não tem mínimo", () => {
  assert.deepEqual(MINIMO_FERRAMENTAS, { cupom: 4 });
});

test("cupom a menos aparece com a contagem", () => {
  const r = abaixoDoMinimo([semAs(0)], AGORA);   // tira o cupom de 15%
  assert.deepEqual(textos(r), ["3/4 cupons"]);
});

test("quantidade de descontos não é cobrada", () => {
  // O caso que derrubou a regra antiga: loja com UM desconto só, com todos os
  // anúncios dentro dele, está certa. Exigir três acusava quase toda a base.
  const l = completa();
  l.promocoes = l.promocoes.filter((p) => p.tipo !== "desconto")
    .concat([{ tipo: "desconto", nome: "todos os anuncios", inicio: h(-10), fim: h(100) }]);
  assert.deepEqual(abaixoDoMinimo([l], AGORA), []);
});

test("nem loja sem desconto nenhum entra aqui — quem cuida do zero é semFerramenta", () => {
  const l = completa();
  l.promocoes = l.promocoes.filter((p) => p.tipo !== "desconto");
  assert.deepEqual(abaixoDoMinimo([l], AGORA), []);
});

test("com a regra configurada, 4 cupons sem o Prêmio ainda é falta", () => {
  // O Prêmio conta dentro dos 4 E é exigido à parte: trocar ele por um cupom
  // comum mantém a contagem e mesmo assim deixa a loja incompleta.
  const l = comBruto(completa(), 3, { voucher_type: 3 });   // este é o Prêmio
  assert.deepEqual(abaixoDoMinimo([l], AGORA, undefined, REGRA), []);

  const semPremio = comBruto(completa(), 3, { voucher_type: 1 });
  const r = abaixoDoMinimo([semPremio], AGORA, undefined, REGRA);
  assert.deepEqual(textos(r), ["sem Prêmio de Seguidor"]);
  assert.equal(r[0].cupons, 4);
});

test("o nome do cupom não decide nada", () => {
  // O caso real: uma loja chama o Prêmio dela de "consultoria" e outra tem um
  // cupom chamado "Prêmio de Seguidor" que não é o tipo certo. Quem manda é o
  // parâmetro da ferramenta.
  const disfarcado = comBruto(completa(), 3, { voucher_type: 3 });
  disfarcado.promocoes[3].nome = "consultoria";
  assert.deepEqual(abaixoDoMinimo([disfarcado], AGORA, undefined, REGRA), []);

  const soNoNome = comBruto(completa(), 3, { voucher_type: 1 });
  soNoNome.promocoes[3].nome = "Prêmio de Seguidor";
  assert.deepEqual(textos(abaixoDoMinimo([soNoNome], AGORA, undefined, REGRA)), ["sem Prêmio de Seguidor"]);
});

test("aceita a regra com vários valores possíveis", () => {
  const l = comBruto(completa(), 3, { voucher_type: 5 });
  assert.deepEqual(abaixoDoMinimo([l], AGORA, undefined, { campo: "voucher_type", valor: [3, 5] }), []);
});

test("cupom sem os campos crus não vira Prêmio por acidente", () => {
  // Loja ainda não ressincronizada: sem `bruto`, não dá para afirmar nada.
  assert.equal(ehPremioSeguidor({ tipo: "cupom", nome: "seguidor" }, REGRA), false);
  assert.equal(ehPremioSeguidor({ tipo: "cupom", bruto: {} }, REGRA), false);
});

test("enquanto a regra não for descoberta, o Prêmio não é cobrado", () => {
  // Suspensa de propósito: acusar toda loja de não ter um cupom que ela talvez
  // tenha é pior do que não checar. Ver PREMIO_SEGUIDOR em js/prazos.js.
  assert.equal(PREMIO_SEGUIDOR, null);
  const l = completa();
  l.promocoes[3] = { tipo: "cupom", nome: "consultoria", inicio: h(-10), fim: h(100) };
  assert.deepEqual(abaixoDoMinimo([l], AGORA), []);
  assert.equal(ehPremioSeguidor(l.promocoes[3]), false);
});

test("um DESCONTO com o parâmetro do Prêmio não substitui o cupom", () => {
  // O Prêmio é um CUPOM. Nem o parâmetro certo em outro tipo de ferramenta vale.
  const l = completa();
  l.promocoes[3] = { tipo: "desconto", nome: "x", inicio: h(-10), fim: h(100), bruto: { voucher_type: 3 } };
  assert.deepEqual(textos(abaixoDoMinimo([l], AGORA, undefined, REGRA)), ["3/4 cupons", "sem Prêmio de Seguidor"]);
});

test("promoção vencida ou ainda agendada não conta como ativa", () => {
  const l = completa();
  l.promocoes[0] = { tipo: "cupom", nome: "vencido", inicio: h(-50), fim: h(-1) };
  l.promocoes[1] = { tipo: "cupom", nome: "agendado", inicio: h(10), fim: h(100) };
  assert.deepEqual(textos(abaixoDoMinimo([l], AGORA)), ["2/4 cupons"]);
});

test("cupom sem datas conta como ativo", () => {
  const l = completa();
  l.promocoes[0] = { tipo: "cupom", nome: "sem datas" };
  assert.deepEqual(abaixoDoMinimo([l], AGORA), []);
});

test("loja sem nenhuma ferramenta acusa os cupons que faltam", () => {
  const r = abaixoDoMinimo([{ cliente: "Vazia", promocoes: [] }], AGORA);
  assert.deepEqual(textos(r), ["0/4 cupons"]);
  assert.equal(r[0].cliente, "Vazia");
  // Com a regra do Prêmio no ar, a mesma loja acusa as duas.
  assert.deepEqual(textos(abaixoDoMinimo([{ cliente: "Vazia", promocoes: [] }], AGORA, undefined, REGRA)),
                   ["0/4 cupons", "sem Prêmio de Seguidor"]);
});

test("avalia várias lojas e devolve só quem falha", () => {
  const r = abaixoDoMinimo([completa("A"), semAs(0), { cliente: "C", promocoes: [] }], AGORA);
  assert.deepEqual(r.map((x) => x.cliente), ["OK", "C"]);
});

test("dá para apertar o mínimo sem mexer no código da tela", () => {
  const r = abaixoDoMinimo([completa()], AGORA, { cupom: 5 });
  assert.deepEqual(textos(r), ["4/5 cupons"]);
});

test("lista vazia ou nula não quebra", () => {
  assert.deepEqual(abaixoDoMinimo(null, AGORA), []);
  assert.deepEqual(abaixoDoMinimo([null], AGORA), []);
  assert.deepEqual(abaixoDoMinimo([{ cliente: "X", promocoes: null }], AGORA).length, 1);
});
