// Fumaça das telas.
//
// O resto da suíte testa regra pura. Isto testa a CAMADA QUE DESENHA, que é
// onde este projeto historicamente se machuca: o botão que não clicava, o
// automático passando por cima do que foi digitado, o aviso que acusava loja
// certa. Nada disso quebra teste de regra — quebra na tela, calado.
//
// Como funciona: monta os js/*.js na MESMA ordem do app.html dentro de um
// contexto com um DOM mínimo, e chama as funções de desenho com dados de
// mentira. Não substitui abrir o navegador; pega o erro bobo antes dele.
//
// A ordem dos scripts é lida do app.html de propósito — assim, mexer na ordem
// lá não deixa este teste exercitando um arranjo que não existe mais.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function ordemDosScripts() {
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  return [...html.matchAll(/<script src="(js\/[^"?]+)/g)].map((m) => m[1]);
}

const noop = () => {};
const elFake = {
  onclick: null, onchange: null, oninput: null, value: "", textContent: "",
  classList: { add: noop, remove: noop, toggle: noop }, style: {}, dataset: {},
  addEventListener: noop, querySelectorAll: () => [], querySelector: () => null,
  appendChild: noop, focus: noop, setSelectionRange: noop, closest: () => null,
};

/** Um app carregado, com os dados de mentira já postos. */
async function montarApp(fixture = "") {
  const ctx = {
    console,
    document: {
      getElementById: () => elFake, querySelector: () => elFake, querySelectorAll: () => [],
      addEventListener: noop, body: { classList: { add: noop, remove: noop } },
    },
    window: { addEventListener: noop },
    localStorage: { getItem: () => null, setItem: noop },
    setTimeout, clearTimeout, Intl, JSON,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const bundle = ordemDosScripts()
    .map((rel) => fs.readFileSync(path.join(raiz, rel), "utf8")).join("\n;\n");
  vm.runInContext(bundle, ctx, { filename: "app-inteiro.js" });
  // O app.html expõe o módulo de regras em window.prazos; aqui é o mesmo arquivo.
  ctx.window.prazos = await import("../js/prazos.js");
  if (fixture) vm.runInContext(fixture, ctx);
  return ctx;
}

/** Avalia uma expressão DENTRO do escopo do app (os `let` do topo moram lá). */
const eval_ = (ctx, expr) => vm.runInContext(`(() => { ${expr} })()`, ctx);

// Objeto vindo de dentro do contexto tem OUTRO Object.prototype, e deepEqual
// estrito reprova por isso mesmo com o conteúdo igual. Atravessar por JSON
// devolve um objeto deste lado.
const evalObj_ = (ctx, expr) =>
  JSON.parse(vm.runInContext(`JSON.stringify((() => { ${expr} })())`, ctx));

const BASE = `
  emps = [{ id:"ana", name:"Ana Souza", color:"#ea580c", role:"user" }];
  custs = [{ id:"c1", name:"Poliane" }];
  clis = [
    { id:"l1", name:"Diamond Tricot", mkt:"Shopee", custId:"c1", respId:"ana", perfilCupons:"ticketbaixo" },
    { id:"l2", name:"Eva Home", mkt:"Shopee", custId:"c1", respId:"", perfilCupons:"padrao" },
  ];
  tools = [
    { cliente:"l1", promocoes:[{ tipo:"cupom", inicio:1, fim:9e9, bruto:{ voucher_purpose:3 } }] },
    { cliente:"l2", promocoes:[] },
  ];
  tsks = [{ id:"auto__l2__semDesconto", auto:true, cli:"l2", emp:"", status:"todo",
    title:"Ativar desconto — Eva Home", desc:"x", pri:"alta", date:"2026-09-11", reaberturas:2 }];
  currentUser = { id:"adm", name:"Willian", role:"admin", color:"#ea580c" };
`;

// ── Responsável por loja ───────────────────────────────────────────────

test("o dono da loja é resolvido, e some quando o funcionário sai da equipe", async () => {
  const ctx = await montarApp(BASE);
  assert.equal(eval_(ctx, `return respDaLoja(clis[0]).name;`), "Ana Souza");
  assert.equal(eval_(ctx, `return respDaLoja(clis[1]);`), null, "loja sem respId");
  assert.equal(eval_(ctx, `return respDaLoja({id:"x",respId:"fantasma"});`), null,
    "respId apontando para quem não existe mais exige a mesma ação: escolher alguém");
});

test("a tela de Clientes traz a coluna, a contagem de órfãs e o select que salva na linha", async () => {
  const ctx = await montarApp(BASE);
  const h = eval_(ctx, `return rClientes();`);
  assert.match(h, /Responsável/);
  assert.match(h, /Sem responsável \(1\)/);
  assert.match(h, /data-setresp="l2"/, "sem o gancho, atribuir exigiria abrir o cadastro loja a loja");
});

test("o filtro 'sem responsável' isola exatamente as lojas a preencher", async () => {
  const ctx = await montarApp(BASE);
  const h = eval_(ctx, `fResp="sem"; const x=rClientes(); fResp="all"; return x;`);
  assert.match(h, /Eva Home/);
  assert.doesNotMatch(h, /Diamond Tricot/);
});

test("para o funcionário comum, loja de outro não aparece como órfã", async () => {
  // Ele só tem o próprio cadastro em memória (a regra do Firestore não deixa
  // ler a equipe). Escrever "—" ali diria que a loja está sem dono.
  const ctx = await montarApp(BASE);
  const h = eval_(ctx, `
    currentUser = { id:"ana", name:"Ana Souza", role:"user", color:"#ea580c" };
    return respCelulaHTML({ id:"l9", respId:"bruno" }, () => "");`);
  assert.match(h, /Outro responsável/);
  assert.doesNotMatch(h, /sem responsável/);
});

// ── Aviso de lojas sem dono ────────────────────────────────────────────

test("o aviso nomeia só as órfãs e conta as tarefas paradas por causa delas", async () => {
  const ctx = await montarApp(BASE);
  const h = eval_(ctx, `return avisoSemResponsavelHTML();`);
  assert.match(h, /Eva Home/);
  assert.doesNotMatch(h, /Diamond Tricot/);
  assert.match(h, /1 tarefa\(s\) sem dono/);
});

test("o aviso some quando todas têm dono, e nunca aparece para a equipe", async () => {
  const ctx = await montarApp(BASE);
  assert.equal(eval_(ctx, `clis=[{id:"l1",name:"X",respId:"ana"}]; return avisoSemResponsavelHTML();`), "");
  assert.equal(eval_(ctx, `currentUser={id:"ana",role:"user"}; return avisoSemResponsavelHTML();`), "",
    "aviso que quem lê não pode resolver ensina a ignorar o painel");
});

// ── Selo da tarefa automática ──────────────────────────────────────────

test("a tarefa automática se identifica e mostra quantas vezes voltou", async () => {
  const ctx = await montarApp(BASE);
  const h = eval_(ctx, `return autoBadgeHTML(tsks[0]);`);
  assert.match(h, /Automática/);
  assert.match(h, /reaberta 2×/);
  assert.equal(eval_(ctx, `return autoBadgeHTML({id:"z",title:"Subir 10 anúncios"});`), "",
    "tarefa digitada por gente não leva selo");
});

test("o dashboard monta inteiro, com o aviso de órfãs e o selo na lista", async () => {
  const ctx = await montarApp(BASE);
  const h = eval_(ctx, `return rDash();`);
  assert.match(h, /sem responsável/);
  assert.match(h, /Automática/);
});

// ── Perfil de cupons chegando na tela ──────────────────────────────────

test("o mínimo de cupons da loja chega ao painel: ticket baixo não é acusada de 4", async () => {
  const ctx = await montarApp(BASE);
  const m = evalObj_(ctx, `const o={}; for(const x of toolsComMinimo()) o[x.cliente]=x.minCupons; return o;`);
  assert.deepEqual(m, { l1: 2, l2: 4 });
  assert.doesNotMatch(eval_(ctx, `return avisoFerramentasHTML();`), /1\/4 cupons/);
});

// ── Retrabalho na tela de Equipe ───────────────────────────────────────

test("a tela de Equipe soma as reaberturas — e esconde o zero", async () => {
  const ctx = await montarApp(BASE);
  const com = eval_(ctx, `
    tsks=[{id:"a",auto:true,emp:"ana",status:"done",reaberturas:3,pri:"media",date:"2026-09-11",cli:"l1"}];
    return rEquipe();`);
  assert.match(com, /3 retrabalho/);
  const sem = eval_(ctx, `
    tsks=[{id:"a",auto:true,emp:"ana",status:"done",reaberturas:0,pri:"media",date:"2026-09-11",cli:"l1"}];
    return rEquipe();`);
  assert.doesNotMatch(sem, /retrabalho/, "número zerado ocupando espaço ensina a não olhar para ele");
});

// ── Carimbo de conclusão ───────────────────────────────────────────────

test("concluir carimba a HORA, reabrir limpa, e regravar não reescreve o carimbo", async () => {
  // O dia basta para o relatório, mas não para decidir se a Shopee foi
  // consultada antes ou depois de alguém marcar concluído.
  const ctx = await montarApp(BASE);
  const feito = eval_(ctx, `return setDoneDate(null,"done",{});`);
  assert.ok(feito.doneEm && feito.doneDate);
  const reaberto = eval_(ctx, `return setDoneDate({status:"done",doneDate:"x",doneEm:"y"},"todo",{});`);
  assert.equal(reaberto.doneDate, null);
  assert.equal(reaberto.doneEm, null);
  const regravado = eval_(ctx,
    `return setDoneDate({status:"done",doneDate:"2026-09-01",doneEm:"2026-09-01T10:00:00Z"},"done",{});`);
  assert.equal(regravado.doneEm, "2026-09-01T10:00:00Z");
});
