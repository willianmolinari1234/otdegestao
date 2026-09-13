// A área de clientes: filtro de marketplace e o login da loja.
//
// O bug que motivou este arquivo: o login de cada loja (link, usuário, senha)
// era gravado em DOIS lugares — `clients.access`, pela tela da loja, e
// `customers.login.stores[lojaId]`, pela tela do cliente. Nenhum dos dois lia
// o outro, então preencher por uma tela deixava a outra vazia, e o Willian
// digitava tudo duas vezes sem saber por quê.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

// ─── Filtro de marketplace ────────────────────────────────────────────

test("o filtro lista os quatro marketplaces, não só os que já têm loja", () => {
  // Listar só os em uso escondia Mercado Livre e TikTok justamente de quem
  // está cadastrando as primeiras lojas deles — e um filtro que não oferece
  // a opção parece que o sistema não suporta o marketplace.
  const telas = ler("js/04-telas.js");
  assert.match(telas, /const listaMkts=\[\.\.\.new Set\(\[\.\.\.MKTS,\.\.\.usedMkts\]\)\]/);
  assert.match(telas, /const porMkt=\(m\)=>clis\.filter\(c=>c\.mkt===m\)\.length/,
    "cada opção mostra quantas lojas tem, para zero ser um fato e não um sumiço");
});

test("MKTS tem os quatro marketplaces do negócio", () => {
  const estado = ler("js/01-estado-e-dados.js");
  assert.match(estado, /const MKTS=\["Shopee","Shein","Mercado Livre","TikTok"\]/);
});

