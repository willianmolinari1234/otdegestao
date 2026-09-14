// A aba "Minhas lojas" da área do cliente.
//
// Era a tela mais magra do sistema: nome da loja, marketplace e uma contagem.
// O lojista abre esperando desempenho e encontrava um crachá.
//
// Venda ele NÃO pode ver: `sales` é fechada a papel externo no firestore.rules,
// e relaxar isso para enfeitar uma tela é o erro que a regra de ouro proíbe.
// Então a aba responde com o que ele já lê — onde o catálogo dele está, onde
// não está, e por quanto.
//
// O código vive dentro do HTML, então aqui as funções são arrancadas do
// arquivo e rodadas de verdade, em vez de conferidas por expressão regular.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(raiz, "cliente.html"), "utf8");

/** Arranca uma função do cliente.html pelo nome, com o corpo inteiro. */
function funcao(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `função ${nome}() não existe mais em cliente.html`);
  let n = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") n++;
    else if (html[k] === "}" && --n === 0) return html.slice(i, k + 1);
  }
  throw new Error(`não achei o fim de ${nome}()`);
}
/** O mesmo, para as const de uma linha — sem o `const`, porque declaração
    léxica não vira propriedade do contexto e o teste não a enxergaria. */
function constante(nome) {
  const l = html.split("\n").find((x) => x.trim().startsWith(`const ${nome} =`));
  assert.ok(l, `const ${nome} não existe mais`);
  return l.trim().replace(/^const\s+/, "");
}

/** Um mundo mínimo onde as funções do cliente rodam. */
function mundo(produtos, anuncios) {
  const ctx = {
    estado: { produtos, anuncios },
    // o mesmo casamento produto↔anúncio que o resto da tela usa
    anunciosDe: (p) => anuncios.filter((a) => a.produtoId === p.id || (a.chave && a.chave === p.chave)),
    Math, Number, Set, Array, JSON, String, Object,
  };
  vm.createContext(ctx);
  vm.runInContext([constante("lojaDe"), constante("rotuloLojas"),
                   funcao("resumoDasLojas"), funcao("precosQueDivergem")].join("\n;\n"), ctx);
  return ctx;
}

const PRODUTOS = [
  { id: "p1", sku: "CX-P", nome: "Caixa P" },
  { id: "p2", sku: "CX-M", nome: "Caixa M" },
  { id: "p3", sku: "FT",   nome: "Fita" },
  { id: "p4", sku: "PB",   nome: "Plástico bolha" },
];

// ─── O nome da aba ────────────────────────────────────────────────────

test("uma loja só é 'Minha loja', não 'Minhas lojas'", () => {
  // Cliente com uma loja lendo o plural percebe na hora que a tela foi escrita
  // para outra pessoa — e a maioria dos lojistas da OTDE tem uma loja só.
  const { rotuloLojas } = mundo(PRODUTOS, []);
  assert.equal(rotuloLojas(1), "Minha loja");
  assert.equal(rotuloLojas(2), "Minhas lojas");
  assert.equal(rotuloLojas(0), "Minhas lojas", "sem loja, o genérico");
});

test("a aba é reescrita a cada desenho, e não só ao carregar", () => {
  // A primeira loja do cliente pode aparecer depois da tela já estar aberta.
  assert.match(html, /function desenhar\(\) \{\s*\n\s*ajustarAbaLojas\(\);/);
  assert.match(html, /if \(estado\.modo === "especialista"\) return;/,
    "no modo especialista a aba se chama 'Clientes' e não pode ser renomeada");
});

// ─── Cobertura por loja ───────────────────────────────────────────────

test("cada loja diz quanto do catálogo já está nela", () => {
  const { resumoDasLojas } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 2.9 },
    { id: "a2", produtoId: "p3", mkt: "Shopee", storeNome: "Bella", preco: 7.9 },
    { id: "a3", produtoId: "p1", mkt: "Mercado Livre", storeNome: "Bella Oficial", preco: 3.49 },
  ]);
  const lojas = resumoDasLojas();
  assert.equal(lojas.length, 2);
  assert.equal(lojas[0].nome, "Bella", "a loja mais completa vem primeiro");
  assert.equal(lojas[0].produtos.size, 2, "2 dos 4 produtos estão na Bella");
  assert.equal(lojas[1].produtos.size, 1);
});

