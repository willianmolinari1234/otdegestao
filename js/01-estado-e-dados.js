
// ─── SEED DATA ────────────────────────────────────────────────────────
const uid=()=>Math.random().toString(36).slice(2,9);
const todayISO=()=>new Date().toISOString().slice(0,10);
const MKTS=["Shopee","Shein","Mercado Livre","TikTok"];
// Brand identity per marketplace: icon glyph + colors. Falls back gracefully for unknown markets.
const MKT_STYLE={
  "shopee":   {bg:"#fff1e9", fg:"#ee4d2d", border:"#ffd4c2"},
  "shein":    {bg:"#1a1a1a", fg:"#ffffff", border:"#1a1a1a"},
  "mercado livre":{bg:"#fff8e1", fg:"#b78a00", border:"#ffe9a8"},
  "mercadolivre":{bg:"#fff8e1", fg:"#b78a00", border:"#ffe9a8"},
  "amazon":   {bg:"#fff5e6", fg:"#c45500", border:"#ffddb0"},
  "magalu":   {bg:"#eef4ff", fg:"#0086ff", border:"#c7ddff"},
  "magazine luiza":{bg:"#eef4ff", fg:"#0086ff", border:"#c7ddff"},
  "tiktok":   {bg:"#1a1a1a", fg:"#ffffff", border:"#1a1a1a"},
  "tiktok shop":{bg:"#1a1a1a", fg:"#ffffff", border:"#1a1a1a"},
  "aliexpress":{bg:"#fff0ee", fg:"#e62e04", border:"#ffd1c8"},
  "site próprio":{bg:"#eef6f1", fg:"#16794c", border:"#c2e6d4"},
  "site proprio":{bg:"#eef6f1", fg:"#16794c", border:"#c2e6d4"}
};
function mktStyle(name){
  return MKT_STYLE[String(name||"").toLowerCase().trim()]||{bg:"#f1f5f9", fg:"#475569", border:"#e2e8f0"};
}
function mktBadge(name){
  const s=mktStyle(name);
  return`<span style="display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;background:${s.bg};color:${s.fg};border:1px solid ${s.border};border-radius:999px;padding:4px 13px;letter-spacing:-.01em">${esc(name||"—")}</span>`;
}
// ERP presets: auto-fill login URL and toggle the "ID" field per provider
const ERP_PRESETS={
  expedy:  {label:"Expedy",   url:"https://app.expedy.com.br/",   hasId:true},
  snap:    {label:"Snap",     url:"https://app.snaphub.com.br/inicio", hasId:true},
  upseller:{label:"Upseller", url:"https://app.upseller.com/pt/home",  hasId:false},
  outro:   {label:"Outro (personalizado)", url:"", hasId:false}
};
const COLORS=["#ea580c","#7c3aed","#db2777","#d97706","#2563eb","#dc2626","#16a34a","#0284c7"];
const TITLES={dashboard:"Dashboard",kanban:"Tarefas do Dia",clientes:"Clientes / Contas",equipe:"Equipe",relatorios:"Relatórios de Produtividade",diagnostico:"Diagnóstico de Conta",integracoes:"Integrações",relcliente:"Relatório de Cliente",vendas:"Vendas · Todas as Lojas",ferramentas:"Ferramentas por Loja",produtos:"Produtos do Cliente"};
const PLBL={alta:"Alta",media:"Média",baixa:"Baixa"};
const SLBL={todo:"A fazer",doing:"Em andamento",done:"Concluído"};
const SCOL={todo:"#64748b",doing:"#ea580c",done:"#16a34a"};
const SBGCOL={todo:"#f1f5f9",doing:"#ffedd5",done:"#dcfce7"};
const PCOL={alta:"#dc2626",media:"#d97706",baixa:"#2563eb"};
const PBGCOL={alta:"#fee2e2",media:"#fef3c7",baixa:"#dbeafe"};

// Local storage helpers kept for filter state only (auth handled by Firebase)
function lsGet(k,fb){try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}

