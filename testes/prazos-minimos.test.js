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
import { abaixoDoMinimo, MINIMO_FERRAMENTAS, CUPOM_SEGUIDOR } from "../js/prazos.js";

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

test("4 cupons mas sem o Prêmio de Seguidor ainda é falta", () => {
  // O Prêmio conta dentro dos 4 E é exigido à parte: trocar ele por um cupom
  // comum mantém a contagem e mesmo assim deixa a loja incompleta.
  const l = completa();
  l.promocoes[3] = { tipo: "cupom", nome: "Frete grátis", inicio: h(-10), fim: h(100) };
  const r = abaixoDoMinimo([l], AGORA);
  assert.deepEqual(textos(r), ["sem Prêmio de Seguidor"]);
  assert.equal(r[0].cupons, 4);
});

test("acha o Prêmio sem acento, em maiúscula ou escrito diferente", () => {
  // O nome é digitado à mão na Shopee, loja por loja.
  for (const nome of ["Prêmio de Seguidor", "PREMIO DE SEGUIDOR", "premio seguidor",
                      "Cupom Seguidores", "prêmio p/ seguidor"]) {
    const l = completa();
    l.promocoes[3] = { tipo: "cupom", nome, inicio: h(-10), fim: h(100) };
    assert.deepEqual(abaixoDoMinimo([l], AGORA), [], `devia aceitar "${nome}"`);
  }
  assert.equal(CUPOM_SEGUIDOR, "seguidor");
});

test("desconto com nome de seguidor não vale como o cupom do Prêmio", () => {
  // O Prêmio é um CUPOM. Um desconto chamado "seguidor" não substitui.
  const l = completa();
  l.promocoes[3] = { tipo: "desconto", nome: "Prêmio de Seguidor", inicio: h(-10), fim: h(100) };
  assert.deepEqual(textos(abaixoDoMinimo([l], AGORA)), ["3/4 cupons", "sem Prêmio de Seguidor"]);
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

test("loja sem nenhuma ferramenta acusa cupons e Prêmio", () => {
  const r = abaixoDoMinimo([{ cliente: "Vazia", promocoes: [] }], AGORA);
  assert.deepEqual(textos(r), ["0/4 cupons", "sem Prêmio de Seguidor"]);
  assert.equal(r[0].cliente, "Vazia");
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
