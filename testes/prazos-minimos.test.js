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

// Campos crus como a Shopee devolve. Não são inventados: saíram de
// amostraCupons() rodado na loja qu48bsm40 em 25/08/2026, os quatro cupons
// ativos dela. Se a API mudar de campo, é aqui que o teste avisa.
const CRU = {
  quinzePorCento: { voucher_type: 1, reward_type: 2, voucher_purpose: 0, usecase: 1 },
  vintecinco:     { voucher_type: 1, reward_type: 2, voucher_purpose: 0, usecase: 1 },
  cashback:       { voucher_type: 1, reward_type: 3, voucher_purpose: 0, usecase: 1 },
  premio:         { voucher_type: 1, reward_type: 1, voucher_purpose: 3, usecase: 9 },
};

// Loja completa: 4 cupons (um deles o Prêmio) + 3 descontos.
// Só cupom tem `bruto` — o backend guarda os campos crus só desse tipo.
const completa = (cliente = "OK") => ({
  cliente,
  promocoes: [
    { tipo: "cupom", nome: "15%", inicio: h(-10), fim: h(100), bruto: { ...CRU.quinzePorCento } },
    { tipo: "cupom", nome: "25%", inicio: h(-10), fim: h(100), bruto: { ...CRU.vintecinco } },
    { tipo: "cupom", nome: "70% Cash", inicio: h(-10), fim: h(100), bruto: { ...CRU.cashback } },
    { tipo: "cupom", nome: "Premio de Seguidor", inicio: h(-10), fim: h(100), bruto: { ...CRU.premio } },
    { tipo: "desconto", nome: "promo", inicio: h(-10), fim: h(100) },
    { tipo: "desconto", nome: "novos", inicio: h(-10), fim: h(100) },
    { tipo: "desconto", nome: "novos 2", inicio: h(-10), fim: h(100) },
  ],
});
const semAs = (n) => { const l = completa(); l.promocoes.splice(n, 1); return l; };
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

test("a regra do Prêmio é o voucher_purpose, achado nos dados reais", () => {
  // Três campos separavam o Prêmio dos outros cupons da mesma loja
  // (voucher_purpose 3, usecase 9, código "SFP-…"). Ficou o que declara a
  // finalidade do cupom; o código é texto, e casar texto foi o erro anterior.
  assert.deepEqual(PREMIO_SEGUIDOR, { campo: "voucher_purpose", valor: 3 });
});

test("reconhece o Prêmio pelos campos crus, e só ele", () => {
  const l = completa();
  assert.equal(ehPremioSeguidor(l.promocoes[3]), true);
  assert.equal(ehPremioSeguidor(l.promocoes[0]), false);
  assert.equal(ehPremioSeguidor(l.promocoes[2]), false);
});

test("4 cupons sem o Prêmio ainda é falta", () => {
  // O Prêmio conta dentro dos 4 E é exigido à parte: trocar ele por um cupom
  // comum mantém a contagem e mesmo assim deixa a loja incompleta.
  const semPremio = comBruto(completa(), 3, { ...CRU.quinzePorCento });
  const r = abaixoDoMinimo([semPremio], AGORA);
  assert.deepEqual(textos(r), ["sem Prêmio de Seguidor"]);
  assert.equal(r[0].cupons, 4);
});

test("o nome do cupom não decide nada", () => {
  // O caso real: uma loja chama o Prêmio dela de "consultoria" e outra tem um
  // cupom chamado "Prêmio de Seguidor" que não é o tipo certo. Quem manda é o
  // parâmetro da ferramenta.
  const disfarcado = completa();
  disfarcado.promocoes[3].nome = "consultoria";
  assert.deepEqual(abaixoDoMinimo([disfarcado], AGORA), []);

  const soNoNome = comBruto(completa(), 3, { ...CRU.quinzePorCento });
  soNoNome.promocoes[3].nome = "Prêmio de Seguidor";
  assert.deepEqual(textos(abaixoDoMinimo([soNoNome], AGORA)), ["sem Prêmio de Seguidor"]);
});

test("um DESCONTO com o parâmetro do Prêmio não substitui o cupom", () => {
  // O Prêmio é um CUPOM. Nem o parâmetro certo em outro tipo de ferramenta vale.
  const l = completa();
  l.promocoes[3] = { tipo: "desconto", nome: "x", inicio: h(-10), fim: h(100), bruto: { ...CRU.premio } };
  assert.deepEqual(textos(abaixoDoMinimo([l], AGORA)), ["3/4 cupons", "sem Prêmio de Seguidor"]);
});

test("loja ainda não ressincronizada não é acusada de nada que dependa do cru", () => {
  // Os campos crus passaram a ser guardados depois. Enquanto o sync não passa,
  // dá para contar os cupons mas não dá para saber se um deles é o Prêmio —
  // e acusar a base inteira por um dado que não chegou é o erro do "3
  // descontos", que disparava em 35 de 40 lojas. Some sozinho no próximo sync.
  const velha = completa();
  velha.promocoes = velha.promocoes.map(({ bruto, ...p }) => p);
  assert.deepEqual(abaixoDoMinimo([velha], AGORA), []);

  // E com um cupom a menos ela ainda acusa a contagem, que independe do cru.
  velha.promocoes.splice(0, 1);
  assert.deepEqual(textos(abaixoDoMinimo([velha], AGORA)), ["3/4 cupons"]);
});

test("cupom sem os campos crus não vira Prêmio por acidente", () => {
  assert.equal(ehPremioSeguidor({ tipo: "cupom", nome: "seguidor" }), false);
  assert.equal(ehPremioSeguidor({ tipo: "cupom", bruto: {} }), false);
});

test("aceita a regra com vários valores possíveis", () => {
  // O mecanismo aceita uma lista, caso a Shopee use mais de um valor para a
  // mesma finalidade em outra loja.
  const l = comBruto(completa(), 3, { voucher_purpose: 5 });
  assert.deepEqual(abaixoDoMinimo([l], AGORA, undefined, { campo: "voucher_purpose", valor: [3, 5] }), []);
});

test("dá para trocar o campo sem mexer na tela", () => {
  const l = comBruto(completa(), 3, { outro_campo: 42 });
  assert.deepEqual(abaixoDoMinimo([l], AGORA, undefined, { campo: "outro_campo", valor: 42 }), []);
});

test("promoção vencida ou ainda agendada não conta como ativa", () => {
  const l = completa();
  l.promocoes[0] = { tipo: "cupom", nome: "vencido", inicio: h(-50), fim: h(-1), bruto: { ...CRU.quinzePorCento } };
  l.promocoes[1] = { tipo: "cupom", nome: "agendado", inicio: h(10), fim: h(100), bruto: { ...CRU.vintecinco } };
  assert.deepEqual(textos(abaixoDoMinimo([l], AGORA)), ["2/4 cupons"]);
});

test("cupom sem datas conta como ativo", () => {
  const l = completa();
  l.promocoes[0] = { tipo: "cupom", nome: "sem datas", bruto: { ...CRU.quinzePorCento } };
  assert.deepEqual(abaixoDoMinimo([l], AGORA), []);
});

test("loja sem nenhuma ferramenta acusa os cupons que faltam", () => {
  const r = abaixoDoMinimo([{ cliente: "Vazia", promocoes: [] }], AGORA);
  assert.deepEqual(textos(r), ["0/4 cupons"]);
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
