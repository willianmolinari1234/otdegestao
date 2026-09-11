// Guardas da tela da ficha do produto (fase 8, item 2).
//
// Por que um teste que lê o HTML em vez de rodar a tela: cliente.html importa
// o Firebase do gstatic e não sobe sem rede nem sem login. Mas as três coisas
// que este projeto já quebrou na tela são visíveis no texto do arquivo, e
// nenhuma delas quebra teste de regra — quebram calado, na cara do cliente:
//
//   1. botão dentro de modal sem handler ligado à mão (a delegação de eventos
//      está presa ao #content e modal vive fora dele);
//   2. campo que o salvamento lê mas o formulário não desenha;
//   3. a lista de campos escrita de novo na tela, divergindo do backend.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CAMPOS_DA_FICHA } from "../js/ficha-produto.js";

const html = fs.readFileSync(new URL("../cliente.html", import.meta.url), "utf8");

test("a tela usa a lista compartilhada, não uma cópia escrita à mão", () => {
  assert.match(html, /import \{[^}]*CAMPOS_DA_FICHA[^}]*\} from "\.\/js\/ficha-produto\.js/);
  assert.match(html, /import \{[^}]*faltandoNaFicha[^}]*\} from "\.\/js\/ficha-produto\.js/);
});

test("todo botão com id dentro do modal tem handler ligado à mão", () => {
  // A armadilha do CLAUDE.md: sem o handler o clique simplesmente não
  // acontece, e não aparece erro nenhum no console.
  const ids = [...html.matchAll(/<button id="(ed-[a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3, `esperava os botões da ficha, achei ${ids.length}`);
  for (const id of ids) {
    const ligado = new RegExp(`\\$\\("${id}"\\)(\\.onclick|\\s*=\\s*\\$)`).test(html)
      || new RegExp(`const \\w+ = \\$\\("${id}"\\)`).test(html);
    assert.ok(ligado, `o botão ${id} não tem handler — o clique não vai acontecer`);
  }
});

test("o botão de novo produto existe e está ligado", () => {
  assert.match(html, /<button id="novoProduto"/);
  assert.match(html, /novo\.onclick = \(\) => abrirFicha\(null\)/);
});

test("todo campo da ficha é desenhado a partir da lista, sem campo perdido", () => {
  // O formulário desenha CAMPOS_DA_FICHA inteiro (obrigatórios + opcionais) e
  // o salvamento percorre a mesma lista. Se alguém desenhar só parte, o campo
  // que falta chega vazio ao backend e o cliente leva "falta preencher" de um
  // campo que a tela nunca mostrou.
  assert.match(html, /CAMPOS_DA_FICHA\.filter\(\(c\) => c\.obrigatorio\)/);
  assert.match(html, /CAMPOS_DA_FICHA\.filter\(\(c\) => !c\.obrigatorio\)/);
  assert.match(html, /for \(const c of CAMPOS_DA_FICHA\) dados\[c\.campo\] = v\(c\.campo\)/);
});

test("o custo é lido no salvamento, mesmo não estando na lista da ficha", () => {
  assert.match(html, /<input id="ed-custo"/);
  assert.match(html, /custo: v\("custo"\)/);
});

test("a gravação passa pelo backend, nunca direto em products", () => {
  // Gravar direto deixaria o produto sem `mkts` e invisível para o
  // especialista, em silêncio. Esta é a razão de o endpoint existir.
  assert.match(html, /salvarFicha\(dados\)/);
  assert.doesNotMatch(html, /setDoc\(doc\(db, "products"/);
});

test("só a equipe vê apagar produto e desvincular anúncio", () => {
  assert.match(html, /estado\.souEquipe && !criando \? `<button id="ed-apagar"/);
  assert.match(html, /estado\.souEquipe && !criando \? `\s*<div style="margin-top:16px;border-top/);
});

test("o especialista não recebe botão de editar ficha", () => {
  // Ele opera marketplace; a ficha é do dono do produto. Mesmo desenho da
  // regra de pedidos, onde o especialista não aparece em cláusula nenhuma.
  assert.match(html, /estado\.modo !== "especialista" \? `<button data-editar=/);
});

test("os rótulos da tela saem da lista compartilhada, não de texto solto", () => {
  // Se alguém escrever "Medidas da embalagem" à mão no HTML, some o vínculo
  // com o que o backend valida.
  for (const c of CAMPOS_DA_FICHA) {
    const solto = new RegExp(`<span class="rot">${c.rotulo}`);
    assert.doesNotMatch(html, solto, `${c.rotulo} está escrito à mão na tela`);
  }
});
