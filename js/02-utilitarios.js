// ─── DATE RANGE / DEADLINE HELPERS ────────────────────────────────────
function inRange(taskDate){
  if(fRange==="all")return true;
  if(fRange==="custom")return taskDate===fDate;
  if(fRange==="today")return taskDate===todayISO();
  const t=new Date(todayISO()),d=new Date(taskDate);
  const diff=Math.round((d-t)/(24*3600*1000));
  if(fRange==="next7")return diff>=0&&diff<=6;
  if(fRange==="last7")return diff>=-6&&diff<=0;
  if(fRange==="last30")return diff>=-29&&diff<=0;
  return true;
}
function daysUntil(dateISO){
  const t=new Date(todayISO()),d=new Date(dateISO);
  return Math.round((d-t)/(24*3600*1000));
}
function isOverdue(t){return t.status!=="done"&&daysUntil(t.date)<0;}
function deadlineInfo(t){
  const d=daysUntil(t.date);
  if(t.status==="done")return{label:"Concluída",color:"#94a3b8",bg:"#f1f5f9",overdue:false};
  if(d<0)return{label:`Atrasada ${Math.abs(d)}d`,color:"#dc2626",bg:"#fee2e2",overdue:true};
  if(d===0)return{label:"Hoje",color:"#ea580c",bg:"#ffedd5",overdue:false};
  if(d===1)return{label:"Amanhã",color:"#d97706",bg:"#fef3c7",overdue:false};
  if(d<=3)return{label:`Em ${d}d`,color:"#d97706",bg:"#fef3c7",overdue:false};
  return{label:`Em ${d}d`,color:"#64748b",bg:"#f1f5f9",overdue:false};
}
function rangeLabel(){
  return{today:"Hoje",next7:"Próximos 7 dias",last7:"Últimos 7 dias",last30:"Últimos 30 dias",all:"Todas as datas",custom:`Data: ${fDate}`}[fRange];
}

