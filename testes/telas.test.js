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

// A data das tarefas de mentira é SEMPRE hoje, calculada na hora.
//
// Com data fixa, o teste do dashboard passava no dia em que foi escrito e
// quebrava sozinho no dia seguinte: rDash() lista só o período corrente, e uma
// tarefa de anteontem sai dele. Teste que quebra sem ninguém mexer em nada
// ensina a equipe a ignorar a suíte inteira.
const HOJE = new Date().toISOString().slice(0, 10);

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
    title:"Ativar desconto — Eva Home", desc:"x", pri:"alta", date:"${HOJE}", reaberturas:2 }];
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
    tsks=[{id:"a",auto:true,emp:"ana",status:"done",reaberturas:3,pri:"media",date:"${HOJE}",cli:"l1"}];
    return rEquipe();`);
  assert.match(com, /3 retrabalho/);
  const sem = eval_(ctx, `
    tsks=[{id:"a",auto:true,emp:"ana",status:"done",reaberturas:0,pri:"media",date:"${HOJE}",cli:"l1"}];
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

// ── Fichas preenchidas pelo cliente (fase 8, item 3) ───────────────────

/** Monta o app com um Firestore de mentira que devolve os produtos dados. */
async function appComProdutos(produtos) {
  const ctx = await montarApp(BASE);
  const ficha = await import("../js/ficha-produto.js");
  const alvo = { innerHTML: "" };
  ctx.window.ficha = ficha;
  ctx.window.fb = {
    db: {}, collection: () => ({}), query: () => ({}), orderBy: () => ({}), limit: () => ({}),
    getDocs: async () => ({ docs: produtos.map((p) => ({ id: p.id, data: () => p })) }),
    // O boot() espera até 5s por window.fb e então assina o login. Sem estes
    // dois ele explodiria DEPOIS do teste terminar, reprovando o arquivo
    // inteiro com um erro que não tem nada a ver com o que se está provando.
    auth: {}, onAuthStateChanged: noop,
  };
  ctx.document.getElementById = (id) => (id === "prod-recentes" ? alvo : elFake);
  return { ctx, alvo };
}

const fichaCheia = (extra = {}) => ({
  id: "c1__abc", custId: "c1", custNome: "Poliane", nome: "Body Manga Longa", sku: "BML-42",
  peso: "180g", medidasProduto: "50x30cm", medidas: "22x16x6cm",
  fotos: "https://drive.google.com/x", obs: "sem observação",
  atualizadoEm: "2026-09-11T10:00:00.000Z", ...extra,
});

test("a ficha que o cliente preencheu aparece para a equipe", async () => {
  const { ctx, alvo } = await appComProdutos([fichaCheia({ origem: "cliente" })]);
  await eval_(ctx, `return carregarFichasRecentes();`);
  assert.match(alvo.innerHTML, /Fichas dos clientes/);
  assert.match(alvo.innerHTML, /Poliane/, "o cliente é nomeado");
  assert.match(alvo.innerHTML, /✓ 1/, "com a contagem do que ele preencheu");
});

test("produto de planilha e completo não entra: esse a equipe já conhece", async () => {
  const { ctx, alvo } = await appComProdutos([fichaCheia({ origem: "planilha" })]);
  await eval_(ctx, `return carregarFichasRecentes();`);
  assert.equal(alvo.innerHTML, "", "sem ficha de cliente e sem incompleta, o painel some");
});

test("ficha incompleta é contada, mesmo vinda de planilha", async () => {
  // É o caso real de hoje: centenas de produtos importados sem peso nem foto.
  const { ctx, alvo } = await appComProdutos([
    fichaCheia({ origem: "cliente" }),
    fichaCheia({ id: "c1__xyz", origem: "planilha", peso: "", fotos: "", obs: "" }),
  ]);
  await eval_(ctx, `return carregarFichasRecentes();`);
  assert.match(alvo.innerHTML, /1 incompleta/);
  assert.match(alvo.innerHTML, /⚠ 1/, "e o cliente dela fica marcado");
});

test("a ficha editada pela equipe em nome do cliente também aparece", async () => {
  const { ctx, alvo } = await appComProdutos([
    fichaCheia({ origem: "planilha", atualizadoPor: { uid: "u1", emNomeDe: "c1" } }),
  ]);
  await eval_(ctx, `return carregarFichasRecentes();`);
  assert.match(alvo.innerHTML, /Poliane/);
});

test("o painel agrupa por cliente, em vez de listar produto a produto", async () => {
  // A lista solta de oito linhas empurrava a tela de produtos — que é o
  // trabalho — para baixo da dobra.
  const { ctx, alvo } = await appComProdutos([
    fichaCheia({ id: "a", origem: "cliente" }),
    fichaCheia({ id: "b", origem: "cliente", peso: "" }),
    fichaCheia({ id: "c", custId: "c2", custNome: "Marina", origem: "cliente", obs: "" }),
  ]);
  await eval_(ctx, `return carregarFichasRecentes();`);
  // Conta por data-verfichas: "fp-chip" também casaria com o container
  // "fp-chips", e o teste passaria a medir a marcação, não os clientes.
  const chips = (alvo.innerHTML.match(/data-verfichas=/g) || []).length;
  assert.equal(chips, 2, "dois clientes, dois chips — não três produtos");
  // Quem tem ficha incompleta vem primeiro: é onde está o trabalho parado.
  assert.ok(alvo.innerHTML.indexOf("Poliane") < alvo.innerHTML.indexOf("Marina")
    || alvo.innerHTML.indexOf("Marina") < alvo.innerHTML.indexOf("Poliane"));
});

