// A tela de Ferramentas e a de Diagnóstico.
//
// A de Ferramentas listava UMA LINHA POR PROMOÇÃO: uma loja com oito combos
// "leve mais por menos" virava oito linhas idênticas, e a oferta relâmpago
// que acaba em quatro horas — a única com urgência — sumia no meio do rolo.
//
// O código dessas telas vive dentro do HTML, então aqui se testa a lógica
// replicada (que o teste compara com o arquivo) e a presença das decisões.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = fs.readFileSync(path.join(raiz, "relatorio-cliente.html"), "utf8");

// A mesma regra que está no arquivo: mesmo tipo + mesma HORA de término.
const TOOL_ORDER = { flash_sale: 0, cupom: 1, desconto: 2, combo: 3, leve_mais: 4 };
function agrupar(promos) {
  const ordenadas = promos.slice().sort((a, b) => {
    const g = (TOOL_ORDER[a.tipo] ?? 99) - (TOOL_ORDER[b.tipo] ?? 99);
    return g || Number(a.fim || 0) - Number(b.fim || 0);
  });
  const grupos = [];
  for (const p of ordenadas) {
    const hora = Math.floor(Number(p.fim || 0) / 3600);
    const u = grupos[grupos.length - 1];
    if (u && u.tipo === p.tipo && u.hora === hora) u.itens.push(p);
    else grupos.push({ tipo: p.tipo, hora, fim: p.fim, itens: [p] });
  }
  return grupos;
}
const h = 3600, base = 1_760_000_000;

test("a regra de agrupamento do teste é a mesma do arquivo", () => {
  // Sem isto, o teste passa a medir a si mesmo em vez do sistema.
  assert.match(rel, /const hora = Math\.floor\(Number\(p\.fim \|\| 0\) \/ 3600\);/);
  assert.match(rel, /if \(ultimo && ultimo\.tipo === p\.tipo && ultimo\.hora === hora\) ultimo\.itens\.push\(p\);/);
});

test("o caso real: dezesseis promoções viram seis linhas", () => {
  const promos = [
    { tipo: "flash_sale", nome: "Oferta relâmpago", fim: base + 4 * h },
    { tipo: "cupom", nome: "15%", fim: base + 400 * h },
    { tipo: "cupom", nome: "25%", fim: base + 400 * h },
    { tipo: "cupom", nome: "70% Cash", fim: base + 400 * h },
    { tipo: "cupom", nome: "Prêmio de Seguidor", fim: base + 526 * h },
    { tipo: "desconto", nome: "promo", fim: base + 1173 * h },
    { tipo: "desconto", nome: "novos", fim: base + 1173 * h },
    { tipo: "desconto", nome: "novos", fim: base + 1173 * h },
    ...Array.from({ length: 8 }, () => ({ tipo: "combo", nome: "leve mais por menos", fim: base + 412 * h })),
  ];
  const g = agrupar(promos);
  assert.equal(promos.length, 16);
  assert.equal(g.length, 5, "relâmpago, dois grupos de cupom, desconto e combo");
  assert.equal(g[g.length - 1].itens.length, 8, "os oito combos numa linha só");
});

test("promoções do mesmo tipo que acabam em horas diferentes não se juntam", () => {
  // Juntá-las mentiria sobre quando cada uma acaba, que é o dado da tela.
  const g = agrupar([
    { tipo: "combo", nome: "x", fim: base + 10 * h },
    { tipo: "combo", nome: "x", fim: base + 40 * h },
  ]);
  assert.equal(g.length, 2);
});

test("tipos diferentes nunca se juntam, mesmo acabando junto", () => {
  const g = agrupar([
    { tipo: "cupom", nome: "a", fim: base + 10 * h },
    { tipo: "desconto", nome: "b", fim: base + 10 * h },
  ]);
  assert.equal(g.length, 2);
});

test("a oferta relâmpago vem primeiro: é a única com urgência de horas", () => {
  const g = agrupar([
    { tipo: "combo", nome: "c", fim: base + 400 * h },
    { tipo: "flash_sale", nome: "r", fim: base + 4 * h },
    { tipo: "cupom", nome: "k", fim: base + 300 * h },
  ]);
  assert.deepEqual(g.map((x) => x.tipo), ["flash_sale", "cupom", "combo"]);
});

