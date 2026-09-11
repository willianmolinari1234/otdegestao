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

// ── A margem estimada (fase 8, item 5) ────────────────────────────────

test("a margem da planilha vem primeiro e nunca é recalculada", () => {
  // A decisão travada do projeto. Se a ordem invertesse, o número real seria
  // trocado por uma estimativa pior, sem erro nenhum aparecer.
  const i = html.indexOf("function blocoMargem");
  const trecho = html.slice(i, i + 1400);
  assert.ok(trecho.indexOf("temLucro || temMargem") < trecho.indexOf("calcularMargem"),
    "o valor gravado tem que ser testado ANTES de calcular");
});

test("o cliente não vê estimativa enquanto a tabela de taxas está incompleta", () => {
  assert.match(html, /!r\.completa && !estado\.souEquipe && estado\.modo === "cliente"/);
});

test("quem precifica vê a conta, com o aviso de que ela sobra demais", () => {
  assert.match(html, /r\.completa \? "" : `<div style="background:#fffbeb/);
  assert.match(html, /mais do que vai sobrar de verdade/);
});

test("o especialista não vê mais 'preço menos custo' cru", () => {
  // Era o número que dá 52% onde o real é 7,5%.
  assert.doesNotMatch(html, /Preço menos custo/);
  assert.match(html, /Sobra para você/);
});

// ── O login que aparecia dentro do painel da equipe ────────────────────
//
// Sintoma: abrir a aba Produtos pintava um formulário de login cortado dentro
// do iframe. Duas causas, as duas corrigidas aqui.

test("o formulário de login nasce escondido", () => {
  // Visível por padrão, ele piscava a cada abertura da aba Produtos — e
  // piscava cortado, porque 100vh dentro de um iframe menor não cabe.
  assert.match(html, /#login\{display:none;/);
  assert.match(html, /#login\.ver\{display:flex\}/);
  assert.doesNotMatch(html, /\$\("login"\)\.style\.display = "flex"/);
});

test("embutido no painel, o login nunca é oferecido", () => {
  // Quem precisa entrar é o funcionário, na janela de fora. Um formulário
  // aqui dentro é um beco sem saída.
  assert.match(html, /if \(EMBUTIDO\) \{[\s\S]{0,300}?Recarregue a página do painel/);
});

test("o iframe nunca desloga: a sessão é a mesma do painel", () => {
  // Esta é a causa raiz do bug. signOut aqui dentro derrubava o funcionário
  // do sistema inteiro, e bastava uma falha de rede lendo employees.
  const i = html.indexOf("if (!daEquipe || !pedido)");
  assert.ok(i > 0, "o bloco de recusa precisa existir");
  const trecho = html.slice(i, i + 900);
  assert.ok(trecho.indexOf("if (EMBUTIDO)") < trecho.indexOf("await signOut"),
    "a saída sem deslogar tem que vir ANTES do signOut");
});

test("o aviso de abertura não herda a altura da janela inteira", () => {
  // Com min-height:100vh dentro do iframe, o texto cai abaixo da área visível
  // e a tela parece vazia.
  assert.match(html, /#abrindo\{display:flex;/);
  assert.doesNotMatch(html, /#abrindo\{min-height:100vh/);
});

// ── Achar e preencher o que falta (otimização de 11/09/2026) ───────────

test("a lista conta as fichas incompletas e oferece isolar só elas", () => {
  // Antes, "faltam 3 informações" ficava espalhado numa lista de duzentos
  // produtos e não havia como filtrar. Preencher virava uma caça.
  assert.match(html, /const incompletos = estado\.produtos\.filter\(\(p\) => faltandoNaFicha\(p\)\.length\)/);
  assert.match(html, /com a ficha incompleta/);
  assert.match(html, /<button id="verIncompletos"/);
  assert.match(html, /vi\.onclick = \(\) => \{ estado\.soIncompletos = !estado\.soIncompletos/);
});

test("o filtro de ficha incompleta entra na peneira da lista", () => {
  assert.match(html, /if \(estado\.soIncompletos && !faltandoNaFicha\(p\)\.length\) return false/);
  assert.match(html, /soIncompletos: false/, "precisa nascer desligado no estado");
});

test("o filtro ligado mostra um selo que dá para desligar", () => {
  assert.match(html, /id="limparFicha"/);
  assert.match(html, /lf\.onclick = \(\) => \{ estado\.soIncompletos = false/);
});

// ── A lista no celular ─────────────────────────────────────────────────

test("no celular a tabela vira cartão", () => {
  // Com cinco colunas num telefone, a última saía da tela — e é nela que
  // ficam os selos e o botão de editar. O cliente não conseguia abrir a ficha
  // do próprio produto no aparelho em que vai preenchê-la.
  assert.match(html, /table thead\{display:none\}/);
  assert.match(html, /table,table tbody,table tr,table td\{display:block/);
  assert.match(html, /table td\[data-rot\]::before\{content:attr\(data-rot\)/);
});

test("toda célula das listas diz se tem rótulo ou não", () => {
  // Célula sem data-rot vira bloco mudo no celular: o valor aparece sem dizer
  // do que é. Nome e selos são os únicos que se explicam sozinhos, e por isso
  // levam data-rot="".
  const linhas = html.split("\n").filter((l) => /^\s*<td/.test(l) || /return `<tr data-prod/.test(l));
  const semRotulo = linhas.filter((l) => /<td(?![^>]*data-rot)(?![^>]*colspan)/.test(l));
  assert.deepEqual(semRotulo, [], "estas células não têm data-rot");
});

// ── Os percentuais do contrato (11/09/2026) ───────────────────────────

test("a tela não lê customers: pede os percentuais ao servidor", () => {
  // `clients.access` guarda a senha da loja no marketplace e regra do
  // Firestore não esconde campo — por isso nenhum papel externo lê essas
  // coleções. Quem lê o cadastro é o servidor.
  assert.doesNotMatch(html, /collection\(db, "customers"\)/);
  assert.doesNotMatch(html, /collection\(db, "clients"\)/);
  assert.match(html, /percentuaisDoCliente/);
});

test("os percentuais são buscados só no modo cliente", () => {
  // O especialista precifica com a conta do MARKETPLACE. Quanto a OTDE cobra
  // de cada cliente não é assunto dele.
  assert.match(html, /if \(estado\.modo === "cliente"\) \{[\s\S]{0,200}?buscarPercentuais\(\)/);
});

test("falhar ao buscar os percentuais não derruba a lista de produtos", () => {
  assert.match(html, /catch \(e\) \{ console\.error\("percentuais:", e\); estado\.pct = null; \}/);
});

test("a exceção da loja vence o padrão do proprietário", () => {
  assert.match(html, /const daLoja = a && a\.storeId \? estado\.pct\.porLoja\?\.\[a\.storeId\] : null/);
  assert.match(html, /return daLoja \|\| estado\.pct\.padrao/);
});

test("o cartão do anúncio calcula com os percentuais daquele anúncio", () => {
  assert.match(html, /\.\.\.pctDoAnuncio\(a\),/);
});
