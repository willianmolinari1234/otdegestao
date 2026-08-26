// Testes do leitor da planilha do cliente.
//
// Os casos abaixo não são inventados: cada um reproduz uma armadilha que
// apareceu numa planilha real de cliente (3 abas, 60 produtos). Os dados aqui
// são fictícios de propósito — custo de cliente não precisa morar no
// repositório para o teste provar o que tem que provar.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lerAba, chaveDoNome, idDoAnuncio, marketplaceDoLink, numero,
  idDoProduto, idDoAnuncioNaLoja,
} from "../js/planilha-produtos.js";

const aba = (linhas) => linhas.map((l) => l.join("\t")).join("\n");

const CABECALHO = ["ID", "PRODUTO VENDIDO", "VALOR DA VENDA", "CUSTO PRODUTO", "LINK DO ANUNCIO"];
const simples = () => aba([
  CABECALHO,
  ["58204670969", "MANTA TRICOT", "44.9", "24.5", "https://shopee.com.br/product/1721461854/58204670969/"],
  ["58254836473", "BODY CANELADO", "159.9", "67", "https://shopee.com.br/product/1721461854/58254836473/"],
]);

test("lê os produtos de uma aba", () => {
  const r = lerAba(simples());
  assert.equal(r.produtos.length, 2);
  assert.equal(r.produtos[0].nome, "MANTA TRICOT");
  assert.equal(r.produtos[0].custo, 24.5);
  assert.deepEqual(r.produtos[0].anuncios[0], {
    id: "58204670969", preco: 44.9,
    link: "https://shopee.com.br/product/1721461854/58204670969/",
    mkt: "Shopee", foraDoMarketplace: false,
  });
});

test("fórmula arrastada é vazio, não é produto nem perda", () => {
  // Toda aba real tem centenas destas embaixo dos dados. A taxa fixa continua
  // preenchida pela fórmula, então "tem conteúdo" não serve de critério.
  const r = lerAba(aba([
    ["ID", "PRODUTO VENDIDO", "VALOR DA VENDA", "TAXA FIXA", "CUSTO PRODUTO"],
    ["58204670969", "MANTA TRICOT", "44.9", "4", "24.5"],
    ["0", "", "0", "4", "0"],
    ["0", "", "0", "4", "0"],
  ]));
  assert.equal(r.produtos.length, 1);
  assert.equal(r.vazias, 2);
  assert.equal(r.semIdentidade.length, 0);
});

test("acha a coluna de link mesmo sem rótulo, pelo conteúdo", () => {
  // O caso que custou 14 produtos: na aba da Shein o link não tem cabeçalho.
  const r = lerAba(aba([
    ["SKU", "PRODUTO VENDIDO", "VALOR DA VENDA", "CUSTO PRODUTO", ""],
    ["", "MANTA TRICOT", "69.9", "24.5", "https://br.shein.com/Manta-p-539417461-cat-13061.html"],
    ["", "BODY CANELADO", "99.9", "39", "https://br.shein.com/Body-p-540532637-cat-13046.html"],
    ["", "TOALHA CAPUZ", "54.9", "19.5", "https://br.shein.com/Toalha-p-540999111-cat-13046.html"],
  ]));
  assert.equal(r.colunas.link, 4);
  assert.equal(r.produtos.length, 3);
  assert.equal(r.produtos[0].anuncios[0].id, "539417461");
  assert.equal(r.produtos[0].anuncios[0].mkt, "Shein");
});

test("sem SKU, a identidade é o nome", () => {
  const r = lerAba(simples());
  assert.equal(r.produtos[0].porNome, true);
  assert.equal(r.produtos[0].chave, "MANTA TRICOT");
});