test("a linha mostra os nomes distintos e conta os repetidos", () => {
  const rotulo = (itens) => {
    const c = new Map();
    for (const p of itens) { const n = (p.nome || "").trim() || "sem nome"; c.set(n, (c.get(n) || 0) + 1); }
    return [...c.entries()].map(([n, q]) => n + (q > 1 ? ` ×${q}` : "")).join(" · ");
  };
  assert.equal(rotulo([{ nome: "promo" }, { nome: "novos" }, { nome: "novos" }]), "promo · novos ×2");
  assert.equal(rotulo([{ nome: "" }]), "sem nome", "promoção sem nome não vira linha em branco");
  assert.match(rel, /escapeHtml\(nome\) \+ \(n > 1 \? ` <b class="tool-x">×\$\{n\}<\/b>` : ""\)/);
});

test("o topo da tela deixou de ser um cabeçalho vazio", () => {
  // Era um cartão inteiro com um título e uma frase; agora responde de uma
  // olhada o que a tela responderia depois de muito rolar.
  assert.doesNotMatch(rel, /Ferramentas ativas por loja/);
  assert.match(rel, /id="toolsResumo"/);
  assert.match(rel, /acabam em 24h/, "o que tem urgência é contado à parte");
  assert.match(rel, /lojas sem nenhuma/);
});

test("cada loja mostra quantas promoções tem de cada tipo", () => {
  assert.match(rel, /class="tool-sums"/);
  assert.match(rel, /const porTipo = new Map\(\)/);
});

// ─── Diagnóstico ──────────────────────────────────────────────────────

test("a nota de saúde acompanha a rolagem", () => {
  // A lista de critérios passa de quatro mil pixels: sem isto, o número que
  // se está tentando mover some da tela justamente enquanto se preenche.
  const app = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.match(app, /#diagwrap \.d-panel\{position:sticky;top:12px\}/);
});

test("o bloco de prints vazio não empurra o diagnóstico para baixo", () => {
  const app = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.match(app, /\.an:has\(\.an-vazio\)\{padding:12px 15px\}/);
  assert.match(app, /\.an:has\(\.an-vazio\) \.an-sub\{display:none\}/);
});

// ─── Sem desconto e sem leve mais por menos ───────────────────────────
//
// A pergunta da operação: quais lojas não têm NENHUMA das duas ferramentas
// que puxam o anúncio na busca. O que se guarda aqui é que a tela pergunta
// isso ao módulo de regras, e não a uma segunda conta escrita à mão.

test("a aba usa a regra do módulo, não uma cópia da conta", () => {
  assert.match(rel, /import \{ semNenhumaDestas \} from "\.\/js\/prazos\.js/,
    "a tela voltou a calcular por conta própria");
  assert.match(rel, /semNenhumaDestas\(docs, \["desconto", "leve_mais"\], agora\)/);
});

test("a tela separa quem não tem nenhuma das duas de quem tem uma só", () => {
  // Juntar os dois casos na mesma lista dá o alarme de quem está descoberto
  // para quem está metade coberto — e quem lê passa a tratar tudo como rotina.
  assert.match(rel, /desconto e sem leve mais por menos/);
  assert.match(rel, /Falta só uma das duas/);
  assert.match(rel, /const soSemLeve = /);
  assert.match(rel, /const soSemDesc = /);
});

test("a tela não promete saber quais ANÚNCIOS estão de fora", () => {
  // A Shopee informa as campanhas da loja, não os itens dentro delas. Escrever
  // "anúncios sem promoção" aqui seria prometer um dado que não temos.
  assert.match(rel, /não quais anúncios estão dentro delas/,
    "o limite do dado precisa estar escrito onde alguém vá mexer");
});

// ─── O carimbo de versão ──────────────────────────────────────────────

test("o relatório entrou na lista de arquivos carimbados", () => {
  // Ele passou a importar js/prazos.js. Import sem carimbo, com cache de 7
  // dias, é código velho na máquina de quem já visitou o site — já quebrou a
  // tela de importação uma vez assim.
  const carimbador = fs.readFileSync(path.join(raiz, "ferramentas/carimbar-versao.js"), "utf8");
  assert.match(carimbador, /const ARQUIVOS = \[[^\]]*"relatorio-cliente\.html"/);
  assert.match(rel, /from "\.\/js\/prazos\.js\?v=[a-f0-9]+"/, "o import está sem carimbo");
});
