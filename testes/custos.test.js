// Testes do cruzamento venda × custo.
// Importa o módulo real — o mesmo arquivo que o navegador carrega.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarSku, indexarCustos, custoDoItem, apurarCustos,
  numeroBR, interpretarPlanilha,
} from "../js/custos.js";

// ─── numeroBR ─────────────────────────────────────────────────────────

test("lê dinheiro no formato brasileiro", () => {
  assert.equal(numeroBR("R$ 23,90"), 23.9);
  assert.equal(numeroBR("R$ 1.234,56"), 1234.56);
  assert.equal(numeroBR("49"), 49);
  assert.equal(numeroBR("13,50"), 13.5);
});

test("número sem vírgula mantém o ponto como decimal", () => {
  assert.equal(numeroBR("1234.56"), 1234.56);
});

test("vazio vira null, não zero", () => {
  // Zero seria interpretado como 'custo zero' e inflaria o lucro.
  for (const v of ["", "  ", null, undefined, "abc"]) assert.equal(numeroBR(v), null);
});

// ─── interpretarPlanilha ──────────────────────────────────────────────
// Colunas iguais às da planilha real do cliente.

const CABECALHO = "SKU\tPRODUTO VENDIDO\tVALOR DA VENDA\tTAXA SHOPEE\tIMPOSTO\tTAXA FIXA\tGestão\tCUSTO PRODUTO\tLUCRO VENDA\tMARGEM CONTRI. (%)";

test("lê a planilha real do cliente", () => {
  const r = interpretarPlanilha([CABECALHO,
    "1\tSaia\tR$ 23,90\tR$ 4,78\tR$ 2,15\tR$ 4,00\t0,478\tR$ 9,00\tR$ 3,49\t14,6",
    "8\tvestido ombro a ombro\tR$ 129,90\tR$ 18,19\tR$ 11,69\tR$ 20,00\t2,598\tR$ 49,00\tR$ 28,43\t21,9",
  ].join("\n"));
  assert.equal(r.produtos.length, 2);
  assert.deepEqual(r.produtos[1], { sku: "8", nome: "vestido ombro a ombro", valor: 129.9, custo: 49 });
});

test("SKU repetido com o mesmo custo vira uma linha só", () => {
  // Vários anúncios do mesmo produto — o caso normal da planilha.
  const r = interpretarPlanilha([CABECALHO,
    "8\tvestido\tR$ 129,90\t\t\t\t\tR$ 49,00",
    "8\tvestido\tR$ 129,90\t\t\t\t\tR$ 49,00",
  ].join("\n"));
  assert.equal(r.produtos.length, 1);
  assert.equal(r.conflitos.length, 0);
});

test("SKU repetido com custo DIFERENTE não é importado, vira conflito", () => {
  const r = interpretarPlanilha([CABECALHO,
    "8\tvestido\tR$ 129,90\t\t\t\t\tR$ 49,00",
    "8\tvestido\tR$ 129,90\t\t\t\t\tR$ 55,00",
  ].join("\n"));
  assert.equal(r.produtos.length, 0);
  assert.equal(r.conflitos.length, 1);
  assert.deepEqual(r.conflitos[0].custos, [49, 55]);
});

test("aceita as colunas em qualquer ordem", () => {
  const r = interpretarPlanilha([
    "CUSTO PRODUTO\tSKU\tPRODUTO VENDIDO",
    "R$ 13,50\t31\tmanta infantil coracao",
  ].join("\n"));
  assert.equal(r.produtos[0].custo, 13.5);
  assert.equal(r.produtos[0].sku, "31");
});

test("linha sem custo é ignorada, não importada com zero", () => {
  const r = interpretarPlanilha([CABECALHO,
    "1\tSaia\tR$ 23,90\t\t\t\t\t",
    "2\tCropped\tR$ 34,90\t\t\t\t\tR$ 19,00",
  ].join("\n"));
  assert.equal(r.produtos.length, 1);
  assert.equal(r.ignoradas, 1);
});

test("texto sem cabeçalho reconhecível não importa nada", () => {
  // Melhor não importar do que importar errado numa conta de dinheiro.
  const r = interpretarPlanilha("qualquer coisa\noutra linha");
  assert.equal(r.produtos.length, 0);
  assert.equal(r.colunas, null);
});

test("zero à esquerda da planilha casa com o da Shopee", () => {
  const r = interpretarPlanilha([CABECALHO, "08\tvestido\t\t\t\t\t\tR$ 49,00"].join("\n"));
  assert.equal(r.produtos[0].sku, "8");
});

test("texto vazio não quebra", () => {
  const r = interpretarPlanilha("");
  assert.deepEqual(r.produtos, []);
});

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