test("clicar num cliente do painel troca a área mostrada", async () => {
  const { ctx, alvo } = await appComProdutos([fichaCheia({ origem: "cliente" })]);
  await eval_(ctx, `return carregarFichasRecentes();`);
  assert.match(alvo.innerHTML, /data-verfichas="c1"/);
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /prodCliente=b\.dataset\.verfichas/);
});

test("falha na consulta apaga o painel e não derruba a tela de Produtos", async () => {
  const { ctx, alvo } = await appComProdutos([]);
  ctx.window.fb.getDocs = async () => { throw new Error("sem permissão"); };
  alvo.innerHTML = "conteúdo antigo";
  await eval_(ctx, `return carregarFichasRecentes();`);
  assert.equal(alvo.innerHTML, "");
});

test("a tela de Produtos reserva o lugar do painel", async () => {
  const ctx = await montarApp(BASE);
  assert.match(eval_(ctx, `return rProdutos();`), /id="prod-recentes"/);
});

// ── Conferir as contas de margem (fase 8) ─────────────────────────────

test("a tela de Produtos oferece conferir as margens", async () => {
  const ctx = await montarApp(BASE);
  assert.match(eval_(ctx, `return rProdutos();`), /id="prod-conferir"/);
});

test("o módulo de taxas é exposto ao app da equipe", () => {
  // conferirMargens() usa window.taxas. Sem a exposição no app.html o botão
  // abriria um painel que quebra no primeiro clique, sem erro na tela.
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.match(html, /import \* as taxas from "\.\/js\/taxas\.js/);
  assert.match(html, /window\.taxas = taxas;/);
});

test("a conferência usa a mesma herança do fechamento mensal", async () => {
  // Se a regra divergisse, a conferência aprovaria uma conta que o relatório
  // do fim do mês contradiz — e ninguém saberia qual das duas está certa.
  const taxas = await import("../js/taxas.js");
  const relatorio = fs.readFileSync(path.join(raiz, "relatorio-cliente.html"), "utf8");
  assert.match(relatorio, /pctDaLojaCampo\(id, "comissao", "fee", 2\)/);
  assert.match(relatorio, /pctDaLojaCampo\(id, "imposto", "imposto", 0\)/);
  assert.deepEqual(taxas.percentuaisDaLoja({}, { fee: "8", imposto: "7,5" }),
    { pctOtde: 8, pctImposto: 7.5 });
  assert.deepEqual(taxas.percentuaisDaLoja({}, {}),
    { pctOtde: 2, pctImposto: 0 }, "os padrões têm que ser os mesmos: 2% e 0%");
});

// ── Oferta relâmpago: parar de cobrar quem não pode participar ─────────

const RELAMPAGO = `
  emps = [{ id:"ana", name:"Ana Souza", color:"#ea580c", role:"user" }];
  custs = [{ id:"c1", name:"Poliane" }];
  clis = [
    { id:"l1", name:"Diamond Tricot", mkt:"Shopee", custId:"c1", respId:"ana" },
    { id:"l2", name:"Eva Home", mkt:"Shopee", custId:"c1", respId:"ana", relampagoNaoSeAplica:true },
  ];
  // Nenhuma das duas tem oferta relâmpago; as duas têm desconto, para o
  // aviso não se encher de outra coisa.
  tools = [
    { cliente:"l1", promocoes:[{ tipo:"desconto", inicio:1, fim:9e9 }] },
    { cliente:"l2", promocoes:[{ tipo:"desconto", inicio:1, fim:9e9 }] },
  ];
  tsks = [];
  currentUser = { id:"adm", name:"Willian", role:"admin", color:"#ea580c" };
`;

/** Quantas lojas recebem o selo de oferta relâmpago no aviso. */
const selosDeRelampago = (h) => (h.match(/sem oferta relâmpago/g) || []).length;

test("loja bloqueada da oferta relâmpago não é cobrada por ela", async () => {
  // Cobrar o que ninguém pode fazer é o jeito mais rápido de ensinar a equipe
  // a rolar a tela sem ler. Ela continua no aviso por outras pendências —
  // o que sai é só a cobrança da relâmpago.
  const ctx = await montarApp(RELAMPAGO);
  const h = eval_(ctx, `return avisoFerramentasHTML();`);
  assert.equal(selosDeRelampago(h), 1, "só a loja que participa é cobrada");
  const linhaEva = h.slice(h.indexOf("Eva Home"));
  assert.doesNotMatch(linhaEva.slice(0, 400), /sem oferta relâmpago/);
});

test("sem a marca, as duas lojas são cobradas, como antes", async () => {
  const ctx = await montarApp(RELAMPAGO.replace(", relampagoNaoSeAplica:true", ""));
  assert.equal(selosDeRelampago(eval_(ctx, `return avisoFerramentasHTML();`)), 2);
});

test("o formulário de loja traz a marca, e ela é salva", () => {
  const form = fs.readFileSync(path.join(raiz, "js", "06-formularios.js"), "utf8");
  assert.match(form, /id="cf-sem-relampago"/);
  // A gravação passou a ser condicional: cupom e oferta relâmpago são
  // ferramentas da Shopee, e uma loja de ML ou TikTok não carrega nenhum dos
  // dois — nem o valor padrão.
  assert.match(form, /relampagoNaoSeAplica:ehLojaShopee\(\)\?document\.getElementById\("cf-sem-relampago"\)\.checked:false/);
  // O rascunho da loja sobrevive a criar um cliente no meio do caminho.
  assert.match(form, /cf-sem-relampago"\)\.checked=Boolean\(snap\.semRelampago\)/);
});

// ── A tabela conferida contra o que a Shopee cobrou ────────────────────

test("a conferência lê as vendas para comparar com o cobrado de verdade", () => {
  const prod = fs.readFileSync(path.join(raiz, "js", "08-produtos.js"), "utf8");
  // `sales` guarda comissao e taxaServico vindos da API financeira da Shopee.
  // É a única fonte que diz o que ela COBROU, e não o que se supõe.
  assert.match(prod, /collection\(window\.fb\.db, "sales"\)/);
  assert.match(prod, /window\.taxas\.conferirTabelaShopee\(dias\)/);
});

test("a conferência nomeia qual dos dois lados engana", () => {
  const prod = fs.readFileSync(path.join(raiz, "js", "08-produtos.js"), "utf8");
  // Descontar de menos é o caso perigoso: a margem sai mais alta que a real.
  assert.match(prod, /desconta <b>menos<\/b> do que a Shopee cobra/);
  assert.match(prod, /é a que engana/);
});

test("falhar a conferência da tabela não derruba a comparação com a planilha", () => {
  const prod = fs.readFileSync(path.join(raiz, "js", "08-produtos.js"), "utf8");
  const i = prod.indexOf("const conferirTabela");
  assert.match(prod.slice(i, i + 2600), /catch \(e\) \{\s*console\.error\("conferirTabela:", e\);\s*return "";/);
});

// ── Painel de parede (13/09/2026) ──────────────────────────────────────
//
// A tela de tarefas vista de longe. O que se prova aqui é a ORDEM em que
// ela responde as perguntas de quem administra uma fila, e uma ausência
// deliberada: não há ranking de quantas tarefas cada um concluiu.

const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const antesDeOntem = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
const semanaPassada = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);

const PAINEL = `
  emps = [
    { id:"ana", name:"Ana Souza", ini:"AS", color:"#ea580c", role:"user" },
    { id:"bruno", name:"Bruno Lima", ini:"BL", color:"#7c3aed", role:"user" },
  ];
  custs = [{ id:"c1", name:"Poliane" }];
  clis = [{ id:"l1", name:"Diamond Tricot", mkt:"Shopee", custId:"c1", respId:"ana" }];
  tools = [];
  tsks = [
    { id:"t0", cli:"l1", emp:"ana", status:"doing", title:"Subir 9 anúncios", pri:"alta", date:"${semanaPassada}", qty:9 },
    { id:"t1", cli:"l1", emp:"ana", status:"todo", title:"Conferir estoque", pri:"alta", date:"${antesDeOntem}" },
    { id:"t2", cli:"l1", emp:"bruno", status:"todo", title:"Trocar fotos", pri:"media", date:"${ontem}" },
    { id:"t3", cli:"l1", emp:"ana", status:"todo", title:"Revisar títulos", pri:"baixa", date:"${HOJE}" },
    { id:"t4", cli:"l1", emp:"", status:"todo", title:"Ativar desconto", pri:"alta", date:"${ontem}", auto:true },
    { id:"t5", cli:"l1", emp:"ana", status:"done", title:"Já feita", pri:"media", date:"${ontem}", doneDate:"${HOJE}" },
    { id:"t6", cli:"l1", emp:"bruno", status:"done", title:"Feita ontem", pri:"media", date:"${ontem}", doneDate:"${ontem}" },
    { id:"t7", cli:"l1", emp:"ana", status:"done", title:"Feita semana passada", pri:"media", date:"${semanaPassada}", doneDate:"${semanaPassada}" },
  ];
  currentUser = { id:"adm", name:"Willian", role:"admin", color:"#ea580c" };
`;

test("a fila mostra a mais antiga primeiro", async () => {
  // É a ordem da comanda: o que está esperando há mais tempo sai na frente.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rPainel();`);
  const pos = (t) => h.indexOf(t);
  assert.ok(pos("Subir 9 anúncios") < pos("Conferir estoque"), "6 dias antes de 2 dias");
  assert.ok(pos("Conferir estoque") < pos("Trocar fotos"), "2 dias antes de 1 dia");
  assert.ok(pos("Trocar fotos") < pos("Revisar títulos"), "1 dia antes de hoje");
});

test("tarefa concluída sai da fila e vira contagem do dia", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rPainel();`);
  assert.doesNotMatch(h, /Já feita/, "concluída some da tela, como a comanda pronta");
  assert.match(h, /saiu hoje|saíram hoje/);
});

test("a tarefa sem dono sobe para a faixa de exceção", async () => {
  // É o que a equipe não resolve sozinha: enterrada entre os cartões,
  // ninguém age.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rPainel();`);
  const faixa = h.slice(h.indexOf("tv-excecao"), h.indexOf("tv-grade"));
  assert.match(faixa, /1 tarefa parada/);
  assert.match(faixa, /Ativar desconto/);
  assert.match(faixa, /Definir responsável/);
});