const T=todayISO();
const daysAgo=(n)=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);};
const daysAhead=(n)=>{const d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
// ─── ESTADO EM MEMÓRIA ────────────────────────────────────────────────
// Cada variável espelha uma coleção do Firestore. Os nomes curtos são
// históricos; o mapa abaixo é a referência. Ver ESQUEMA-DE-DADOS.md.
//
//   emps    → employees    equipe (login + papel)
//   custs   → customers    clientes proprietários (definem % de gestão)
//   clis    → clients      lojas (é o "cliente" no resto do sistema)
//   tsks    → tasks        tarefas
//   proms   → promos       promoções acompanhadas à mão
//   integs  → integracoes  status das conexões com a Shopee
//
// ATENÇÃO à ambiguidade da palavra "cliente":
//   · no cadastro, "cliente" = o PROPRIETÁRIO (custs/customers)
//   · nos dados de venda, o campo `cliente` = a LOJA (clis/clients)
let emps=[];
let custs=[];
let clis=[];
let tsks=[];
let proms=[];
let integs=[];
let tools=[];         // promoções ativas por loja (vindas da Shopee)
let conferencia=null; // último resultado da conferência diária (só admin)
let prodCliente=lsGet("prodCliente","");
let fIntegBusca="",fIntegFiltro="all";
// Base das Cloud Functions (backend da integração Shopee).
// Aponta para o backend do MESMO ambiente em que a página está rodando.
const FN_BASE=(window.AMBIENTE==="homolog")
  ? "https://us-central1-otdegestao-homolog.cloudfunctions.net"
  : "https://us-central1-otdegestao.cloudfunctions.net";

// Homologação não tem backend próprio (as lojas foram autorizadas no app de
// produção da Shopee). Em vez de o botão falhar com erro de rede, ele avisa.
// SEM_BACKEND também protege contra o pior caso: o ambiente de teste nunca
// dispara uma sincronização que gravaria em produção.
const SEM_BACKEND = (window.AMBIENTE === "homolog");
function backendIndisponivel(){
  alert("Ambiente de TESTE: o backend da Shopee não roda aqui.\n\n"
      + "Sincronizar, conectar loja e criar funcionário só funcionam em produção.\n"
      + "Aqui você testa telas, cálculos e permissões com dados separados.");
  return null;
}
let currentUser=null;
let myOnly=false;
let view="dashboard",fRange="today",fDate=todayISO(),fEmp="all",fCli="all",fCust="all",fSort="prazo",fErp="all",fMkt="all";
let repRange="all"; // for reports view
let repFrom=""; // custom range start (ISO)
let repTo="";   // custom range end (ISO)
let repGoals={adsPerDay:0,conclusao:0}; // metas: anúncios/dia por funcionário, taxa de conclusão %
// persist() is now a no-op — Firebase auto-syncs every write
function persist(){}

function isAdmin(){return currentUser&&currentUser.role==="admin";}
function visibleTasks(){
  if(isAdmin())return tsks;
  if(!currentUser)return [];
  return tsks.filter(t=>t.emp===currentUser.id);
}
function visibleProms(){
  if(isAdmin())return proms;
  if(!currentUser)return [];
  return proms.filter(p=>p.emp===currentUser.id);
}

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────
async function fbAdd(coll,obj){
  const ref=window.fb.doc(window.fb.collection(window.fb.db,coll));
  await window.fb.setDoc(ref,{...obj,id:ref.id});
  return ref.id;
}
async function fbSet(coll,id,obj){
  await window.fb.setDoc(window.fb.doc(window.fb.db,coll,id),{...obj,id},{merge:false});
}
async function fbUpdate(coll,id,patch){
  await window.fb.updateDoc(window.fb.doc(window.fb.db,coll,id),patch);
}
async function fbDelete(coll,id){
  await window.fb.deleteDoc(window.fb.doc(window.fb.db,coll,id));
}

// ─── REAL-TIME LISTENERS ──────────────────────────────────────────────
let listeners=[];
function startListeners(){
  stopListeners();
  setSyncStatus("loading","Sincronizando...");
  let loaded=0;
  const total=5;
  const _done={};
  const onLoaded=()=>{loaded++;if(loaded>=total){setSyncStatus("online","Online");render();}};
  // Marca um listener do caminho crítico como concluído no máximo 1 vez,
  // seja por sucesso ou por erro (ex.: regra do Firestore negou a leitura).
  // Assim uma coleção negada não trava o boot em "Carregando...".
  //
  // IMPORTANTE: cada snapshot agora SEMPRE redesenha a tela. Antes, o primeiro
  // snapshot de cada coleção só marcava o boot e não renderizava — se os dados
  // chegassem depois de você já ter mexido num filtro, a tela ficava vazia até
  // recarregar a página. Era a causa de "troco de funcionário e as tarefas não
  // aparecem".
  const critDone=(key)=>{if(!_done[key]){_done[key]=true;if(loaded<total)onLoaded();}};
  if(isAdmin()){
    listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"employees"),snap=>{
      emps=snap.docs.map(d=>d.data());
      // Refresh currentUser if our doc changed
      if(currentUser){const me=emps.find(e=>e.id===currentUser.id);if(me)currentUser=me;}
      critDone("emps");render();
    },err=>{console.error("emps listener:",err);critDone("emps");}));
  }else{
    // Funcionário comum só pode ler o próprio cadastro (regra do Firestore).
    // Usa o currentUser já carregado no boot como a lista de "emps".
    emps=currentUser?[currentUser]:[];
    critDone("emps");
  }
  listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"customers"),snap=>{
    custs=snap.docs.map(d=>d.data());
    critDone("custs");render();
  },err=>{console.error("custs listener:",err);custs=[];critDone("custs");}));
  listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"clients"),snap=>{
    clis=snap.docs.map(d=>d.data());
    critDone("clis");render();
  },err=>{console.error("clis listener:",err);clis=[];critDone("clis");}));
  // Status das integrações Shopee (coleção sem tokens, só admin usa a tela).
  if(isAdmin()){
    listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"integracoes"),snap=>{
      integs=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(view==="integracoes")render();
    },err=>{console.error("integracoes listener:",err);integs=[];}));
  }
  const tasksRef=isAdmin()?window.fb.collection(window.fb.db,"tasks")
    :window.fb.query(window.fb.collection(window.fb.db,"tasks"),window.fb.where("emp","==",currentUser.id));
  listeners.push(window.fb.onSnapshot(tasksRef,snap=>{
    tsks=snap.docs.map(d=>d.data());
    critDone("tsks");render();
  },err=>{console.error("tsks listener:",err);tsks=[];critDone("tsks");}));
  const promsRef=isAdmin()?window.fb.collection(window.fb.db,"promos")
    :window.fb.query(window.fb.collection(window.fb.db,"promos"),window.fb.where("emp","==",currentUser.id));
  listeners.push(window.fb.onSnapshot(promsRef,snap=>{
    proms=snap.docs.map(d=>d.data());
    critDone("proms");render();
  },err=>{console.error("proms listener:",err);proms=[];critDone("proms");}));
  // A coleção "products" não é mais assinada: a tela de Planilhas de Margem
  // saiu do sistema e ninguém mais lê esses documentos. Os dados continuam no
  // Firestore — o que saiu foi o listener em tempo real, que redesenhava a
  // tela inteira a cada alteração de produto.
  // Ferramentas (promoções) por loja — alimentam o aviso de vencimento no
  // painel. Documento pequeno (uma linha por loja), então assinar é barato.
  listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"tools"),snap=>{
    tools=snap.docs.map(d=>({cliente:d.id,...d.data()}));
    if(currentUser&&view==="dashboard")render();
  },err=>{console.error("tools listener:",err);tools=[];}));
  // Conferência diária: o backend recompara com a Shopee e grava o resultado.
  // Só admin vê — é informação de fechamento, não de operação.
  if(isAdmin()){
    listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"conferencias"),snap=>{
      const todas=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));
      conferencia=todas[0]||null;
      if(currentUser&&view==="dashboard")render();
    },err=>{console.error("conferencias listener:",err);conferencia=null;}));
  }
  listeners.push(window.fb.onSnapshot(window.fb.collection(window.fb.db,"config"),snap=>{
    const g=snap.docs.map(d=>d.data()).find(d=>d.id==="repgoals");
    if(g)repGoals=Object.assign({adsPerDay:0,conclusao:0},g);
    if(currentUser)render();
  },err=>console.error("config listener:",err)));
}
function stopListeners(){listeners.forEach(unsub=>{try{unsub();}catch{}});listeners=[];}
function setSyncStatus(state,text){
  const el=document.getElementById("sync-indicator");
  const txt=document.getElementById("sync-text");
  if(!el||!txt)return;
  el.classList.remove("loading","offline");
  if(state==="loading")el.classList.add("loading");
  else if(state==="offline")el.classList.add("offline");
  txt.textContent=text;
}
// Detect online/offline
window.addEventListener("online",()=>{if(currentUser)setSyncStatus("online","Online");});
window.addEventListener("offline",()=>setSyncStatus("offline","Offline"));