// ─── HELPERS ──────────────────────────────────────────────────────────
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
// Ad helpers: detect "anúncio" tasks and extract a quantity from the title
const ADS_RE=/(anúncio|anuncio|an[uú]ncios)/i;
function isAdTask(t){return ADS_RE.test(t.title||"");}
function extractAdQty(title){
  // Find a number near the word "anúncio(s)" — e.g. "Subir 5 anúncios", "20 anuncios"
  const s=String(title||"");
  const m=s.match(/(\d+)\s*an[uú]ncio/i)||s.match(/an[uú]ncios?\s*(\d+)/i)||s.match(/\b(\d+)\b/);
  return m?Math.max(0,parseInt(m[1],10)||0):0;
}
// Quantity of ads a task represents: explicit qty field wins, else read from title, else 1 if it's an ad task
function adQtyOf(t){
  if(t&&typeof t.qty==="number"&&t.qty>0)return t.qty;
  if(t&&t.qty!=null&&t.qty!==""){const n=parseInt(t.qty,10);if(n>0)return n;}
  const fromTitle=extractAdQty(t.title);
  return fromTitle>0?fromTitle:1;
}
// Selo da tarefa que nasceu de um alerta.
//
// Precisa se distinguir da tarefa digitada por duas razões práticas: ela se
// fecha sozinha quando o problema sai do ar (então "concluir" à mão não é o
// que prova o trabalho), e reabrir não é castigo de ninguém — é a Shopee
// ainda mostrando a pendência depois da conclusão.
function autoBadgeHTML(t){
  if(!t||!t.auto)return "";
  const n=Number(t.reaberturas||0);
  const selo=`<span class="badge" title="Criada automaticamente a partir do alerta da loja. Fecha sozinha quando o problema sair do ar." style="background:#e0e7ff;color:#4338ca">⚡ Automática</span>`;
  const rea=n>0
    ?`<span class="badge" title="Foi marcada como concluída ${n===1?"uma vez":n+" vezes"}, mas a Shopee continuou mostrando a pendência depois disso." style="background:#fee2e2;color:#b91c1c">↻ reaberta ${n}×</span>`
    :"";
  return selo+rea;
}
function getEmp(id){return emps.find(e=>e.id===id)||null;}
// Responsável de uma loja, já resolvido. Devolve null quando a loja não tem
// dono OU quando o funcionário que era dono foi removido da equipe — os dois
// casos exigem a mesma ação de quem vê a tela: escolher alguém.
function respDaLoja(c){
  if(!c||!c.respId)return null;
  return getEmp(c.respId);
}
// A lista de ferramentas (vinda da Shopee) enriquecida com o que só o CADASTRO
// sabe: quantos cupons aquela loja deve manter. As regras de prazos.js não
// leem `clients` de propósito — elas recebem tudo pronto, e é o que permite
// testá-las sem banco. O backend monta a mesma lista do lado dele.
function toolsComMinimo(){
  return (Array.isArray(tools)?tools:[]).map(t=>{
    const c=getCli(t.cliente);
    const perfil=(c&&c.perfilCupons)||"padrao";
    return {...t, minCupons:window.prazos?window.prazos.minCuponsDoPerfil(perfil):4};
  });
}
function getCli(id){return clis.find(c=>c.id===id)||null;}
// View helper for tasks: returns a pseudo-store for tasks marked "Todas as lojas" (cli==="all")
function getCliV(t){
  if(t&&t.cli==="all")return{id:"all",name:"🏪 Todas as lojas",mkt:"",custId:null,_all:true};
  return getCli(t&&t.cli);
}
function getCust(id){return custs.find(c=>c.id===id)||null;}
function storesOfCust(custId){return clis.filter(c=>c.custId===custId);}
// Em quais marketplaces o cliente opera.
//
// Campo próprio, porque nem todo marketplace onde ele quer entrar já tem loja
// cadastrada aqui — e é essa lista que decide o que ele enxerga na área dele
// e qual especialista enxerga ele.
//
// Vazio NÃO é "nenhum": é "ninguém preencheu ainda". Nesse caso deduz das
// lojas que já existem, que é o que sabíamos antes do campo existir. Assim
// nada quebra nos 48 proprietários já cadastrados enquanto a lista não for
// preenchida à mão, e não foi preciso migração.
function mktsDoCliente(cust){
  if(!cust)return[];
  const lista=Array.isArray(cust.marketplaces)?cust.marketplaces.filter(Boolean):[];
  if(lista.length)return lista;
  const daslojas=storesOfCust(cust.id).map(s=>s.mkt).filter(Boolean);
  return [...new Set(daslojas)];
}
// Carimba a data de conclusão (doneDate) num patch, conforme a mudança de status.
// - Vira "done": marca a data de HOJE (ou preserva a data original se já estava concluída).
// - Sai de "done" (reaberta): limpa a data.
// Sempre define patch.doneDate para funcionar tanto em updateDoc quanto em setDoc (merge:false).
function setDoneDate(prev,newStatus,patch){
  patch=patch||{};
  if(newStatus==="done"){
    patch.doneDate=(prev&&prev.status==="done"&&prev.doneDate)?prev.doneDate:todayISO();
    // Carimbo com HORA, além do dia. O dia basta para o relatório, mas não
    // para decidir se a Shopee foi consultada antes ou depois de alguém
    // marcar concluído — e é essa comparação que separa "resolveu" de
    // "marcou concluído e o problema continua". Sem a hora, o gerador de
    // tarefas precisa esperar o dia virar para poder acusar.
    patch.doneEm=(prev&&prev.status==="done"&&prev.doneEm)?prev.doneEm:new Date().toISOString();
  }else{
    patch.doneDate=null;
    patch.doneEm=null;
  }
  return patch;
}
// Data de referência da tarefa no relatório: se concluída, usa o dia da conclusão;
// senão, usa o prazo. Assim um anúncio finalizado hoje conta em "hoje", mesmo com prazo diferente.
function repRefDate(t){
  return (t.status==="done"&&t.doneDate)?t.doneDate:t.date;
}
// ERP provider of a store, via its owner customer's saved login.erp.provider
function erpOfStore(c){
  if(!c||!c.custId)return "";
  const cu=getCust(c.custId);
  return (cu&&cu.login&&cu.login.erp&&cu.login.erp.provider)||"";
}
// A tarja do proprietário na linha da loja é CLICÁVEL para o admin: abre o
// acesso do cliente ao sistema.
//
// Ela morava só dentro de "Gerenciar clientes", e na prática ninguém achava —
// quem procura o acesso de um cliente está olhando a linha da loja dele, e a
// primeira coisa que a mão acha ali é o 🔑, que é outra coisa (a senha DO
// MARKETPLACE). O controle passa a ficar onde o olho já está.
function ownerBadgeHTML(cli,size){
  const cu=cli&&cli.custId?getCust(cli.custId):null;
  if(!cu)return`<div class="owner-badge empty">👤 sem cliente</div>`;
  if(!isAdmin())return`<div class="owner-badge">👤 ${esc(cu.name)}</div>`;
  return`<div class="owner-badge" data-syscust="${esc(cu.id)}" title="Acesso de ${esc(cu.name)} ao sistema" style="cursor:pointer">👤 ${esc(cu.name)} <span style="opacity:.5">›</span></div>`;
}
function avHTML(e,sz){
  if(!e)return"";
  return`<div class="avatar" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*.36)}px;background:${e.color}22;color:${e.color};border:1.5px solid ${e.color}55">${e.ini}</div>`;
}
function bdg(cls,lbl){return`<span class="badge ${cls}">${lbl}</span>`;}
function priB(p){return`<span class="badge" style="background:${PBGCOL[p]};color:${PCOL[p]}">${PLBL[p]}</span>`;}
function stB(s){return`<span class="badge" style="background:${SBGCOL[s]};color:${SCOL[s]}">${SLBL[s]}</span>`;}
function maxOf(arr){return Math.max(1,...arr);}
function pct(a,b){return b>0?Math.round(a/b*100):0;}