test("acento, caixa e espaço sobrando não criam produto novo", () => {
  const r = lerAba(aba([
    CABECALHO,
    ["58204670969", "SAÍDA DE MATERNIDADE", "44.9", "24.5", ""],
    ["58254836473", "saida de   maternidade ", "49.9", "24.5", ""],
  ]));
  assert.equal(r.produtos.length, 1);
  assert.equal(r.produtos[0].anuncios.length, 2);
});

test("o mesmo produto em duas linhas vira um produto com dois anúncios", () => {
  const r = lerAba(aba([
    CABECALHO,
    ["58204670969", "MANTA TRICOT", "44.9", "24.5", ""],
    ["58254836473", "MANTA TRICOT", "39.9", "24.5", ""],
  ]));
  assert.equal(r.produtos.length, 1);
  assert.deepEqual(r.produtos[0].anuncios.map((a) => a.preco), [44.9, 39.9]);
});

test("preço diferente entre anúncios não é conflito — é o preço de cada anúncio", () => {
  const r = lerAba(aba([CABECALHO,
    ["1111111", "MANTA TRICOT", "44.9", "24.5", ""],
    ["2222222", "MANTA TRICOT", "59.9", "24.5", ""]]));
  assert.equal(r.conflitos.length, 0);
});

test("custo divergente vira conflito e o produto NÃO entra", () => {
  // Caso real: o mesmo produto com R$ 21 numa linha e R$ 41 na outra. Importar
  // qualquer um dos dois estragaria o lucro em silêncio.
  const r = lerAba(aba([CABECALHO,
    ["1111111", "CONJUNTO FURINHO", "44.9", "21", ""],
    ["2222222", "CONJUNTO FURINHO", "49.9", "41", ""]]));
  assert.equal(r.produtos.length, 0);
  assert.equal(r.conflitos.length, 1);
  assert.deepEqual(r.conflitos[0].valores, [21, 41]);
  assert.deepEqual(r.conflitos[0].linhas, [2, 3]);
});

test("linha com dados mas sem nome e sem SKU aparece, com o conteúdo dela", () => {
  // Juntar isto com as linhas vazias num número só foi o que escondeu a perda.
  const r = lerAba(aba([CABECALHO,
    ["1111111", "MANTA TRICOT", "44.9", "24.5", ""],
    ["", "", "99.9", "50", ""]]));
  assert.equal(r.produtos.length, 1);
  assert.equal(r.semIdentidade.length, 1);
  assert.equal(r.semIdentidade[0].linha, 3);
  assert.match(r.semIdentidade[0].conteudo, /99\.9/);
});

test("fotos do Drive não são confundidas com link de anúncio", () => {
  const r = lerAba(aba([
    ["PRODUTO VENDIDO", "CUSTO PRODUTO", "LINK DO ANUNCIO", "FOTOS/VIDEOS"],
    ["MANTA TRICOT", "24.5", "https://shopee.com.br/product/1/58204670969/", "https://drive.google.com/drive/folders/1Nyy"],
  ]));
  assert.equal(r.produtos[0].anuncios[0].id, "58204670969");
  assert.match(r.produtos[0].fotos, /drive\.google/);
});

test("id guardado como número pelo Excel (.0) continua sendo o mesmo anúncio", () => {
  assert.equal(idDoAnuncio("58204670969.0"), "58204670969");
  assert.equal(idDoAnuncio("58204670969"), "58204670969");
  assert.equal(idDoAnuncio("123"), "");
});

test("marketplace sai do host, não do texto solto da URL", () => {
  // shopee.com.br vem depois de "//", não de um ponto: um padrão ancorado em
  // ponto erra justamente o marketplace mais comum daqui, e erra calado.
  assert.equal(marketplaceDoLink("https://shopee.com.br/product/1/2/"), "Shopee");
  assert.equal(marketplaceDoLink("https://br.shein.com/x-p-1-cat-2.html"), "Shein");
  assert.equal(marketplaceDoLink("https://produto.mercadolivre.com.br/MLB-1"), "Mercado Livre");
  assert.equal(marketplaceDoLink("https://exemplo.com/shopee.html"), "");
});