test("sem tarefa órfã, a faixa de exceção não existe", async () => {
  const ctx = await montarApp(PAINEL.replace('emp:"", status:"todo", title:"Ativar desconto"', 'emp:"ana", status:"todo", title:"Ativar desconto"'));
  assert.doesNotMatch(eval_(ctx, `return rPainel();`), /tv-excecao/);
});

test("a carga conta o que cada um tem ABERTO, nunca o que concluiu", async () => {
  // A ausência é o ponto: um ranking de conclusão num telão faz a pessoa
  // escolher a tarefa fácil para o número subir.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rPainel();`);
  const rodape = h.slice(h.indexOf("tv-carga"));
  assert.match(rodape, /Ana <b>3<\/b>/, "Ana tem 3 abertas (a concluída não conta)");
  assert.match(rodape, /Bruno <b>1<\/b>/);
  assert.match(rodape, /Na mão de cada um/);
});

test("a média diária ignora hoje e não inventa tendência sem histórico", async () => {
  const ctx = await montarApp(PAINEL);
  // Dois dias com conclusão (ontem e semana passada): média sai.
  assert.match(eval_(ctx, `return rPainel();`), /média \d+\/dia/);
  // Um dia só: não há tendência que se afirme com isso.
  const h = eval_(ctx, `tsks = tsks.filter(t => t.id !== "t7"); return rPainel();`);
  assert.doesNotMatch(h, /média/);
});