/* ===== Dias úteis (seg–sex) + feriados nacionais — base de todas as métricas /dia ===== */
const _feriadoCache={};
function _easter(y){ // Meeus/Jones/Butcher
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return new Date(y,mo-1,da);
}
function _ferKey(dt){return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");}
function _brHolidays(year){
  if(_feriadoCache[year])return _feriadoCache[year];
  const set=new Set(),add=dt=>set.add(_ferKey(dt));
  // Fixos nacionais: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11 (Consciência Negra), 25/12
  [[0,1],[3,21],[4,1],[8,7],[9,12],[10,2],[10,15],[10,20],[11,25]].forEach(([m,d])=>add(new Date(year,m,d)));
  // Móveis (baseados na Páscoa): Carnaval seg+ter, Sexta-feira Santa, Corpus Christi
  const pa=_easter(year),mv=off=>{const dt=new Date(pa);dt.setDate(dt.getDate()+off);return dt;};
  [-48,-47,-2,60].forEach(o=>add(mv(o)));
  _feriadoCache[year]=set;return set;
}
function _isFeriado(d){const dt=new Date(d);return _brHolidays(dt.getFullYear()).has(_ferKey(dt));}
// Conta dias úteis no intervalo (inclusivo), pulando fim de semana E feriados nacionais.
function bizDays(from,to){let dias=0,feriados=0;const d=new Date(from);d.setHours(0,0,0,0);const end=new Date(to);end.setHours(0,0,0,0);while(d<=end){const w=d.getDay();if(w>=1&&w<=5){if(_isFeriado(d))feriados++;else dias++;}d.setDate(d.getDate()+1);}return{dias:Math.max(1,dias),feriados};}

function bar(value,max,color,height){
  const h=Math.round(value/max*height);
  return`<div class="chart-bar" style="background:${color};height:${h||2}px"></div>`;
}

// ─── TASK TEMPLATES ───────────────────────────────────────────────────
const TPL=[
  {title:"Subir novos anúncios",desc:"",pri:"alta"},
  {title:"Atualizar fotos dos produtos",desc:"",pri:"media"},
  {title:"Otimizar títulos e SEO",desc:"",pri:"media"},
  {title:"Atualizar preços",desc:"",pri:"media"},
  {title:"Verificar estoque / esgotados",desc:"",pri:"alta"},
  {title:"Alterar variações (cor/tamanho)",desc:"",pri:"media"},
  {title:"Configurar Shopee Ads",desc:"",pri:"media"},
  {title:"Análise de concorrência",desc:"",pri:"baixa"},
];

// ─── RANGE BAR ────────────────────────────────────────────────────────
function rangeBarHTML(){
  const opts=[["today","Hoje"],["next7","Próximos 7d"],["last7","Últimos 7d"],["last30","Últimos 30d"],["all","Tudo"]];
  return`<div class="range-bar">
    <span style="font-size:11px;color:#64748b;margin-right:4px;font-weight:600">📅 PERÍODO</span>
    ${opts.map(([k,l])=>`<button class="range-pill${fRange===k?" active":""}" data-range="${k}">${l}</button>`).join("")}
    <div class="range-sep"></div>
    <input type="date" class="range-date" id="range-date" value="${fDate}" title="Data específica"/>
    <button class="range-pill${fRange==="custom"?" active":""}" data-range="custom" id="range-custom-btn">Esta data</button>
  </div>`;
}