test("a contagem é de PRODUTOS, não de anúncios", () => {
  // Dois anúncios do mesmo produto na mesma loja não viram cobertura de dois.
  const { resumoDasLojas } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 2.9 },
    { id: "a2", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 3.1 },
  ]);
  const [loja] = resumoDasLojas();
  assert.equal(loja.produtos.size, 1, "um produto");
  assert.equal(loja.anuncios, 2, "dois anúncios");
});

test("anúncio sem preço não estraga a faixa de preço", () => {
  // Anúncio vindo de planilha antiga às vezes chega sem preço.
  const { resumoDasLojas } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 2.9 },
    { id: "a2", produtoId: "p2", mkt: "Shopee", storeNome: "Bella" },
    { id: "a3", produtoId: "p3", mkt: "Shopee", storeNome: "Bella", preco: 0 },
  ]);
  const [loja] = resumoDasLojas();
  assert.equal(loja.precos.join(","), "2.9", "só o preço que existe entra na faixa");
});

test("loja sem nome cai no marketplace, em vez de virar uma loja chamada '—'", () => {
  const { resumoDasLojas } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", preco: 2.9 },
  ]);
  assert.equal(resumoDasLojas()[0].nome, "Shopee");
});

// ─── Preço diferente entre lojas ──────────────────────────────────────

test("o mesmo produto por preços diferentes aparece, com a diferença em %", () => {
  const { precosQueDivergem } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 2.90 },
    { id: "a2", produtoId: "p1", mkt: "Mercado Livre", storeNome: "Oficial", preco: 3.49 },
  ]);
  const [d] = precosQueDivergem();
  assert.equal(d.produto.id, "p1");
  assert.equal(d.dif, 20, "3,49 sobre 2,90 dá 20%");
  assert.equal(d.onde.map((o) => o.preco).join(" "), "2.9 3.49", "do mais barato ao mais caro");
});

test("preço igual nas duas lojas não vira alerta", () => {
  const { precosQueDivergem } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 7.90 },
    { id: "a2", produtoId: "p1", mkt: "Mercado Livre", storeNome: "Oficial", preco: 7.90 },
  ]);
  assert.equal(precosQueDivergem().length, 0);
});

test("produto anunciado num lugar só nunca diverge de nada", () => {
  const { precosQueDivergem } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "Bella", preco: 2.90 },
  ]);
  assert.equal(precosQueDivergem().length, 0);
});

test("a maior diferença vem primeiro: é a que pede decisão", () => {
  const { precosQueDivergem } = mundo(PRODUTOS, [
    { id: "a1", produtoId: "p1", mkt: "Shopee", storeNome: "B", preco: 10 },
    { id: "a2", produtoId: "p1", mkt: "Mercado Livre", storeNome: "O", preco: 11 },
    { id: "a3", produtoId: "p3", mkt: "Shopee", storeNome: "B", preco: 10 },
    { id: "a4", produtoId: "p3", mkt: "Mercado Livre", storeNome: "O", preco: 20 },
  ]);
  const ds = precosQueDivergem();
  assert.equal(ds.map((d) => d.produto.id).join(","), "p3,p1");
  assert.equal(ds[0].dif, 100);
});

// ─── O que a tela NÃO pode fazer ──────────────────────────────────────

test("a tela do cliente não lê vendas, e as regras continuam fechadas", () => {
  // O pedido era "melhore esta área". A saída fácil seria mostrar faturamento
  // — que exigiria abrir `sales` para papel externo. Não se faz.
  assert.doesNotMatch(html, /collection\(db, "sales"\)/,
    "a área do cliente passou a ler vendas");
  const regras = fs.readFileSync(path.join(raiz, "firestore.rules"), "utf8");
  assert.match(regras, /match \/sales\/\{id\}\s*\{\s*allow read: if ehFuncionario\(\);/,
    "sales deixou de ser exclusiva de funcionário");
});

test("o botão de 'o que falta' leva para a lista já filtrada", () => {
  // Sem isso o cliente lê "faltam 6" e não tem o que fazer com a informação.
  assert.match(html, /estado\.faltaEm = b\.dataset\.faltaqui;/);
  assert.match(html, /estado\.aba = "produtos";/);
});

test("um produto faltando vira 'o que falta', não 'os 1 que faltam'", () => {
  assert.match(html, /falta === 1 \? "Ver o que falta"/);
});
