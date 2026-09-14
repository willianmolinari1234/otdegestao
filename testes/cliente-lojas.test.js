// A aba "Minha loja" da área do cliente.
//
// Ela mostra TRÊS coisas e nada além: quais são as lojas, quantos anúncios
// tem cada uma, e quanto cada uma faturou. Conferir preço é trabalho da
// equipe — um alerta de precificação aqui pediria ao lojista uma decisão que
// não é dele.
//
// O faturamento é o ponto sensível: `sales` é fechada a papel externo no
// firestore.rules e CONTINUA fechada. Quem soma é o servidor, e devolve só as
// lojas daquele proprietário. Os testes guardam as duas pontas.
//
// O código vive dentro do HTML, então as funções são arrancadas do arquivo e
// rodadas de verdade, em vez de conferidas por expressão regular.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(raiz, "cliente.html"), "utf8");
const back = fs.readFileSync(path.join(raiz, "functions/index.js"), "utf8");
const regras = fs.readFileSync(path.join(raiz, "firestore.rules"), "utf8");

/** Arranca uma função do cliente.html pelo nome, com o corpo inteiro. */
function funcao(nome) {
  const i = html.indexOf(`function ${nome}(`);
  assert.ok(i > 0, `função ${nome}() não existe mais em cliente.html`);
  let n = 0;
  for (let k = html.indexOf("{", i); k < html.length; k++) {
    if (html[k] === "{") n++;
    else if (html[k] === "}" && --n === 0) return html.slice(i, k + 1);
  }
  throw new Error(`não achei o fim de ${nome}()`);
}
/** O mesmo para as const de uma linha, sem o `const`: declaração léxica não
    vira propriedade do contexto e o teste não a enxergaria. */
function constante(nome) {
  const l = html.split("\n").find((x) => x.trim().startsWith(`const ${nome} =`));
  assert.ok(l, `const ${nome} não existe mais`);
  return l.trim().replace(/^const\s+/, "");
}

/** Um mundo mínimo onde as funções do cliente rodam. */
function mundo(anuncios, faturamento = null) {
  const ctx = { estado: { anuncios, faturamento }, Math, Number, Set, Array, Object, String };
  vm.createContext(ctx);
  vm.runInContext([constante("lojaDe"), constante("rotuloLojas"),
                   funcao("resumoDasLojas")].join("\n;\n"), ctx);
  return ctx;
}

// ─── O nome da aba ────────────────────────────────────────────────────

test("uma loja só é 'Minha loja', não 'Minhas lojas'", () => {
  // Quem tem uma loja lendo o plural percebe que a tela foi escrita para outra
  // pessoa — e a maioria dos lojistas da OTDE tem uma loja só.
  const { rotuloLojas } = mundo([]);
  assert.equal(rotuloLojas(1), "Minha loja");
  assert.equal(rotuloLojas(2), "Minhas lojas");
  assert.equal(rotuloLojas(0), "Minhas lojas", "sem loja, o genérico");
});