test("a tarja de tempo muda de cor pelo atraso", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rPainel();`);
  assert.match(h, /background:#dc2626/, "vermelho: atrasada de 3 dias ou mais");
  assert.match(h, /background:#f59e0b/, "âmbar, até 2 dias");
});

test("o cartão em andamento oferece concluir; o parado, iniciar", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rPainel();`);
  assert.match(h, /data-next="done"[^>]*>CONCLUIR/);
  assert.match(h, /data-next="doing"[^>]*>INICIAR/);
});

test("fila vazia diz que está tudo em dia, em vez de mostrar nada", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `tsks = tsks.filter(t => t.status === "done"); return rPainel();`);
  assert.match(h, /Nada na fila/);
  assert.doesNotMatch(h, /tv-card/);
});

test("cabem 8 cartões e o resto é contado, não escondido", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `
    tsks = [];
    for (let i = 0; i < 12; i++) tsks.push({ id:"x"+i, cli:"l1", emp:"ana", status:"todo",
      title:"Tarefa "+i, pri:"media", date:"${ontem}" });
    return rPainel();`);
  assert.equal((h.match(/class="tv-card"/g) || []).length, 8);
  assert.match(h, /\+4 na fila/);
});

test("o modo TV toma a tela inteira, e a devolve ao sair", async () => {
  // Sem tirar a classe ao trocar de aba, o sistema ficaria sem menu.
  const telas = fs.readFileSync(path.join(raiz, "js", "04-telas.js"), "utf8");
  assert.match(telas, /const emTV=view==="kanban"&&modoTV;/);
  assert.match(telas, /classList\.toggle\("tv-cheia",emTV\)/);
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  // A navegação passa por navegarPara(), que registra no histórico do
  // navegador — sem isso, o "voltar" saía do sistema.
  assert.match(boot, /kbtv\.onclick=\(\)=>navegarPara\(\(\)=>\{modoTV=true;\}\)/, "entra pelo botão");
  assert.match(boot, /tvs\.onclick=\(\)=>navegarPara\(\(\)=>\{modoTV=false;\}\)/, "sai pelo ✕");
});

test("o modo TV é um modo da tela de tarefas, não uma aba", async () => {
  // Duas telas para o mesmo trabalho são duas para manter, e elas divergem.
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.doesNotMatch(html, /data-view="painel"/, "a aba saiu do menu");
  const telas = fs.readFileSync(path.join(raiz, "js", "04-telas.js"), "utf8");
  assert.doesNotMatch(telas, /painel:rPainel/, "e saiu do roteador");
  // Quem estava com a aba antiga aberta quando a versão subir cai no modo,
  // em vez de numa tela que não existe mais.
  assert.match(telas, /if\(view==="painel"\)\{view="kanban";modoTV=true;\}/);
});

test("o painel esconde o que ele substitui, pelos seletores que existem", () => {
  // O CLAUDE.md registra esta armadilha: escrever CSS para uma classe que o
  // projeto não tem falha calada. Aqui era `.topbar` e `.corpo` — no sistema
  // são `#topbar` e `#content`, e a barra do topo teria ficado na tela.
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  for (const alvo of ["#sidebar", "#topbar", "#content"]) {
    assert.match(html, new RegExp(`body\\.tv-cheia ${alvo}\\{`), `${alvo} não é escondido`);
    assert.ok(html.includes(`id="${alvo.slice(1)}"`), `${alvo} não existe no HTML`);
  }
});