test("a barra de filtros não some mais quando não há loja cadastrada", () => {
  // Ela era condicional a existir marketplace em uso: num sistema recém-aberto
  // não havia nem por onde filtrar.
  const telas = ler("js/04-telas.js");
  assert.match(telas, /const filterBar=`<div class="filter-bar"/);
});

// ─── O login da loja tem UMA fonte ────────────────────────────────────

test("a tela do cliente grava o login na LOJA, não dentro do cliente", () => {
  const cli = ler("js/05-clientes-e-acesso.js");
  assert.match(cli, /fbUpdate\("clients",s\.id,\{/, "escreve na loja");
  assert.match(cli, /access:\{url:u,user:us,pass:ps,notes:antigo\.notes\|\|""\}/);
  assert.match(cli, /stores:\{\}/, "e limpa a cópia antiga que ficava no cliente");
});

test("a tela do cliente lê o login da loja, e só cai no antigo se não houver", () => {
  const cli = ler("js/05-clientes-e-acesso.js");
  const i = cli.indexOf("const sl=(s.access");
  assert.ok(i > 0, "a leitura precisa começar pela loja");
  const trecho = cli.slice(i, i + 260);
  assert.match(trecho, /s\.access&&\(s\.access\.url\|\|s\.access\.user\|\|s\.access\.pass\)/);
  assert.match(trecho, /storeLogins\[s\.id\]/, "o formato antigo ainda aparece");
});

test("salvar não apaga a observação que o outro cadastro escreveu", () => {
  // `notes` é da loja e esta tela não mostra o campo: gravar sem preservar
  // apagaria em silêncio o que alguém escreveu lá.
  const cli = ler("js/05-clientes-e-acesso.js");
  assert.match(cli, /notes:antigo\.notes\|\|""/);
});

test("login igual ao que já está gravado não vira escrita", () => {
  // Abrir e fechar o cadastro de um cliente com 3 lojas não pode custar 3
  // gravações no banco.
  const cli = ler("js/05-clientes-e-acesso.js");
  assert.match(cli, /if\(u===\(antigo\.url\|\|""\)&&us===\(antigo\.user\|\|""\)&&ps===\(antigo\.pass\|\|""\)\)return;/);
});

test("a loja é gravada ANTES do cliente: meia gravação não deixa o login só na metade", () => {
  const cli = ler("js/05-clientes-e-acesso.js");
  const iLojas = cli.indexOf("await Promise.all(gravacoesDeLoja)");
  const iCliente = cli.indexOf('await fbUpdate("customers",custId');
  assert.ok(iLojas > 0 && iLojas < iCliente);
});

// ─── O painel de clientes ─────────────────────────────────────────────

test("a linha do cliente diz o que FALTA, não só o que existe", () => {
  // Antes eram quatro ícones sem rótulo: descobrir qual cliente estava
  // incompleto exigia abrir um por um.
  const cli = ler("js/05-clientes-e-acesso.js");
  assert.match(cli, /pendencias\.push\("sem loja"\)/);
  assert.match(cli, /sem login da loja/);
  assert.match(cli, /pendencias\.push\("sem % de gestão"\)/);
  assert.match(cli, /class="gc-falta"/);
});

test("o indicador de acesso enxerga o login que agora mora na loja", () => {
  const cli = ler("js/05-clientes-e-acesso.js");
  assert.match(cli, /const lojaComAcesso=stores\.some\(s=>s\.access&&/);
  assert.match(cli, /\|\|lojaComAcesso;/);
});

test("dá para cadastrar a loja direto do cliente, já vinculada", () => {
  // Antes: fechar o painel, ir em "Nova loja", achar o nome numa lista de 48.
  const cli = ler("js/05-clientes-e-acesso.js");
  assert.match(cli, /data-novaloja="\$\{cu\.id\}"/);
  assert.match(cli, /openClientForm\(null,b\.dataset\.novaloja\)/);
  const form = ler("js/06-formularios.js");
  assert.match(form, /function openClientForm\(clientId,custPre\)/);
  assert.match(form, /const custAlvo=c\?c\.custId:\(custPre\|\|""\)/);
});

test("o botão novo do painel é ligado à mão, como o modal exige", () => {
  // O painel é modal e vive fora do #content, onde mora a delegação de
  // cliques. Botão não registrado no rebind() não clica, e sem erro nenhum.
  const cli = ler("js/05-clientes-e-acesso.js");
  const i = cli.indexOf("function rebind()");
  assert.ok(i > 0);
  assert.match(cli.slice(i, i + 1400), /querySelectorAll\("\[data-novaloja\]"\)/);
});

test("a pré-seleção do dono também vale para a herança dos percentuais", () => {
  // O campo de comissão mostra "herda X% do cliente" — com o dono vindo só
  // de `c`, a loja nova pré-vinculada mostraria "herda 0%".
  const form = ler("js/06-formularios.js");
  assert.match(form, /const dono=custAlvoDono\(c,custPre\)/);
});

// ─── Campos que só existem na Shopee ──────────────────────────────────

test("cupom, oferta relâmpago e username são marcados como só-Shopee", () => {
  // Pedir perfil de cupons numa loja de Mercado Livre é pedir uma decisão
  // que não existe naquele marketplace.
  const form = ler("js/06-formularios.js");
  const marcados = (form.match(/cf-so-shopee/g) || []).length;
  assert.ok(marcados >= 4, `esperava os campos marcados, achei ${marcados}`);
  for (const campo of ["cf-perfil", "cf-sem-relampago"]) {
    const i = form.indexOf(`id="${campo}"`);
    const bloco = form.lastIndexOf("cf-so-shopee", i);
    assert.ok(bloco > 0 && i - bloco < 700, `${campo} não está num bloco só-Shopee`);
  }
});

test("trocar o marketplace esconde e mostra os campos na hora", () => {
  const form = ler("js/06-formularios.js");
  assert.match(form, /mktSel\.addEventListener\("change",aplicarMkt\)/);
  assert.match(form, /aplicarMkt\(\);/, "e roda uma vez ao abrir, não só ao trocar");
  assert.match(form, /const ehShopee=\(mktSel\.value\|\|""\)==="Shopee"/);
});

test("loja que não é da Shopee não grava perfil de cupons nem marca de relâmpago", () => {
  // Gravar o padrão faria o painel cobrar dela uma ferramenta que não existe.
  const form = ler("js/06-formularios.js");
  assert.match(form, /perfilCupons:ehLojaShopee\(\)\?\(document\.getElementById\("cf-perfil"\)\.value\|\|"padrao"\):""/);
  assert.match(form, /relampagoNaoSeAplica:ehLojaShopee\(\)\?[^:]+:false/);
});

test("o alerta de cupons já ignora loja sem perfil escolhido", () => {
  // Fecha o círculo: loja de ML fica com perfilCupons vazio, e a regra de
  // tarefa automática só cobra quem tem perfil escolhido à mão.
  const idx = ler("functions/index.js");
  assert.match(idx, /perfilEscolhido: Boolean\(c\.perfilCupons\)/);
});