test("a aba é reescrita a cada desenho, e não só ao carregar", () => {
  assert.match(html, /function desenhar\(\) \{\s*\n\s*ajustarAbaLojas\(\);/);
  assert.match(html, /if \(estado\.modo === "especialista"\) return;/,
    "no modo especialista a aba se chama 'Clientes' e não pode ser renomeada");
});

// ─── O agrupamento ────────────────────────────────────────────────────

test("os anúncios viram uma linha por loja, com a contagem certa", () => {
  const { resumoDasLojas } = mundo([
    { id: "a1", storeId: "L1", storeNome: "Ninho de Anjo", mkt: "Shopee" },
    { id: "a2", storeId: "L1", storeNome: "Ninho de Anjo", mkt: "Shopee" },
    { id: "a3", storeId: "L2", storeNome: "Laços de Lã", mkt: "Shopee" },
  ]);
  const lojas = resumoDasLojas();
  assert.equal(lojas.length, 2);
  assert.equal(lojas.find((l) => l.id === "L1").anuncios, 2);
  assert.equal(lojas.find((l) => l.id === "L2").anuncios, 1);
});

test("duas lojas de mesmo nome não se fundem numa só", () => {
  // A chave é o id justamente por isso: nome de loja se repete no mundo real.
  const { resumoDasLojas } = mundo([
    { id: "a1", storeId: "L1", storeNome: "Bella", mkt: "Shopee" },
    { id: "a2", storeId: "L2", storeNome: "Bella", mkt: "Mercado Livre" },
  ]);
  assert.equal(resumoDasLojas().length, 2);
});

test("anúncio sem id de loja ainda aparece, pelo nome", () => {
  // Anúncio vindo de planilha antiga às vezes não tem storeId.
  const { resumoDasLojas } = mundo([{ id: "a1", storeNome: "Bella", mkt: "Shopee" }]);
  const [l] = resumoDasLojas();
  assert.equal(l.nome, "Bella");
  assert.equal(l.anuncios, 1);
});

// ─── O faturamento ────────────────────────────────────────────────────

test("o faturamento do servidor entra na loja certa, pelo id", () => {
  const { resumoDasLojas } = mundo(
    [{ id: "a1", storeId: "L1", storeNome: "Ninho", mkt: "Shopee" },
     { id: "a2", storeId: "L2", storeNome: "Laços", mkt: "Shopee" }],
    { dias: 30, porLoja: { L1: { nome: "Ninho de Anjo Baby", gmv: 12500.5, pedidos: 210 },
                           L2: { nome: "Laços de Lã", gmv: 8300, pedidos: 140 } } });
  const lojas = resumoDasLojas();
  assert.equal(lojas[0].id, "L1", "a loja que mais faturou vem primeiro");
  assert.equal(lojas[0].gmv, 12500.5);
  assert.equal(lojas[0].pedidos, 210);
  assert.equal(lojas[0].nome, "Ninho de Anjo Baby", "o nome do cadastro vence o do anúncio");
});

test("enquanto o servidor não responde, o faturamento é nulo — nunca zero", () => {
  // R$ 0,00 numa loja que vendeu seria mentira. A tela mostra "—".
  const { resumoDasLojas } = mundo([{ id: "a1", storeId: "L1", storeNome: "Bella", mkt: "Shopee" }]);
  assert.equal(resumoDasLojas()[0].gmv, null);
  assert.match(html, /estado\.faturamento === null/, "a tela precisa distinguir os dois casos");
  assert.match(html, /esperando \|\| l\.gmv === null \? "—"/);
});

test("loja sem venda no período fica em zero, e isso é diferente de nulo", () => {
  const { resumoDasLojas } = mundo(
    [{ id: "a1", storeId: "L1", storeNome: "Bella", mkt: "Shopee" }],
    { dias: 30, porLoja: { L1: { nome: "Bella", gmv: 0, pedidos: 0 } } });
  assert.equal(resumoDasLojas()[0].gmv, 0);
});

// ─── A trava que não se negocia ───────────────────────────────────────

test("a área do cliente não lê vendas, e a regra continua só para funcionário", () => {
  assert.doesNotMatch(html, /collection\(db, "sales"\)/,
    "a área do cliente passou a ler vendas direto");
  assert.match(regras, /match \/sales\/\{id\}\s*\{\s*allow read: if ehFuncionario\(\);/,
    "sales deixou de ser exclusiva de funcionário");
});

test("o servidor só soma as lojas DO proprietário que pediu", () => {
  // A consulta parte de clients filtrado pelo custId do autor. Uma loja de
  // outro cliente nunca entra na busca — não é filtrada depois, não entra.
  const i = back.indexOf("export const faturamentoDoCliente");
  assert.ok(i > 0, "o endpoint sumiu");
  const corpo = back.slice(i, i + 2400);
  assert.match(corpo, /await exigirDonoDaFicha\(req,/, "sem autor verificado não há resposta");
  assert.match(corpo, /if \(!autor\) \{ res\.status\(403\)/);
  assert.match(corpo, /collection\("clients"\)\.where\("custId", "==", autor\.custId\)/);
  assert.match(corpo, /collection\("sales"\)[\s\S]{0,40}\.where\("cliente", "==", d\.id\)/,
    "a soma tem que partir das lojas daquele custId");
});

test("o período do faturamento é limitado: ninguém pede o histórico inteiro", () => {
  const i = back.indexOf("export const faturamentoDoCliente");
  assert.match(back.slice(i, i + 2400),
    /Math\.min\(90, Math\.max\(1, Number\(req\.query\.dias\) \|\| 30\)\)/);
});

// ─── O que saiu de propósito ──────────────────────────────────────────

test("não há mais alerta de preço na tela do cliente", () => {
  // Quem confere precificação é a equipe. Um alerta aqui pede ao lojista uma
  // decisão que não é dele, com um número que ele não sabe interpretar.
  assert.doesNotMatch(html, /precosQueDivergem/);
  assert.doesNotMatch(html, /preço diferente entre suas lojas/);
});

test("a tela do cliente não fala mais em '?cliente='", () => {
  // Funcionário que abriu /cliente direto entrou pela porta errada, não errou
  // nada — e detalhe de endereço não é recado para ninguém.
  assert.doesNotMatch(html, /Falta dizer de qual cliente/);
  assert.match(html, /Entrar como cliente/, "no lugar, o caminho em português");
  assert.match(html, /classList\.toggle\("recado", daEquipe\)/, "e sem o vermelho de alarme");
});

// ─── A ferramenta parceira ────────────────────────────────────────────

test("a JoomPulse vive na área do CLIENTE, não na da equipe", () => {
  // É ferramenta para o lojista escolher o que vender, ao lado do botão de
  // cadastrar produto. Na barra da equipe ela não tinha o que fazer.
  // O link de parceria da OTDE, com o código de promoção. Perder o
  // promocode devolve o lojista ao site normal, sem o benefício.
  assert.match(html, /href="https:\/\/joompulse\.com\/fast-track\?utm_source=influence&amp;promocode=OTDE30"/);
  assert.match(html, /Pesquisa de mercado e de novos produtos/);
  const app = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.doesNotMatch(app, /joompulse/i, "ainda está na área da equipe");
});

test("a JoomPulse abre fora do sistema, em aba nova e sem carona", () => {
  assert.match(html, /target="_blank" rel="noopener noreferrer"/,
    "link externo sem noopener deixa a outra aba mexer nesta");
  assert.match(html, /class="parceira-fora"/, "a seta avisa que troca de site");
});

test("o logo da entrada do cliente é a marca, não uma letra num quadradinho", () => {
  // Era `<div class="logo">O</div>` — um substituto que ficou no ar depois
  // que a logo de verdade já existia.
  assert.doesNotMatch(html, /<div class="logo">O<\/div>/);
  assert.match(html, /<img class="logo" src="data:image\/png;base64,/);
  assert.doesNotMatch(html, /\.logo\{[^}]*border-radius:12px/,
    "a moldura do quadradinho voltou");
});