test("a altura do painel não soma a janela duas vezes", () => {
  // 100vh dentro de um pai que já ocupa a janela corta o rodapé.
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.match(html, /\.tv\{height:100%/);
});

test("o CSS do painel é todo escopado: o sistema é claro, ele é escuro", async () => {
  // Uma regra solta pintaria de preto a tela ao lado.
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  const bloco = html.slice(html.indexOf("PAINEL DE PAREDE"), html.indexOf("O sistema começa OCULTO"));
  const regras = [...bloco.matchAll(/^([.#][a-zA-Z][^{]*)\{/gm)].map((m) => m[1].trim());
  const soltas = regras.filter((r) => !/\.tv[-\s.:]|\.tv$|body\.tv-cheia/.test(r));
  assert.deepEqual(soltas, [], "estas regras escapam do painel");
});

test("o número de cartões segue as colunas, para nenhum ficar espremido", async () => {
  // Oito cartões em três colunas pedem três linhas; com duas fixas, as de
  // cima encolhem até o texto sumir. O cartão não encolhe — some da tela, e
  // o rodapé conta quantos ficaram de fora.
  const ctx = await montarApp(PAINEL);
  const doze = `
    tsks = [];
    for (let i = 0; i < 12; i++) tsks.push({ id:"x"+i, cli:"l1", emp:"ana", status:"todo",
      title:"Tarefa "+i, pri:"media", date:"${ontem}" });`;

  const largura = (w) => { ctx.window.innerWidth = w; };

  largura(1440);
  let h = eval_(ctx, doze + "return rPainel();");
  assert.equal((h.match(/class="tv-card"/g) || []).length, 8, "TV: 4 colunas");
  assert.match(h, /\+4 na fila/);

  largura(1100);
  h = eval_(ctx, doze + "return rPainel();");
  assert.equal((h.match(/class="tv-card"/g) || []).length, 6, "notebook: 3 colunas");
  assert.match(h, /\+6 na fila/, "o contador acompanha, em vez de mentir");

  largura(800);
  h = eval_(ctx, doze + "return rPainel();");
  assert.equal((h.match(/class="tv-card"/g) || []).length, 4, "estreito: 2 colunas");
});

test("sem janela para medir, o painel assume a TV", async () => {
  // No teste e em qualquer render fora do navegador não há innerWidth.
  const ctx = await montarApp(PAINEL);
  delete ctx.window.innerWidth;
  assert.equal(eval_(ctx, `return tvColunas();`), 4);
});

test("redimensionar redesenha o painel, e o handler é registrado uma vez só", () => {
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /if\(!window\._tvResize\)\{/, "sem a guarda, cada redesenho empilha um handler");
  assert.match(boot, /if\(view!=="painel"\)return;/, "não redesenha as outras telas à toa");
});

// ── A tela de tarefas redesenhada (13/09/2026) ─────────────────────────
//
// Ela SUBSTITUIU o kanban antigo, então o que se prova primeiro é que nada
// do trabalho se perdeu no caminho.

test("nada que o kanban fazia se perdeu", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rKanban();`);
  // filtros
  assert.match(h, /id="k-emp"/, "filtro por funcionário");
  assert.match(h, /id="k-cli"/, "filtro por loja");
  assert.match(h, /id="k-cust"/, "filtro por cliente");
  assert.match(h, /id="k-sort"/, "ordenação");
  assert.match(h, /id="k-myonly"/, "só as minhas");
  // ações por cartão
  assert.match(h, /data-view="t1"/, "ver detalhes");
  assert.match(h, /data-edit="t1"/, "editar");
  assert.match(h, /data-del="t1"/, "excluir");
  assert.match(h, /data-move="t1"/, "mover de coluna");
  // arrastar
  assert.match(h, /draggable="true"/);
  assert.match(h, /class="kanban-col kb-lista" data-col="todo"/, "a coluna que recebe o arraste");
});

test("a tarefa automática não oferece excluir", async () => {
  // Ela volta no próximo sync. Excluir dá a impressão de resolver e não
  // resolve — o que resolve é a pendência sair do ar na Shopee.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `tsks[3].auto = true; return rKanban();`);
  const cartao = h.slice(h.indexOf('data-card="t4"'), h.indexOf('data-card="t4"') + 900);
  assert.match(cartao, /data-edit="t4"/);
  assert.doesNotMatch(cartao, /data-del="t4"/);
});

test("a cor do cartão vem do ATRASO, não da prioridade", async () => {
  // Quase toda tarefa está marcada como alta: a cor da prioridade não
  // distinguia nada.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rKanban();`);
  const atrasada = h.slice(h.indexOf('data-card="t0"'), h.indexOf('data-card="t0"') + 200);
  assert.match(atrasada, /border-left-color:#dc2626/, "6 dias: vermelho");
  const hoje = h.slice(h.indexOf('data-card="t3"'), h.indexOf('data-card="t3"') + 200);
  assert.match(hoje, /border-left-color:#f59e0b/, "hoje: âmbar");
});

test("tarefa futura se distingue de tarefa atrasada", async () => {
  // "3d" sozinho se lê como atrasada há três dias.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `
    tsks = [{ id:"f1", cli:"l1", emp:"ana", status:"todo", title:"Futura", pri:"media",
      date:"${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}" }];
    return rKanban();`);
  assert.match(h, /em 3d/);
});

test("as concluídas ficam fechadas, e abrem só as de hoje", async () => {
  // Abrir com as 400 de sempre devolveria à tela o histórico morto que ela
  // acabou de tirar do caminho.
  const ctx = await montarApp(PAINEL);
  let h = eval_(ctx, `verConcluidas = false; return rKanban();`);
  assert.doesNotMatch(h, /Concluídas hoje/);
  assert.match(h, /1 concluída hoje/, "o rodapé conta e oferece abrir");

  h = eval_(ctx, `verConcluidas = true; const x = rKanban(); verConcluidas = false; return x;`);
  assert.match(h, /Concluídas hoje/);
  assert.match(h, /Já feita/, "a de hoje entra");
  assert.doesNotMatch(h, /Feita ontem/, "a de ontem não");
  assert.doesNotMatch(h, /Feita semana passada/);
});

test("o pulso fala da fila inteira, mesmo com filtro ligado", async () => {
  // Filtrar por uma pessoa não muda quantas tarefas a equipe tem atrasadas.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `fEmp = "bruno"; const x = rKanban(); fEmp = "all"; return x;`);
  const pulso = h.slice(0, h.indexOf("kb-filtros"));
  assert.match(pulso, /<b class="kb-big">5<\/b><span>na fila<\/span>/, "as 5 abertas da equipe");
  assert.match(h, /1 de 5 abertas/, "o recorte filtrado aparece à parte");
});

test("clicar num nome da carga filtra por ele, e clicar de novo desfaz", async () => {
  const ctx = await montarApp(PAINEL);
  assert.match(eval_(ctx, `return rKanban();`), /data-filtraremp="ana"/);
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /fEmp=fEmp===b\.dataset\.filtraremp\?"all":b\.dataset\.filtraremp/);
});

test("a faixa de exceção e o pulso do painel vieram para a tela de trabalho", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `return rKanban();`);
  assert.match(h, /1 tarefa parada/, "a tarefa sem dono");
  assert.match(h, /id="kb-ir-clientes"/, "com o atalho para resolver");
  assert.match(h, /saiu hoje|saíram hoje/, "o pulso");
  assert.match(h, /a mais antiga/);
});

// ── render(), a função que desenha TODAS as telas ──────────────────────
//
// Esta seção existe porque a suíte tinha um buraco: os testes chamavam
// rDash() e rKanban() direto, e nenhum chamava render() — a função que o
// sistema usa de verdade. Uma variável lida acima da própria declaração
// passou por `node --check`, passou por 427 testes, e derrubou o sistema
// inteiro em produção: nenhuma tela desenhava e nada clicava.

/** Um app pronto para render(): DOM com os ganchos que ele toca. */
async function appParaRender(fixture) {
  const alvos = {};
  const el = (id) => (alvos[id] ||= {
    ...elFake, id, innerHTML: "", textContent: "", style: {}, onclick: null,
    classList: { add: noop, remove: noop, toggle: noop },
    querySelectorAll: () => [], querySelector: () => null, contains: () => false,
  });
  const ctx = await montarApp(fixture);
  ctx.document.getElementById = el;
  ctx.document.querySelectorAll = () => [];
  ctx.document.querySelector = () => null;
  ctx.document.body = { classList: { add: noop, remove: noop, toggle: noop } };
  ctx.document.activeElement = null;
  ctx.window.matchMedia = () => ({ matches: false });
  return { ctx, el };
}

for (const tela of ["dashboard", "kanban", "clientes", "equipe", "relatorios"]) {
  test(`render() desenha a tela "${tela}" sem quebrar`, async () => {
    const { ctx, el } = await appParaRender(PAINEL);
    eval_(ctx, `view = ${JSON.stringify(tela)}; render();`);
    assert.ok(el("content").innerHTML.length > 100,
      `render() não preencheu a tela — o conteúdo ficou com ${el("content").innerHTML.length} caracteres`);
  });
}

test("render() entra e sai do modo TV sem quebrar", async () => {
  const { ctx, el } = await appParaRender(PAINEL);
  eval_(ctx, `view = "kanban"; modoTV = true; render();`);
  assert.match(el("content").innerHTML, /class="tv"/, "entrou no modo TV");
  eval_(ctx, `modoTV = false; render();`);
  assert.match(el("content").innerHTML, /kb-pulso/, "voltou para a tela de trabalho");
});

test("render() aceita a aba antiga do painel e cai no modo TV", async () => {
  const { ctx, el } = await appParaRender(PAINEL);
  eval_(ctx, `view = "painel"; modoTV = false; render();`);
  assert.equal(eval_(ctx, `return view;`), "kanban");
  assert.match(el("content").innerHTML, /class="tv"/);
});

test("render() desenha mesmo sem tarefa, sem loja e sem funcionário", async () => {
  // O sistema novo, ou um funcionário que só enxerga o próprio recorte.
  const { ctx, el } = await appParaRender(`
    emps = []; custs = []; clis = []; tools = []; tsks = [];
    currentUser = { id:"adm", name:"Willian", ini:"WM", role:"admin", color:"#ea580c" };
  `);
  for (const tela of ["dashboard", "kanban", "clientes"]) {
    eval_(ctx, `view = ${JSON.stringify(tela)}; render();`);
    assert.ok(el("content").innerHTML.length > 50, `${tela} ficou vazia`);
  }
});

// ── Menu enxuto: três telas viraram abas (13/09/2026) ──────────────────
//
// O menu lateral tinha onze entradas, três delas para telas que pertencem ao
// mesmo assunto. Menu comprido é menu que ninguém lê inteiro.

test("Clientes agrupa Lojas, Integrações e Produtos", async () => {
  const ctx = await montarApp(PAINEL);
  for (const [aba, marca] of [["lojas", /Gerenciar clientes/], ["integracoes", /integ/i], ["produtos", /prod-cliente|prod-recentes/]]) {
    const h = eval_(ctx, `subAba.clientes = ${JSON.stringify(aba)}; const x = rClientes(); subAba.clientes = "lojas"; return x;`);
    assert.match(h, /class="abas"/, `a aba ${aba} perdeu a barra de abas`);
    assert.match(h, new RegExp(`aba aba-on"[^>]*data-abaid="${aba}"`), `${aba} não fica marcada`);
    assert.match(h, marca, `a aba ${aba} não desenhou o conteúdo dela`);
  }
});

test("Equipe agrupa as pessoas e a produtividade", async () => {
  const ctx = await montarApp(PAINEL);
  const pessoas = eval_(ctx, `subAba.equipe = "pessoas"; return rEquipe();`);
  assert.match(pessoas, /aba aba-on"[^>]*data-abaid="pessoas"/);
  const prod = eval_(ctx, `subAba.equipe = "produtividade"; const x = rEquipe(); subAba.equipe = "pessoas"; return x;`);
  assert.match(prod, /aba aba-on"[^>]*data-abaid="produtividade"/);
  assert.match(prod, /Produtividade por funcionário/);
});

test("as três entradas saíram do menu lateral", () => {
  const html = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  for (const v of ["integracoes", "relatorios", "produtos"]) {
    assert.doesNotMatch(html, new RegExp(`data-view="${v}"`), `${v} ainda está no menu`);
  }
  // Sobraram sete: Dashboard, Tarefas, Clientes, Equipe, Relat. de Cliente,
  // Vendas, Ferramentas e Diagnóstico — o menu que cabe numa olhada.
  assert.ok((html.match(/class="nav-btn"/g) || []).length <= 8);
});

test("quem estiver nas views antigas cai na aba certa, não numa tela sem menu", async () => {
  const { ctx } = await appParaRender(PAINEL);
  for (const [antiga, tela, aba, campo] of [
    ["integracoes", "clientes", "integracoes", "clientes"],
    ["produtos", "clientes", "produtos", "clientes"],
    ["relatorios", "equipe", "produtividade", "equipe"],
  ]) {
    eval_(ctx, `view = ${JSON.stringify(antiga)}; render();`);
    assert.equal(eval_(ctx, `return view;`), tela, `${antiga} deveria levar a ${tela}`);
    assert.equal(eval_(ctx, `return subAba[${JSON.stringify(campo)}];`), aba);
  }
});

test("clicar numa aba troca e redesenha", () => {
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /navegarPara\(\(\)=>\{subAba\[b\.dataset\.aba\]=b\.dataset\.abaid;\}\)/);
});

// ── O gráfico de produtividade que não aparecia ────────────────────────

test("a barra de produtividade tem largura própria", async () => {
  // As colunas verticais anteriores tinham width:100% dentro de um container
  // centralizado sem largura, e 100% de nada é zero: o gráfico ficava em
  // branco com os nomes soltos embaixo.
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `subAba.equipe = "produtividade"; const x = rEquipe(); subAba.equipe = "pessoas"; return x;`);
  assert.match(h, /class="pb-trilho"/);
  assert.match(h, /class="pb-fatia" style="width:\d+(\.\d+)?%/, "a fatia é dimensionada em %");
  const css = fs.readFileSync(path.join(raiz, "app.html"), "utf8");
  assert.match(css, /\.pb-trilho\{flex:1;/, "o trilho ocupa a linha, então a % tem de quê ser");
});

test("pessoa sem tarefa nenhuma não vira barra fantasma", async () => {
  const ctx = await montarApp(PAINEL);
  const h = eval_(ctx, `
    tsks = [];
    subAba.equipe = "produtividade"; const x = rEquipe(); subAba.equipe = "pessoas"; return x;`);
  assert.doesNotMatch(h, /class="pb-fatia"/, "sem tarefa, sem fatia");
  assert.match(h, /class="pb-trilho"/, "mas o trilho vazio continua, mostrando que a pessoa existe");
});

// ── O botão "voltar" do navegador (13/09/2026) ─────────────────────────
//
// Sem histórico, voltar saía do sistema: quem estava no relatório e tinha
// passado pelo dashboard ia parar na busca do Google.

test("toda navegação registra no histórico; o redesenho não", () => {
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /function navegarPara\(mudanca\)/);
  assert.match(boot, /history\.pushState\(estadoDaTela\(\),""\)/);
  // render() roda a cada chegada de dado do Firestore: empilhar ali encheria
  // o histórico de cópias da mesma tela.
  const iRender = boot.indexOf("function navegarPara");
  const corpo = boot.slice(iRender, iRender + 400);
  assert.ok(corpo.indexOf("pushState") < corpo.indexOf("render()"),
    "primeiro empilha, depois desenha");
});

test("o estado guarda a TELA, não o filtro", () => {
  // Voltar tem que devolver a tela; um filtro ressuscitado dá a impressão
  // de que o sistema não obedeceu.
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  const i = boot.indexOf("function estadoDaTela()");
  const corpo = boot.slice(i, i + 160);
  assert.match(corpo, /return\{view,subAba:\{\.\.\.subAba\},modoTV\}/);
  assert.doesNotMatch(corpo, /fEmp|fCli|fCust|myOnly/);
});

test("o histórico só começa com a sessão confirmada", () => {
  // Antes disso não há tela para voltar, e um popstate no login mandaria
  // para o dashboard de alguém que ainda não entrou.
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  const iSessao = boot.indexOf('classList.add("sessao-ativa")');
  // A CHAMADA, não a definição da função — que fica lá no alto do arquivo.
  const iChamada = boot.indexOf("iniciarHistorico();", iSessao);
  assert.ok(iSessao > 0 && iChamada > iSessao,
    "iniciarHistorico() precisa ser chamado depois de a sessão ser confirmada");
  const iPop = boot.indexOf('addEventListener("popstate"');
  const corpo = boot.slice(iPop, iPop + 200);
  assert.ok(corpo.indexOf("if(!currentUser)return;") < corpo.indexOf("aplicarEstado"),
    "popstate ignora quem ainda não entrou");
});

test("voltar ao estado sem tela cai no dashboard, não em branco", () => {
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /aplicarEstado\(ev\.state\|\|\{view:"dashboard"\}\)/);
  assert.match(boot, /view=st\.view\|\|"dashboard"/);
});

test("navegador sem history não quebra a navegação", () => {
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  const i = boot.indexOf("function navegarPara");
  assert.match(boot.slice(i, i + 330), /try\{history\.pushState[\s\S]*?catch/);
});

test("o menu lateral navega pelo caminho novo e sai do modo TV", () => {
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /navegarPara\(\(\)=>\{view=btn\.dataset\.view;modoTV=false;\}\)/);
});

test("o diagnóstico monta os critérios mesmo sendo sub-aba", async () => {
  // Ele preenche #diag-dims DEPOIS do desenho, e essa lista é o corpo da
  // tela. Ao virar sub-aba, a chamada parou de disparar e a página abria com
  // cabeçalho, nota zerada e "0 de 0 critérios" — sem erro no console.
  const telas = fs.readFileSync(path.join(raiz, "js", "04-telas.js"), "utf8");
  assert.match(telas, /if\(view==="diagnostico"\|\|\(view==="clientes"&&subAba\.clientes==="diagnostico"\)\)diagRender\(\)/);
});

test("toda tela que precisa de montagem depois do desenho é chamada", async () => {
  // A mesma armadilha vale para o painel de fichas da aba Produtos.
  const boot = fs.readFileSync(path.join(raiz, "js", "07-interacoes-e-boot.js"), "utf8");
  assert.match(boot, /if\(C\.querySelector\("#prod-recentes"\)\)carregarFichasRecentes\(\)/,
    "o painel de fichas se monta pela presença do elemento, não pela view");
});

// ── O roteador enxuto (13/09/2026) ─────────────────────────────────────

test("o roteador lista só as quatro telas do menu", () => {
  // As outras viraram abas: quem desenha cada uma é rClientes() ou rEquipe().
  // Sete entradas órfãs no mapa nunca eram alcançadas — o desvio troca a view
  // antes de chegar lá — e confundiam quem fosse ler depois.
  const telas = fs.readFileSync(path.join(raiz, "js", "04-telas.js"), "utf8");
  const mapa = telas.match(/const TELAS=\{[^}]*\}/);
  assert.ok(mapa, "o roteador precisa existir");
  assert.equal(mapa[0], "const TELAS={dashboard:rDash,kanban:rKanban,clientes:rClientes,equipe:rEquipe}");
  // O mapa das ABAS, dentro de rClientes(), continua existindo — é ele que
  // desenha cada uma. O que saiu foi só a duplicata no roteador principal.
  assert.match(telas, /const outras=\{integracoes:rIntegracoes/);
});

test("view desconhecida vira dashboard, e não quebra o desenho", async () => {
  // Sem esta rede, uma view fora da lista deixaria `desenhar` indefinido e
  // derrubaria o render() inteiro — o mesmo modo de falha que já tirou o
  // sistema do ar uma vez. Corrigir a VARIÁVEL, e não só o desenho, deixa o
  // menu destacado e o título certo.
  const { ctx, el } = await appParaRender(PAINEL);
  eval_(ctx, `view = "uma-tela-que-nao-existe"; render();`);
  assert.equal(eval_(ctx, `return view;`), "dashboard");
  assert.ok(el("content").innerHTML.length > 100, "desenhou alguma coisa");
  assert.equal(el("page-title").textContent, "Dashboard");
});

test("as funções das abas continuam existindo e sendo chamadas", async () => {
  // Tirar do roteador não pode ter tirado do sistema.
  const ctx = await montarApp(PAINEL);
  for (const [tela, aba, fn] of [
    ["clientes", "integracoes", "rIntegracoes"],
    ["clientes", "produtos", "rProdutos"],
    ["clientes", "diagnostico", "rDiagnostico"],
    ["equipe", "produtividade", "rRelatorios"],
  ]) {
    assert.equal(eval_(ctx, `return typeof ${fn};`), "function", `${fn} sumiu`);
    const desenho = tela === "clientes" ? "rClientes()" : "rEquipe()";
    const h = eval_(ctx, `subAba[${JSON.stringify(tela)}] = ${JSON.stringify(aba)};
      const x = ${desenho}; subAba.clientes = "lojas"; subAba.equipe = "pessoas"; return x;`);
    assert.ok(h.length > 200, `a aba ${aba} não desenhou nada`);
  }
});
