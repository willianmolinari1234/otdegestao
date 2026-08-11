// Testes do cruzamento venda × custo.
// Importa o módulo real — o mesmo arquivo que o navegador carrega.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarSku, indexarCustos, custoDoItem, apurarCustos,
} from "../js/custos.js";

// ─── normalizarSku ────────────────────────────────────────────────────
// Caso real: a Casulo Tricot vende com item_sku "08"; a planilha tem "8".

test("zero à esquerda não impede o casamento", () => {
  assert.equal(normalizarSku("08"), normalizarSku("8"));
  assert.equal(normalizarSku("02"), "2");
});

test("espaço e caixa não impedem o casamento", () => {
  assert.equal(normalizarSku(" 1759 "), "1759");
  assert.equal(normalizarSku("fil-vei-v40"), "FIL-VEI-V40");
});

test("código misto preserva o zero à esquerda", () => {
  // Aqui o zero pode ser parte do código de verdade.
  assert.equal(normalizarSku("0800-ABC"), "0800-ABC");
});

test("vazio, nulo e indefinido viram string vazia", () => {
  for (const v of ["", "   ", null, undefined]) assert.equal(normalizarSku(v), "");
});

// ─── indexarCustos ────────────────────────────────────────────────────

test("indexa produto simples pelo SKU", () => {
  const { indice } = indexarCustos([{ cli: "A", sku: "8", nome: "vestido", custo: 49 }], "A");
  assert.equal(indice.get("8").custo, 49);
});

test("ignora produtos de outra loja", () => {
  const { indice } = indexarCustos([{ cli: "B", sku: "8", custo: 49 }], "A");
  assert.equal(indice.size, 0);
});

test("variação com código próprio entra separada", () => {
  const { indice } = indexarCustos([{
    cli: "A", sku: "1759", nome: "cropped",
    vars: [{ sku: "1759P", nome: "Preto", custo: 20 }, { sku: "1759MM", nome: "Marrom", custo: 25 }],
  }], "A");
  assert.equal(indice.get("1759P").custo, 20);
  assert.equal(indice.get("1759MM").custo, 25);
});

test("variação sem código próprio herda o código do produto", () => {
  const { indice } = indexarCustos([{
    cli: "A", sku: "546", vars: [{ nome: "GG", custo: 30 }],
  }], "A");
  assert.equal(indice.get("546").custo, 30);
});

test("mesmo SKU com custos diferentes vira conflito, não escolha silenciosa", () => {
  const { conflitos } = indexarCustos([
    { cli: "A", sku: "8", nome: "vestido", custo: 49 },
    { cli: "A", sku: "08", nome: "vestido novo", custo: 55 },
  ], "A");
  assert.equal(conflitos.length, 1);
  assert.deepEqual(conflitos[0].custos, [49, 55]);
});

test("mesmo SKU com o MESMO custo não é conflito", () => {
  // O caso da planilha real: SKU repetido por ter vários anúncios.
  const { conflitos, indice } = indexarCustos([
    { cli: "A", sku: "8", custo: 49 },
    { cli: "A", sku: "8", custo: 49 },
  ], "A");
  assert.equal(conflitos.length, 0);
  assert.equal(indice.get("8").custo, 49);
});

// ─── custoDoItem ──────────────────────────────────────────────────────

test("a variação tem prioridade sobre o anúncio", () => {
  // Garcia & Leite: item_sku igual em todas as variações, model_sku distingue.
  const { indice } = indexarCustos([{
    cli: "A", sku: "20099492505",
    vars: [{ sku: "protetor_brancoq", nome: "Queen", custo: 40 },
           { sku: "protetor_pretos", nome: "Solteiro", custo: 25 }],
  }], "A");
  const r = custoDoItem(indice, { item_sku: "20099492505", model_sku: "protetor_pretos" });
  assert.equal(r.custo, 25);
  assert.equal(r.achadoPor, "model_sku");
});

test("sem variação conhecida, cai para o código do anúncio", () => {
  const { indice } = indexarCustos([{ cli: "A", sku: "797", custo: 12 }], "A");
  const r = custoDoItem(indice, { item_sku: "797", model_sku: "" });
  assert.equal(r.custo, 12);
  assert.equal(r.achadoPor, "item_sku");
});

test("sem código nenhum devolve null, nunca zero", () => {
  const { indice } = indexarCustos([{ cli: "A", sku: "797", custo: 12 }], "A");
  const r = custoDoItem(indice, { item_sku: "", model_sku: "" });
  assert.equal(r.custo, null);
});

// ─── apurarCustos ─────────────────────────────────────────────────────

test("apura custo e margem quando tudo é conhecido", () => {
  const { indice } = indexarCustos([
    { cli: "A", sku: "8", custo: 49 }, { cli: "A", sku: "21", custo: 41 },
  ], "A");
  const r = apurarCustos([
    { item_sku: "08", qtd: 2, valor: 259.80 },
    { item_sku: "21", qtd: 1, valor: 99.90 },
  ], indice);
  assert.equal(r.custoTotal, 139);      // 49*2 + 41
  assert.equal(r.margemBruta, 220.70);  // 359,70 - 139
  assert.equal(r.cobertura, 1);
});

test("item sem custo NÃO entra como zero e derruba a cobertura", () => {
  const { indice } = indexarCustos([{ cli: "A", sku: "8", custo: 49 }], "A");
  const r = apurarCustos([
    { item_sku: "8", qtd: 1, valor: 100 },
    { item_sku: "999", qtd: 1, valor: 100, nome: "produto sem cadastro" },
  ], indice);
  assert.equal(r.custoTotal, 49);          // só o conhecido
  assert.equal(r.receitaComCusto, 100);
  assert.equal(r.margemBruta, 51);         // NÃO 151
  assert.equal(r.cobertura, 0.5);
  assert.equal(r.itensSemCusto, 1);
});

test("loja sem SKU nenhum: cobertura zero, não lucro cheio", () => {
  // ekisclean, Ninho de Anjo, Montellã: nenhum anúncio com código.
  const { indice } = indexarCustos([], "A");
  const r = apurarCustos([{ item_sku: "", model_sku: "", qtd: 3, valor: 300 }], indice);
  assert.equal(r.cobertura, 0);
  assert.equal(r.custoTotal, 0);
  assert.equal(r.margemBruta, 0);
});

test("lista os sem custo pelo maior valor, para saber o que cadastrar antes", () => {
  const { indice } = indexarCustos([], "A");
  const r = apurarCustos([
    { item_sku: "A1", qtd: 1, valor: 50 },
    { item_sku: "B2", qtd: 1, valor: 500 },
  ], indice);
  assert.equal(r.semCusto[0].sku, "B2");
});

test("período sem venda não quebra e não inventa cobertura", () => {
  const { indice } = indexarCustos([], "A");
  const r = apurarCustos([], indice);
  assert.equal(r.receita, 0);
  assert.equal(r.cobertura, 0);
});