test("link apontando para outro marketplace é marcado, não corrigido", () => {
  const r = lerAba(aba([
    ["PRODUTO VENDIDO", "CUSTO PRODUTO", "LINK DO ANUNCIO"],
    ["MANTA TRICOT", "24.5", "https://br.shein.com/Manta-p-539417461-cat-1.html"],
    ["BODY CANELADO", "39", "https://shopee.com.br/product/1/58254836473/"],
  ]), "Shein");
  assert.equal(r.produtos[0].avisos.length, 0);
  assert.equal(r.produtos[1].avisos[0].tipo, "linkDeOutroMarketplace");
  assert.equal(r.produtos[1].avisos[0].mkt, "Shopee");
  assert.deepEqual(r.porMarketplace, { Shein: 1, Shopee: 1 });
});

test("sem marketplace esperado, nada é marcado", () => {
  const r = lerAba(aba([
    ["PRODUTO VENDIDO", "CUSTO PRODUTO", "LINK DO ANUNCIO"],
    ["MANTA TRICOT", "24.5", "https://shopee.com.br/product/1/2222222/"],
  ]));
  assert.equal(r.produtos[0].avisos.length, 0);
});

test("CSV com vírgula e aspas protegendo o valor em reais", () => {
  const r = lerAba('PRODUTO VENDIDO,CUSTO PRODUTO\nMANTA TRICOT,"R$ 1.234,56"');
  assert.equal(r.produtos[0].custo, 1234.56);
});

test("descritivo vazio não apaga o que outra linha trouxe", () => {
  // Numa planilha real o peso vem preenchido em 3 de 25 linhas.
  const r = lerAba(aba([
    ["PRODUTO VENDIDO", "CUSTO PRODUTO", "PESO DO PRODUTO"],
    ["MANTA TRICOT", "24.5", ""],
    ["MANTA TRICOT", "24.5", "0,200 G"],
  ]));
  assert.equal(r.produtos[0].peso, "0,200 G");
});

test("colar o endereço da planilha em vez do conteúdo tem aviso próprio", () => {
  const r = lerAba("https://docs.google.com/spreadsheets/d/abc/edit");
  assert.equal(r.ehLink, true);
  assert.equal(r.produtos.length, 0);
});

test("aba sem coluna de produto não inventa nada", () => {
  const r = lerAba(aba([["TAXA", "IMPOSTO"], ["4", "7.5"]]));
  assert.deepEqual(r.produtos, []);
});

test("nada colado não quebra", () => {
  assert.deepEqual(lerAba("").produtos, []);
  assert.deepEqual(lerAba(null).produtos, []);
});

test("números em português e em inglês", () => {
  assert.equal(numero("R$ 44,90"), 44.9);
  assert.equal(numero("44.90"), 44.9);
  assert.equal(numero("1.234,56"), 1234.56);
  assert.equal(numero(""), null);
  assert.equal(chaveDoNome("  Saída   de Maternidade "), "SAIDA DE MATERNIDADE");
});

test("id do produto é previsível: reimportar atualiza, não duplica", () => {
  const a = idDoProduto("cust1", "SAIDA DE MATERNIDADE");
  assert.equal(a, "cust1__saida-de-maternidade");
  assert.equal(idDoProduto("cust1", chaveDoNome(" Saída  de Maternidade ")), a);
  assert.equal(idDoProduto("cust1", ""), "cust1__sem-nome");
  assert.match(idDoProduto("cust1", "MANTA 80×90 / BEBÊ"), /^cust1__[a-z0-9-]+$/);
});

test("id do anúncio usa o do marketplace quando existe", () => {
  assert.equal(idDoAnuncioNaLoja("loja1", "58204670969", "X"), "loja1__58204670969");
  assert.equal(idDoAnuncioNaLoja("loja1", "", "MANTA TRICOT"), "loja1__manta-tricot");
});
