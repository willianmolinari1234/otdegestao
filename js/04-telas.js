// ─── NAVIGATION ───────────────────────────────────────────────────────
// (Nav and new-task handlers are now bound in boot())

// ═══════════════════════ MÓDULO DIAGNÓSTICO (admin) ═══════════════════════
const DIAG_LABELS=[["Crítico",0],["Ruim",25],["Regular",50],["Bom",75],["Ótimo",100]];
const DIAG_DIMS=[
  {n:"Saúde da conta",w:.30,crit:[
    ["Status / pontos de penalidade","Ótimo = sem pontos nem restrição · Regular = poucos pontos · Crítico = conta penalizada ou suspensa"],
    ["Taxa de cancelamento","Ótimo = muito baixa · Regular = aceitável · Crítico = alta, puxando o ranking pra baixo"],
    ["Atraso no envio / despacho","Ótimo = sempre no prazo · Regular = atrasos pontuais · Crítico = atrasos frequentes"],
    ["Avaliação média da loja","Ótimo = ~4,9+ · Regular = ~4,7 · Crítico = abaixo de 4,5 ou muitas avaliações ruins"],
    ["Anúncios bloqueados / violações","Ótimo = nenhum · Regular = poucos resolvíveis · Crítico = vários bloqueios ou infrações graves"],
  ]},
  {n:"Anúncios",w:.30,crit:[
    ["Cobertura: nº de anúncios ativos","Ótimo = catálogo amplo e completo · Regular = parcial · Crítico = pouquíssimos anúncios",[["Anúncios ativos",""],["Anúncios para otimizar",""]]],
    ["% de anúncios com estoque","Ótimo = quase tudo com estoque · Regular = parte sem · Crítico = muitos zerados/ocultos"],
    ["Qualidade de título / SEO","Ótimo = títulos otimizados com palavras-chave · Regular = razoável · Crítico = títulos fracos"],
    ["Qualidade das imagens","Ótimo = 6+ fotos, principal limpa, boa resolução · Regular = ok · Crítico = poucas/ruins"],
    ["Ficha técnica / atributos","Ótimo = completos · Regular = parciais · Crítico = vazios (perde busca e filtros)"],
    ["Uso de variações (cor/tamanho/kit)","Ótimo = bem estruturadas · Regular = poucas · Crítico = não usa quando deveria"],
  ]},
  {n:"Visibilidade e Marketing",w:.20,crit:[
    ["Uso de Shopee Ads","Ótimo = campanhas ativas e bem geridas · Regular = uso básico · Crítico = não usa"],
    ["ROAS dos últimos 30 dias","Ótimo = ROAS alto/lucrativo · Regular = no limite · Crítico = queima verba ou sem controle","x"],
    ["Cupons da loja","Ótimo = estratégia ativa de cupons · Regular = pontual · Crítico = nenhum"],
    ["Ofertas relâmpago","Ótimo = participa com frequência · Regular = às vezes · Crítico = não participa"],
    ["Combos / leve mais por menos","Ótimo = bem usados p/ subir ticket · Regular = poucos · Crítico = nenhum"],
    ["Programa de Frete Grátis Shopee","Ótimo = aderido e otimizado · Regular = parcial · Crítico = fora do programa"],
  ]},
  {n:"Atendimento",w:.10,crit:[
    {name:"Taxa de resposta no chat",hint:"Regra Shopee: ≥ 60% = Bom · < 60% = Ruim — a nota sai automaticamente do valor informado.",unit:"%",auto:{threshold:60,good:3,bad:1}},
    ["Respostas às avaliações dos clientes","Ótimo = responde sempre, inclusive as negativas · Regular = às vezes · Crítico = nunca responde"],
  ]},
  {n:"Vendas (baseline)",w:.10,crit:[
    ["Tendência de faturamento (30/90d)","Ótimo = crescendo · Regular = estável · Crítico = caindo"],
    ["Ticket médio","Ótimo = saudável p/ categoria · Regular = mediano · Crítico = muito baixo"],
    ["Taxa de conversão","Ótimo = boa p/ categoria · Regular = mediana · Crítico = baixa","%"],
    {cond:1,Fabricante:["Concentração de vendas em poucos SKUs","Ótimo = receita bem distribuída · Crítico = dependente de 1–2 produtos"],
      Revendedor:["Competitividade de preço vs. concorrência","Ótimo = competitivo e lucrativo · Crítico = fora de preço ou margem espremida"]},
  ]},
];
let diagTipo="Fabricante";
const diagScores={},diagValues={},diagActions={},diagInfo={};
function diagFieldsOf(u){ if(u===undefined||u===null)return[]; if(typeof u==="string")return[{label:"Valor real",unit:u}]; return u.map(x=>Array.isArray(x)?{label:x[0],unit:x[1]||""}:x); }
function diagMeta(c){ if(c.cond)return{name:c[diagTipo][0],hint:c[diagTipo][1],fields:[],cond:true,auto:null}; if(c.name)return{name:c.name,hint:c.hint,fields:diagFieldsOf(c.unit),cond:false,auto:c.auto||null}; return{name:c[0],hint:c[1],fields:diagFieldsOf(c[2]),cond:false,auto:null}; }
function diagFieldVals(di,ci,m){ const p=[]; m.fields.forEach((f,fi)=>{const vk=di+"-"+ci+"-"+fi;if(diagValues[vk]!==undefined&&diagValues[vk]!=="")p.push((f.label==="Valor real"?"atual":f.label)+" "+diagValues[vk]+f.unit);}); return p.length?" · "+p.join(" · "):""; }
function diagPct(i){return DIAG_LABELS[i][1];}
function diagHex(s){return s>=80?"#1F9D57":s>=60?"#2F74E0":s>=40?"#D69304":"#E03B3B";}
function diagBg(s){return s>=80?"#E2F5EA":s>=60?"#E6EEFB":s>=40?"#FBF2D6":"#FCE7E7";}
function diagName(s){return s>=80?"Excelente":s>=60?"Bom":s>=40?"Atenção":"Crítico";}
function diagDimPct(di){ const v=DIAG_DIMS[di].crit.map((_,ci)=>diagScores[di+"-"+ci]).filter(x=>typeof x==="number").map(diagPct); if(!v.length)return null; return v.reduce((a,b)=>a+b,0)/v.length; }
const DIAG_CART='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';
function diagScaleHTML(key,m){ const val=diagScores[key];
  if(m.auto){ return DIAG_LABELS.map((L,v)=>`<button type="button" class="d-sc d-locked${val===v?' sel':''}" data-v="${v}">${L[0]}</button>`).join(""); }
  return DIAG_LABELS.map((L,v)=>`<button type="button" data-v="${v}" class="d-sc${val===v?' sel':''}" onclick="diagSetScore('${key}',${v})">${L[0]}</button>`).join("")
    +`<button type="button" class="d-sc d-na${val==='na'?' sel':''}" onclick="diagSetScore('${key}','na')">N/A</button>`; }
function diagAuto(key){ const a=key.split("-").map(Number),di=a[0],ci=a[1]; const m=diagMeta(DIAG_DIMS[di].crit[ci]); const raw=diagValues[key+"-0"];
  if(raw===undefined||raw===""||isNaN(parseFloat(raw)))diagScores[key]=undefined; else diagScores[key]=parseFloat(raw)>=m.auto.threshold?m.auto.good:m.auto.bad;
  const sc=document.getElementById("diag-sc-"+key); if(sc)sc.innerHTML=diagScaleHTML(key,m); diagRecompute(); }
function diagPickCli(id){ const c=clis.find(x=>x.id===id); diagInfo.cliId=id;
  if(c){const own=c.custId&&getCust(c.custId)?getCust(c.custId).name:"";diagInfo.cliente=own||c.name;diagInfo.loja=c.name;}
  else{diagInfo.cliente="";diagInfo.loja="";}
  const lj=document.getElementById("diag-loja"); if(lj)lj.value=diagInfo.loja||""; }
function rDiagnostico(){
  const inf=(k,ph,t)=>`<div><label>${ph}</label><input id="diag-${k}" type="${t||'text'}" value="${(diagInfo[k]||'').replace(/"/g,'&quot;')}" placeholder="${ph}" oninput="diagInfo['${k}']=this.value"></div>`;
  const cliSel=()=>{const o=clis.slice().sort((a,b)=>{const an=(a.custId&&getCust(a.custId)?getCust(a.custId).name:a.name)||"",bn=(b.custId&&getCust(b.custId)?getCust(b.custId).name:b.name)||"";return an.localeCompare(bn);}).map(c=>{const own=c.custId&&getCust(c.custId)?getCust(c.custId).name:"";const lbl=own&&own!==c.name?own+" · "+c.name:c.name;return `<option value="${c.id}"${diagInfo.cliId===c.id?' selected':''}>${esc(lbl)}</option>`;}).join("");return `<div><label>Cliente</label><select id="diag-clisel" onchange="diagPickCli(this.value)"><option value="">${clis.length?'— Selecionar cliente —':'Nenhum cliente cadastrado'}</option>${o}</select></div>`;};
  return `<div id="diagwrap"><div class="d-head">
    <span class="d-eyebrow">● Diagnóstico inicial</span>
    <div class="d-title">Raio-X da conta em <span class="hl">poucos minutos</span></div>
    <div class="d-sub">Avalie cada item de Crítico a Ótimo e registre os números reais. A nota de saúde (0–100) se monta sozinha.</div>
    <div class="d-meta">${cliSel()}${inf('loja','Loja na Shopee')}${inf('cat','Categoria')}${inf('resp','Responsável')}${inf('data','Data','date')}</div>
    <div class="d-typewrap"><span class="d-tl">Tipo de cliente</span>
      <div class="d-seg" id="diag-seg">
        <button type="button" data-t="Fabricante" class="${diagTipo==='Fabricante'?'on':''}" onclick="diagSetTipo('Fabricante')">Fabricante</button>
        <button type="button" data-t="Revendedor" class="${diagTipo==='Revendedor'?'on':''}" onclick="diagSetTipo('Revendedor')">Revendedor</button>
      </div><span class="d-hp">o item marcado <b>muda</b> conforme o tipo</span>
    </div></div>
    <div class="d-grid">
      <div id="diag-dims"></div>
      <div class="d-panel">
        <div class="d-gauge-card"><div class="d-gt">Nota de saúde da conta</div>
          <div class="d-gauge"><svg width="184" height="184">
            <defs><linearGradient id="diag-og" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7941E"/><stop offset="1" stop-color="#EE4D2D"/></linearGradient></defs>
            <circle cx="92" cy="92" r="80" stroke="rgba(255,255,255,.13)" stroke-width="14" fill="none"/>
            <circle id="diag-arc" cx="92" cy="92" r="80" stroke="url(#diag-og)" stroke-width="14" fill="none" stroke-linecap="round" stroke-dasharray="503" stroke-dashoffset="503"/>
          </svg><div class="d-gnum"><b id="diag-score">0</b><span>DE 100</span></div></div>
          <div class="d-chip" id="diag-chip">Preencha os itens</div>
          <div class="d-prog" id="diag-prog">0 de 0 critérios avaliados</div>
          <div class="d-bars" id="diag-bars"></div>
          <div class="d-acts"><button type="button" class="d-btn d-btn-s" onclick="diagCopy(this)">Copiar resumo</button>
            <button type="button" class="d-btn d-btn-p" onclick="diagBuildReport()">Gerar PDF</button></div>
          <button type="button" class="d-reset" onclick="diagReset()">Limpar diagnóstico</button>
        </div>
        
      </div>
    </div></div>`;
}
function diagRender(){
  const root=document.getElementById("diag-dims"); if(!root)return;
  root.innerHTML=DIAG_DIMS.map((d,di)=>{
    const crits=d.crit.map((c,ci)=>{
      const m=diagMeta(c),key=di+"-"+ci;
      const scale=`<div class="d-scale" id="diag-sc-${key}">${diagScaleHTML(key,m)}</div>`;
      const vals=m.fields.map((f,fi)=>{const vk=key+"-"+fi;const oi=m.auto?`diagValues['${vk}']=this.value;diagAuto('${key}')`:`diagValues['${vk}']=this.value;diagBuildPlan()`;return `<div class="d-valrow"><span class="d-vl">${f.label}</span><span class="d-valbox"><input type="number" step="any" value="${diagValues[vk]||''}" placeholder="—" oninput="${oi}"><b>${f.unit||''}</b></span></div>`;}).join("");
      const body=m.auto?(vals+scale):(scale+vals);
      return `<div class="d-crit"><div class="d-cn">${m.name}${m.cond?'<span class="d-cond">muda c/ tipo</span>':''}${m.auto?'<span class="d-cond" style="background:var(--d-navy)">automático</span>':''}</div><div class="d-ch">${m.hint}</div>${body}</div>`;
    }).join("");
    return `<section class="d-dim"><div class="d-dh" onclick="this.parentNode.classList.toggle('closed')"><span class="d-num">${di+1}</span><h3>${d.n}</h3><span class="d-w">peso ${Math.round(d.w*100)}%</span><span class="d-ds" id="diag-ds-${di}">—</span><span class="d-chev">▾</span></div><div class="d-cl">${crits}</div></section>`;
  }).join("");
  diagRecompute();
}
function diagSetScore(key,v){ diagScores[key]=(diagScores[key]===v?undefined:v); diagRender(); }
function diagSetTipo(t){ diagTipo=t; diagRender(); document.querySelectorAll("#diag-seg button").forEach(b=>b.classList.toggle("on",b.dataset.t===t)); }
function diagRecompute(){
  let ws=0,acc=0,ans=0,tot=0;const bars=[];
  DIAG_DIMS.forEach((d,di)=>{ d.crit.forEach((_,ci)=>{tot++;if(typeof diagScores[di+"-"+ci]==="number")ans++;});
    const p=diagDimPct(di); const el=document.getElementById("diag-ds-"+di); if(el)el.textContent=p===null?"—":Math.round(p);
    if(p!==null){ws+=d.w;acc+=d.w*p;} bars.push({n:d.n,pct:p===null?0:p,has:p!==null}); });
  const score=ws>0?Math.round(acc/ws):0;
  const se=document.getElementById("diag-score"); if(se)se.textContent=score;
  const arc=document.getElementById("diag-arc"),C=503; if(arc)arc.style.strokeDashoffset=C-C*score/100;
  const chip=document.getElementById("diag-chip");
  if(chip){ if(ans===0){chip.textContent="Preencha os itens";chip.style.background="rgba(255,255,255,.1)";chip.style.color="#fff";}
    else{chip.textContent=diagName(score);chip.style.background=diagBg(score);chip.style.color=diagHex(score);} }
  const pr=document.getElementById("diag-prog"); if(pr)pr.textContent=ans+" de "+tot+" critérios avaliados";
  const bb=document.getElementById("diag-bars"); if(bb)bb.innerHTML=bars.map(b=>`<div class="d-br"><div class="l"><span>${b.n}</span><span>${b.has?Math.round(b.pct):'—'}</span></div><div class="d-track"><div class="d-fill" style="width:${b.pct}%;background:${b.has?diagHex(b.pct):'rgba(255,255,255,.2)'}"></div></div></div>`).join("");
  diagBuildPlan();
}
function diagWeak(){ const w=[]; DIAG_DIMS.forEach((d,di)=>d.crit.forEach((c,ci)=>{const v=diagScores[di+"-"+ci];if(v===0||v===1){const m=diagMeta(c);w.push({key:di+"-"+ci,dim:d.n,name:m.name,v,vtxt:diagFieldVals(di,ci,m)});}})); return w.sort((a,b)=>a.v-b.v); }
function diagBuildPlan(){
  const weak=diagWeak(),pl=document.getElementById("diag-plan"); if(!pl)return;
  if(!weak.length){pl.innerHTML='<div class="d-empty">Nenhum ponto crítico ainda.<br>Itens avaliados como <b>Crítico</b> ou <b>Ruim</b> aparecem aqui.</div>';return;}
  pl.innerHTML=weak.map(w=>{const pri=w.v===0?"alta":"media",pl2=w.v===0?"Alta":"Média";
    return `<div class="d-task"><div class="d-tt"><span class="d-pri ${pri}">${pl2}</span><div class="d-tx">${w.name}<small>${w.dim} · ${DIAG_LABELS[w.v][0]}${w.vtxt}</small></div></div><input class="d-act" placeholder="Ação recomendada (uso interno · não vai pro relatório do cliente)..." value="${(diagActions[w.key]||'').replace(/"/g,'&quot;')}" oninput="diagActions['${w.key}']=this.value"></div>`;}).join("");
}
// Explicação de cada problema em linguagem de lojista: o que é e o que
// custa deixar como está. Só o diagnóstico — o plano de ação é da OTDE.
const DIAG_EXPLICA={
  "Status / pontos de penalidade":"Pontos de penalidade são advertências da Shopee por descumprir regras. Eles reduzem a entrega dos seus anúncios, podem bloquear participação em campanhas e, acumulados, chegam a suspender a loja.",
  "Taxa de cancelamento":"Mede quantos pedidos são cancelados por falta de estoque ou atraso seu. A Shopee interpreta como má experiência e passa a mostrar menos seus produtos — além de gerar pontos de penalidade.",
  "Atraso no envio / despacho":"É o tempo entre a venda e a postagem. Atrasar derruba o selo de bom vendedor, reduz a exposição nas buscas e aumenta cancelamentos e avaliações negativas.",
  "Avaliação média da loja":"É a nota que o comprador vê antes de decidir. Abaixo de 4,7 a conversão cai de forma perceptível: o cliente compara, desconfia e escolhe o concorrente melhor avaliado.",
  "Anúncios bloqueados / violações":"Anúncios fora das regras da Shopee são derrubados. Cada bloqueio tira um produto do ar, desperdiça o histórico de vendas dele e pesa na reputação da conta.",
  "Cobertura: nº de anúncios ativos":"Quanto mais produtos publicados, mais buscas sua loja alcança. Catálogo pequeno limita o teto de vendas — você só pode vender aquilo que está exposto.",
  "% de anúncios com estoque":"Anúncio sem estoque deixa de ser exibido e perde o posicionamento conquistado. Ao repor, o produto recomeça praticamente do zero na disputa por relevância.",
  "Qualidade de título / SEO":"O título é o que faz o produto aparecer na busca. Sem os termos que o comprador realmente digita, o anúncio simplesmente não é encontrado — por melhor que seja o preço.",
  "Qualidade das imagens":"A imagem decide o clique. Fotos escuras, cortadas ou sem padrão reduzem a taxa de clique, e menos cliques significam menos exibição pela Shopee.",
  "Ficha técnica / atributos":"São os campos de marca, material, tamanho e afins. A Shopee usa esses dados para encaixar seu produto nos filtros de busca; sem eles, você fica fora de boa parte das pesquisas.",
  "Uso de variações (cor/tamanho/kit)":"Reunir opções em um só anúncio concentra vendas e avaliações, o que impulsiona o posicionamento. Anúncios separados dividem essa força.",
  "Uso de Shopee Ads":"O anúncio pago garante presença nas primeiras posições enquanto o orgânico amadurece. Sem ele, a loja depende só do alcance natural e cresce mais devagar.",
  "ROAS dos últimos 30 dias":"Mostra quanto retorna para cada real investido em anúncios. ROAS baixo indica verba escoando em campanha, palavra-chave ou produto que não converte.",
  "Cupons da loja":"Cupom aumenta a conversão e ainda destaca o produto com um selo na vitrine. Sem cupom ativo, a loja perde esse empurrão na hora da decisão.",
  "Ofertas relâmpago":"Dão um pico de exposição em vitrines especiais por tempo limitado. É um dos poucos espaços gratuitos de grande visibilidade — deixar vago é abrir mão de tráfego.",
  "Combos / leve mais por menos":"Incentivam o cliente a levar mais itens no mesmo pedido, elevando o ticket médio sem custo de aquisição adicional.",
  "Programa de Frete Grátis Shopee":"O selo de frete grátis é um dos maiores filtros de decisão do comprador. Fora do programa, seu produto perde para concorrentes equivalentes que o exibem.",
  "Respostas às avaliações dos clientes":"Responder mostra pós-venda ativo para quem está decidindo. Avaliação negativa sem resposta pesa muito mais na percepção do próximo comprador.",
  "Tendência de faturamento (30/90d)":"Compara o desempenho recente com o período anterior. Tendência de queda sustentada indica perda de posicionamento ou avanço da concorrência.",
  "Ticket médio":"É o valor médio por pedido. Ticket baixo faz o frete e as taxas pesarem proporcionalmente mais, apertando a margem de cada venda.",
  "Taxa de conversão":"De cada 100 visitantes, quantos compram. Conversão baixa com boa visita significa que o problema está na página: preço, fotos, avaliações ou informação faltando.",
  "Concentração de vendas em poucos SKUs":"Quando poucos produtos respondem por quase todo o faturamento, a loja fica frágil: basta um deles perder posição ou estoque para a receita cair junto.",
  "Competitividade de preço vs. concorrência":"A Shopee é um ambiente de comparação direta. Preço fora da faixa praticada derruba a conversão mesmo com anúncio bem feito e boa reputação.",
};

function diagBuildReport(){
  const sv=id=>{const e=document.getElementById("diag-"+id);return e&&e.value?e.value:"—";};
  let ws=0,acc=0;DIAG_DIMS.forEach((d,di)=>{const p=diagDimPct(di);if(p!==null){ws+=d.w;acc+=d.w*p;}});
  const score=ws>0?Math.round(acc/ws):0;
  const dimsH=DIAG_DIMS.map((d,di)=>{const p=diagDimPct(di);return `<div class="r-bar"><div class="l"><span>${d.n} · ${Math.round(d.w*100)}%</span><span>${p===null?'—':Math.round(p)}</span></div><div class="r-track"><div class="r-fill" style="width:${p===null?0:p}%;background:${p===null?'#D5D8DF':diagHex(p)}"></div></div></div>`;}).join("");

  // Lista de problemas do RELATÓRIO DO CLIENTE: sem o campo "Ação".
  // O plano de ação é conduzido pela OTDE internamente — na tela de trabalho
  // (diagBuildPlan) as ações continuam aparecendo normalmente.
  const weak=diagWeak();
  const criticos=weak.filter(w=>w.v===0).length;
  const plRelatorio=weak.length
    ? weak.map((w,idx)=>{
        const pri=w.v===0?"alta":"media";
        const sit=w.v===0?"Crítico":"Precisa de atenção";
        const exp=DIAG_EXPLICA[w.name]||"";
        const medido=(w.vtxt||"").replace(/^ · /,"");
        return `<div class="rp-item ${pri}">
          <div class="rp-top">
            <span class="rp-num">${idx+1}</span>
            <div class="rp-ti">
              <div class="rp-nome">${esc(w.name)}</div>
              <div class="rp-dim">${esc(w.dim)}</div>
            </div>
            <span class="rp-sit ${pri}">${sit}</span>
          </div>
          ${exp?`<div class="rp-exp">${esc(exp)}</div>`:""}
          ${medido?`<div class="rp-med"><b>Situação hoje:</b> ${esc(medido)}</div>`:""}
        </div>`;
      }).join("")
    : '<div class="r-ok">Nenhum ponto crítico identificado neste diagnóstico. A conta está saudável — o foco passa a ser otimização e escala.</div>';

  // Resumo executivo: contextualiza a nota antes de listar os problemas.
  const resumoH=weak.length?`<div class="rp-resumo">
      <b>Resumo:</b> a conta apresenta <b>${weak.length}</b> ${weak.length===1?"ponto que precisa":"pontos que precisam"} de correção,
      ${criticos>0?`sendo <b>${criticos}</b> em situação crítica`:"nenhum em situação crítica"}.
      Cada item abaixo explica o que foi identificado e o impacto que ele tem nas vendas.
      A correção desses pontos é o trabalho conduzido pela OTDE.
    </div>`:"";
  const kp=[];DIAG_DIMS.forEach((d,di)=>d.crit.forEach((c,ci)=>{const m=diagMeta(c);m.fields.forEach((f,fi)=>{const vk=di+"-"+ci+"-"+fi;if(diagValues[vk]!==undefined&&diagValues[vk]!==""){const lb=f.label==="Valor real"?m.name:f.label;kp.push(`<div class="r-kpi"><span>${lb}</span><b>${diagValues[vk]}${f.unit}</b></div>`);}});}));
  const kpH=kp.length?`<div class="r-kpis">${kp.join("")}</div>`:"";
  
  document.getElementById("diag-report").innerHTML=`
    <div class="r-band"><span class="r-logo">${DIAG_CART}</span><div style="flex:1">
      <div class="rb">OTDE · O Tal de Ecommerce — Gestão de Contas Shopee</div>
      <h1>${sv('loja')!=='—'?sv('loja'):'Diagnóstico da conta'}</h1>
      <div class="r-mg"><div><span>Cliente:</span> <b>${diagInfo.cliente||'—'}</b></div><div><span>Tipo:</span> <b>${diagTipo}</b></div><div><span>Categoria:</span> <b>${sv('cat')}</b></div><div><span>Data:</span> <b>${sv('data')}</b></div><div><span>Responsável:</span> <b>${sv('resp')}</b></div></div>
    </div></div>
    <div class="r-score"><div><div class="r-big" style="color:${diagHex(score)}">${score}<small>NOTA DE SAÚDE / 100</small></div><span class="r-chip" style="background:${diagBg(score)};color:${diagHex(score)}">${diagName(score)}</span></div><div class="r-dims">${dimsH}</div></div>
    ${kpH}
    <div class="rd-sec">${weak.length?`O que precisa ser corrigido · ${weak.length} ${weak.length===1?"ponto":"pontos"}`:"O que precisa ser corrigido"}</div>
    ${resumoH}
    <div class="rd-plan">${plRelatorio}</div>
    <div class="r-foot"><span>Relatório gerado por <b>OTDE · O Tal de Ecommerce</b></span><span>${sv('data')}</span></div>`;
  window.print();
}
function diagCopy(btn){
  const sv=id=>{const e=document.getElementById("diag-"+id);return e&&e.value?e.value:"—";};
  let ws=0,acc=0;DIAG_DIMS.forEach((d,di)=>{const p=diagDimPct(di);if(p!==null){ws+=d.w;acc+=d.w*p;}});
  const score=ws>0?Math.round(acc/ws):0;
  let t="DIAGNÓSTICO DE CONTA — SHOPEE (OTDE)\n";
  t+="Cliente: "+(diagInfo.cliente||"—")+" | Loja: "+sv('loja')+" | Tipo: "+diagTipo+"\n";
  t+="Categoria: "+sv('cat')+" | Responsável: "+sv('resp')+" | Data: "+sv('data')+"\n\n";
  t+="NOTA GERAL: "+score+"/100 — "+diagName(score)+"\n\nNotas por dimensão:\n";
  DIAG_DIMS.forEach((d,di)=>{const p=diagDimPct(di);t+="• "+d.n+" ("+Math.round(d.w*100)+"%): "+(p===null?"—":Math.round(p)+"/100")+"\n";});
  
  navigator.clipboard.writeText(t).then(()=>{if(btn){const o=btn.textContent;btn.textContent="Copiado ✓";setTimeout(()=>btn.textContent=o,1500);}});
}
function diagReset(){
  askConfirm("Limpar diagnóstico","Apagar todas as notas, valores e ações deste diagnóstico?",()=>{
    for(const k in diagScores)delete diagScores[k];
    for(const k in diagValues)delete diagValues[k];
    for(const k in diagActions)delete diagActions[k];
    for(const k in diagInfo)delete diagInfo[k];
    diagTipo="Fabricante"; render();
  });
}

// ─── RENDER ───────────────────────────────────────────────────────────
// Sobreviveu à remoção da tela de Planilhas: o painel e os Relatórios
// usam este parser para ler as metas da equipe, que são digitadas com
// vírgula decimal.
function plNum(v){if(v===""||v===undefined||v===null)return 0;const n=parseFloat(String(v).replace(",","."));return isNaN(n)?0:n;}

function render(){
  if(!currentUser)return;
  // Guarda o que estava em foco e a posição do cursor. Como a tela é
  // redesenhada inteira a cada atualização de dados, sem isso o campo em que
  // você está digitando perde o foco no meio da digitação.
  const _ativo=document.activeElement;
  const _foco=_ativo&&_ativo.id&&document.getElementById("content")&&document.getElementById("content").contains(_ativo)
    ? {id:_ativo.id,ini:_ativo.selectionStart,fim:_ativo.selectionEnd} : null;
  // Limpa tarefas de renovação criadas pelo comportamento antigo (uma vez)
  cleanupRenewalTasks();
  // Block "equipe" view for non-admins
  if(view==="equipe"&&!isAdmin())view="dashboard";
  if(view==="diagnostico"&&!isAdmin())view="dashboard";
  if(view==="integracoes"&&!isAdmin())view="dashboard";
  // Vendas e Ferramentas são só de admin. Esconder o botão no menu não basta:
  // sem esta guarda a tela continua alcançável por quem tiver a view salva.
  if(view==="vendas"&&!isAdmin())view="dashboard";
  if(view==="ferramentas"&&!isAdmin())view="dashboard";
  if(view==="promos")view="dashboard"; // ferramenta de promoções manuais desativada
  // Planilhas de Margem saiu do sistema. A guarda fica pelo mesmo motivo da
  // linha acima: quem estiver com a tela aberta quando a versão nova subir
  // continua com view="planilhas" na memória, e sem isto o próximo
  // redesenho chamaria uma função que não existe mais e quebraria a tela.
  if(view==="planilhas")view="dashboard";
  // Produtos é só do admin: quem não é cai no dashboard em vez de ver um
  // iframe que as regras do Firestore vão esvaziar sem explicar por quê.
  if(view==="produtos"&&!isAdmin())view="dashboard";
  const fn={dashboard:rDash,kanban:rKanban,clientes:rClientes,equipe:rEquipe,relatorios:rRelatorios,diagnostico:rDiagnostico,integracoes:rIntegracoes,relcliente:rRelCliente,produtos:rProdutos,vendas:rVendas,ferramentas:rFerramentas}[view];
  document.getElementById("content").innerHTML=fn();
  bindAll();
  enhanceSearchSelects(document.getElementById("content"));
  // Devolve o foco e o cursor para onde estavam antes do redesenho.
  if(_foco){
    const el=document.getElementById(_foco.id);
    if(el){
      try{ el.focus({preventScroll:true});
           if(_foco.ini!=null&&el.setSelectionRange)el.setSelectionRange(_foco.ini,_foco.fim); }catch{}
    }
  }
  if(view==="diagnostico")diagRender();
  // Sync nav active state
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  document.getElementById("page-title").textContent=TITLES[view];
  // Update overdue pill
  const ov=visibleTasks().filter(t=>isOverdue(t)).length;
  const pill=document.getElementById("overdue-pill");
  document.getElementById("overdue-text").innerHTML=ov===1?"<strong>1</strong> tarefa atrasada":`<strong>${ov}</strong> tarefas atrasadas`;
  pill.style.display=ov>0?"inline-flex":"none";pill.style.alignItems="center";
  pill.style.cursor=ov>0?"pointer":"default";
  pill.onclick=ov>0?()=>{view="kanban";fRange="all";fEmp="all";fCli="all";fSort="prazo";render();}:null;
  // Ferramenta de promoções manuais removida — as promoções agora vêm da API da Shopee.
}

// ESC to close form panel / modal
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  // Close any open modal in order of stacking
  const imask=document.getElementById("input-mask");
  if(imask&&imask.classList.contains("show")){imask.classList.remove("show");return;}
  const cmask=document.getElementById("confirm-mask");
  if(cmask&&cmask.classList.contains("show")){cmask.classList.remove("show");return;}
  const fmask=document.getElementById("form-modal-mask");
  if(fmask&&fmask.classList.contains("show")){closeFormModal();return;}
});

// ─── DASHBOARD ────────────────────────────────────────────────────────
// Pendências de ferramenta, uma linha por loja.
//
// Substituiu o aviso da conferência no painel: promoção faltando é ação da
// equipe HOJE; divergência de centavos já é corrigida sozinha pelo backend e
// não muda o que ninguém faz. Aviso que não gera ação vira paisagem.
//
// Antes eram listas separadas por tipo de falha, e a mesma loja aparecia em
// todas repetindo a mesma frase. Quem lê quer saber o que fazer NA LOJA, não
// percorrer três listas para juntar as partes — por isso agora é uma linha por
// loja, com as faltas dela em etiquetas.
const AVISO_MAX_LOJAS=12;
const AVISO_MAX_VENCENDO=6;
const AVISO_MAX_NOMES=14;
function avisoFerramentasHTML(){
  // Só admin. A equipe não decide o que fazer com pendência de loja, e aviso
  // que quem lê não pode resolver é o jeito mais rápido de ensinar a ignorar
  // o painel inteiro.
  if(!isAdmin())return "";
  if(!window.prazos||!Array.isArray(tools)||!tools.length)return "";
  const agora=Math.floor(Date.now()/1000);
  const nomeLoja=(id)=>{const c=clis.find(x=>x.id===id);return c?c.name:id;};

  const semDesc=new Set(window.prazos.semFerramenta(tools,"desconto",agora).map(x=>x.cliente));
  const semRel=new Set(window.prazos.semFerramentaNemAgendada(tools,"flash_sale",agora).map(x=>x.cliente));
  const minimos=new Map(window.prazos.abaixoDoMinimo(tools,agora).map(x=>[x.cliente,x]));
  const vence=window.prazos.vencendo(tools,agora,2);

  const ids=[...new Set([...semDesc,...semRel,...minimos.keys()])];
  const lojas=ids.map(id=>{
    const tags=[];
    if(semRel.has(id))tags.push({t:"sem oferta relâmpago",n:"alerta"});
    for(const f of ((minimos.get(id)||{}).faltas||[]))tags.push({t:f.texto,n:"min"});
    return {id,nome:nomeLoja(id),tags,semDesc:semDesc.has(id),
            peso:(semRel.has(id)?50:0)+tags.length};
  }).filter(x=>x.tags.length||x.semDesc)
    .sort((a,b)=>b.peso-a.peso||a.nome.localeCompare(b.nome));

  // Loja sem NENHUM desconto ativo sai da lista comum e ganha faixa própria.
  // É a única falta aqui que já está custando venda neste momento: as outras
  // são o combinado não cumprido. Misturar as duas na mesma lista faz a urgente
  // ter o mesmo peso visual da rotineira, e quem lê trata tudo como rotina.
  const semNenhum=lojas.filter(l=>l.semDesc);
  const resto=lojas.filter(l=>!l.semDesc);

  if(!lojas.length&&!vence.length)return "";

  const CORES={
    crit:  {bg:"#fee2e2",fg:"#991b1b",bd:"#fecaca"},
    alerta:{bg:"#fef3c7",fg:"#92400e",bd:"#fde68a"},
    min:   {bg:"#ffedd5",fg:"#9a3412",bd:"#fed7aa"},
  };
  const tag=(x)=>{const c=CORES[x.n]||CORES.min;
    return `<span style="display:inline-block;background:${c.bg};color:${c.fg};border:1px solid ${c.bd};border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600;line-height:1.5;white-space:nowrap">${esc(x.t)}</span>`;};

  const linha=(nome,direita,sep="#f5e6d8")=>`
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:6px 0;border-top:1px solid ${sep}">
      <span style="flex:0 0 auto;min-width:172px;font-size:12.5px;font-weight:600;color:#1e293b">${esc(nome)}</span>
      <span style="display:flex;gap:5px;flex-wrap:wrap">${direita}</span>
    </div>`;

  const titulo=(txt,n)=>`
    <div style="display:flex;align-items:center;gap:8px;margin:0 0 2px">
      <span style="font-size:12.5px;font-weight:700;color:#7c2d12;letter-spacing:-.01em">${txt}</span>
      <span style="background:#ea580c;color:#fff;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:700">${n}</span>
    </div>`;

  const rodape=(txt)=>`<div style="font-size:11.5px;color:#a16207;margin-top:8px;line-height:1.6">${txt}</div>`;

  // Loja com UMA pendência só não merece uma linha inteira: dez linhas
  // repetindo "sem oferta relâmpago" foi justamente o que afogou o aviso
  // antigo. Elas viram uma linha agrupada, e o espaço fica para quem tem
  // várias faltas ou já está perdendo venda agora.
  const destaque=resto.filter(l=>l.tags.length>1);
  const grupos=new Map();
  for(const l of resto.filter(l=>!destaque.includes(l))){
    const k=l.tags[0].t;
    if(!grupos.has(k))grupos.set(k,{tag:l.tags[0],nomes:[]});
    grupos.get(k).nomes.push(l.nome);
  }
  const linhaGrupo=(g)=>`
    <div style="padding:8px 0;border-top:1px solid #f5e6d8">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${tag(g.tag)}<span style="font-size:11.5px;color:#78716c">${g.nomes.length} loja(s)</span>
      </div>
      <div style="font-size:12px;color:#475569;line-height:1.7;margin-top:3px">${
        g.nomes.slice(0,AVISO_MAX_NOMES).map(esc).join(" · ")
      }${g.nomes.length>AVISO_MAX_NOMES?` <span style="color:#94a3b8">…e mais ${g.nomes.length-AVISO_MAX_NOMES}</span>`:""}</div>
    </div>`;

  let html="";
  if(semNenhum.length){
    html+=`<div style="background:#fef2f2;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:10px;padding:12px 15px 13px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
        <span style="font-size:15px;line-height:1">⛔</span>
        <span style="font-size:13.5px;font-weight:800;color:#991b1b;letter-spacing:-.01em">
          ${semNenhum.length===1?"1 loja está":`${semNenhum.length} lojas estão`} SEM NENHUM DESCONTO ATIVO</span>
      </div>
      ${semNenhum.map(l=>linha(l.nome,l.tags.map(tag).join(""),"#fbdcdc")).join("")}
    </div>`;
  }
  if(resto.length){
    html+=titulo("Lojas com ferramenta pendente",resto.length)
      +destaque.slice(0,AVISO_MAX_LOJAS).map(l=>linha(l.nome,l.tags.map(tag).join(""))).join("")
      +[...grupos.values()].sort((a,b)=>b.nomes.length-a.nomes.length).map(linhaGrupo).join("")
      // Do rodapé só sobra o que foi CORTADO da lista: aviso que esconde parte
      // dela sem dizer vira "está tudo aqui" mentindo. O texto explicativo saiu
      // — o painel diz se a ferramenta está no ar, não repete o porquê.
      +(destaque.length>AVISO_MAX_LOJAS
        ?rodape(`…e mais ${destaque.length-AVISO_MAX_LOJAS} loja(s) com várias faltas.`):"");
  }
  if(vence.length){
    html+=`<div style="margin-top:14px">`+titulo("Vencendo em até 2 dias",vence.length)
      +vence.slice(0,AVISO_MAX_VENCENDO).map(p=>linha(nomeLoja(p.cliente),
        `<span style="font-size:12px;color:#475569">${esc(p.nome)}</span>`
        +tag({t:window.prazos.comoFalta(p.horas),n:p.horas<24?"crit":"alerta"}))).join("")
      +(vence.length>AVISO_MAX_VENCENDO?rodape(`…e mais ${vence.length-AVISO_MAX_VENCENDO}.`):"")
      +`</div>`;
  }

  return`<div style="background:#fffaf5;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:12px;padding:14px 18px 16px;margin-bottom:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)">${html}</div>`;
}

// Aviso da conferência diária — MANTIDO, mas fora do painel.
// A correção continua acontecendo no backend e fica registrada; o que saiu
// foi a interrupção diária de quem não vai agir sobre ela.
function avisoConferenciaHTML(){
  if(!isAdmin()||!conferencia||conferencia.tudoCerto)return "";
  const nomeLoja=(id)=>{const c=clis.find(x=>x.id===id);return c?c.name:id;};
  const money=(v)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const itens=[];

  for(const q of (conferencia.detalheQuedas||[]).slice(0,5)){
    itens.push(`<li><b>${esc(nomeLoja(q.loja))}</b>: o total do mês caiu de
      ${money(q.antes)} para ${money(q.agora)} — ${money(q.caiu)} a menos.</li>`);
  }
  for(const d of (conferencia.detalheDivergencias||[]).slice(0,5)){
    const rotulo=d.tipo==="faltando"
      ? `a Shopee tem ${money(d.api&&d.api.gmv)} em ${fmtDate(d.dia)} e o sistema não tinha registrado`
      : d.tipo==="pedidos"
      ? `a contagem de pedidos de ${fmtDate(d.dia)} mudou`
      : `${fmtDate(d.dia)} mudou de ${money(d.salvo&&d.salvo.gmv)} para ${money(d.api&&d.api.gmv)}`;
    // Dizer que já foi corrigido evita a pergunta "e agora, eu conserto como?".
    // O que importa é o aviso de que o número MUDOU: se a loja já foi cobrada
    // com o valor antigo, a fatura precisa ser acertada.
    const fim=d.corrigido
      ? " — já corrigido pelo valor da Shopee. Se já cobrou, revise a fatura."
      : " — não corrigi automaticamente: a Shopee devolveu o dia vazio e prefiro não apagar faturamento.";
    itens.push(`<li><b>${esc(nomeLoja(d.cliente))}</b>: ${rotulo}${fim}</li>`);
  }
  const sobra=(conferencia.divergencias||0)+(conferencia.quedas||0)-itens.length;

  return`<div style="background:#fff7ed;border:1px solid #fdba74;border-left:4px solid #ea580c;border-radius:10px;padding:14px 18px;margin-bottom:16px">
    <div style="font-weight:700;font-size:13.5px;color:#9a3412;margin-bottom:6px">
      Conferência de ${fmtDate(conferencia.data)}: números mudaram depois de fechados
    </div>
    <ul style="margin:0 0 6px 18px;padding:0;font-size:12.5px;color:#7c2d12;line-height:1.7">${itens.join("")}</ul>
    ${sobra>0?`<div style="font-size:11.5px;color:#9a3412">…e mais ${sobra} ocorrência(s).</div>`:""}
    <div style="font-size:11.5px;color:#9a3412;margin-top:6px">
      Causa habitual: pedido cancelado ou devolvido depois da venda. Confira antes de fechar a cobrança dessas lojas.
    </div>
  </div>`;
}

function rDash(){
  const ts=visibleTasks().filter(t=>inRange(t.date));
  const tot=ts.length,td=ts.filter(t=>t.status==="todo").length,
        dg=ts.filter(t=>t.status==="doing").length,dn=ts.filter(t=>t.status==="done").length;
  const overdue=visibleTasks().filter(t=>isOverdue(t)).length;
  const p=pct(dn,tot);
  const maxV=maxOf(emps.map(e=>ts.filter(t=>t.emp===e.id).length));
  const _bizDays=(from,to)=>bizDays(from,to).dias;
  const _dashStart=fRange==="custom"?new Date(fDate+"T12:00").getTime():fRange==="today"?Date.now():fRange==="last7"?Date.now()-6*864e5:fRange==="last30"?Date.now()-29*864e5:fRange==="next7"?Date.now():Math.min(...ts.map(t=>new Date(t.date).getTime()),Date.now());
  const _dashEnd=fRange==="custom"?new Date(fDate+"T12:00").getTime():Date.now();
  const _dashDays=_bizDays(_dashStart,_dashEnd);
  const _metaApd=plNum(repGoals.adsPerDay);
  const bars=emps.map(e=>{
    const a=ts.filter(t=>t.emp===e.id&&t.status==="todo").length;
    const b=ts.filter(t=>t.emp===e.id&&t.status==="doing").length;
    const c=ts.filter(t=>t.emp===e.id&&t.status==="done").length;
    let metaTag="";
    if(_metaApd>0&&e.role!=="admin"){
      const adsDone=ts.filter(t=>t.emp===e.id&&t.status==="done"&&isAdTask(t)).reduce((s,t)=>s+adQtyOf(t),0);
      const apd=adsDone/_dashDays, pctMeta=Math.round(apd/_metaApd*100);
      const col=pctMeta>=100?"#16a34a":pctMeta>=70?"#d69304":"#e03b3b";
      metaTag=`<div class="meta-tag" style="color:${col}" title="${apd.toFixed(1)}/dia · meta ${_metaApd}/dia">${pctMeta}%${pctMeta>=100?" ✓":""}</div>`;
    }
    return`<div class="chart-col">
      <div style="display:flex;align-items:flex-end;gap:2px;height:90px">
        ${bar(a,maxV,"#fca5a5",90)}${bar(b,maxV,"#ea580c",90)}${bar(c,maxV,"#4ade80",90)}
      </div>
      <div class="chart-lbl">${e.name.split(" ")[0]}</div>
      ${metaTag}
    </div>`;
  }).join("");
  const alta=ts.filter(t=>t.pri==="alta"&&t.status!=="done").length;
  const media=ts.filter(t=>t.pri==="media"&&t.status!=="done").length;
  const baixa=ts.filter(t=>t.pri==="baixa"&&t.status!=="done").length;
  const mx=maxOf([alta,media,baixa]);
  // Sort: overdue first, then by date
  const sorted=[...ts].sort((a,b)=>{
    const oa=isOverdue(a)?0:1,ob=isOverdue(b)?0:1;
    if(oa!==ob)return oa-ob;
    return a.date.localeCompare(b.date);
  });
  const rows=ts.length===0
    ?`<p style="text-align:center;color:#94a3b8;padding:28px 0;font-size:13px">Nenhuma tarefa no período selecionado.</p>`
    :sorted.map(t=>{
      const e=getEmp(t.emp),c=getCliV(t);
      const di=deadlineInfo(t);
      return`<div style="display:flex;align-items:center;gap:12px;padding:9px 18px;border-bottom:1px solid #f8fafc${di.overdue?";background:#fff5f5":""}">
        ${avHTML(e,26)}
        <div style="flex:1;min-width:0">
          <div style="font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
          <div style="font-size:10.5px;color:#94a3b8">${c?esc(c.name):"—"} · ${e?esc(e.name):"—"} · ${fmtDate(t.date)}</div>
        </div>
        <span class="deadline" style="background:${di.bg};color:${di.color}">${di.label}</span>
        ${priB(t.pri)}${stB(t.status)}
      </div>`;
    }).join("");

  return`
    ${avisoFerramentasHTML()}
    ${rangeBarHTML()}
    <div class="stat-grid" style="grid-template-columns:repeat(5,1fr)">
      <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" style="color:#0f172a">${tot}</div></div>
      <div class="stat-card"><div class="stat-label">A fazer</div><div class="stat-value" style="color:#dc2626">${td}</div></div>
      <div class="stat-card"><div class="stat-label">Em andamento</div><div class="stat-value" style="color:#ea580c">${dg}</div></div>
      <div class="stat-card"><div class="stat-label">Concluídas</div><div class="stat-value" style="color:#16a34a">${dn}</div></div>
      <div class="stat-card" style="background:${overdue>0?"#fef2f2":"white"};border-color:${overdue>0?"#fecaca":"#e2e8f0"}"><div class="stat-label" style="color:${overdue>0?"#dc2626":"#64748b"}">⚠ Atrasadas</div><div class="stat-value" style="color:#dc2626">${overdue}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:14px">
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline">Tarefas por funcionário · ${rangeLabel()}${_metaApd>0?'<span style="font-size:10.5px;font-weight:600;color:#94a3b8">% = meta de anúncios/dia</span>':'<span style="font-size:10.5px;font-weight:600;color:#cbd5e1">defina metas em Relatórios</span>'}</div>
        <div class="chart-group" style="height:100px">${bars}</div>
        <div class="legend">
          <span><span class="ldot" style="background:#fca5a5"></span>A fazer</span>
          <span><span class="ldot" style="background:#ea580c"></span>Em andamento</span>
          <span><span class="ldot" style="background:#4ade80"></span>Concluído</span>
        </div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">Urgência em aberto</div>
        ${urgRow("🔴 Alta",alta,mx,"#dc2626")}
        ${urgRow("🟡 Média",media,mx,"#d97706")}
        ${urgRow("🔵 Baixa",baixa,mx,"#2563eb")}
        <div style="margin-top:14px;background:#f0fdf4;border-radius:8px;padding:10px 12px">
          <div style="font-size:11px;color:#16a34a;margin-bottom:2px">Taxa de conclusão</div>
          <div style="font-size:22px;font-weight:800;color:#16a34a">${p}%</div>
        </div>
      </div>
    </div>
    <div class="card-table">
      <div style="padding:12px 18px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700;display:flex;justify-content:space-between;align-items:center">
        <span>Tarefas · ${rangeLabel()}</span>
        <span style="font-size:11px;color:#64748b;font-weight:400">Ordenadas: atrasadas primeiro</span>
      </div>
      ${rows}
    </div>`;
}
function fmtDate(iso){const[y,m,d]=iso.split("-");return`${d}/${m}/${y.slice(2)}`;}
function urgRow(lbl,v,mx,col){
  return`<div style="margin-bottom:12px">
    <div class="urg-head"><span>${lbl}</span><span style="font-weight:700;color:${col}">${v}</span></div>
    <div class="prog-track"><div class="prog-bar" style="background:${col};width:${Math.min(100,pct(v,mx))}%"></div></div>
  </div>`;
}

// ─── KANBAN ───────────────────────────────────────────────────────────
function rKanban(){
  let filtered=visibleTasks().filter(t=>(true)
    &&(fEmp==="all"||t.emp===fEmp)
    &&(fCli==="all"||t.cli===fCli||t.cli==="all")
    &&(fCust==="all"||t.cli==="all"||(getCli(t.cli)&&getCli(t.cli).custId===fCust))
    &&(!myOnly||!currentUser||t.emp===currentUser.id));
  // Sort: overdue first, then by selected criteria
  filtered.sort((a,b)=>{
    if(fSort==="ordem"){
      // Manual order: tasks with explicit order first (by order), then by date
      const ao=(typeof a.order==="number")?a.order:1e9, bo=(typeof b.order==="number")?b.order:1e9;
      if(ao!==bo)return ao-bo;
      return a.date.localeCompare(b.date);
    }
    const oa=isOverdue(a)?0:1,ob=isOverdue(b)?0:1;
    if(oa!==ob)return oa-ob;
    if(fSort==="prazo")return a.date.localeCompare(b.date);
    if(fSort==="prioridade"){const o={alta:0,media:1,baixa:2};return o[a.pri]-o[b.pri];}
    return 0;
  });
  const empOpts=emps.map(e=>`<option value="${e.id}"${fEmp===e.id?" selected":""}>${esc(e.name)}</option>`).join("");
  // Nome + marketplace: há marcas com loja na Shopee E na Shein, e num
  // <option> não dá para usar selo colorido — então vai em texto mesmo.
  const cliOpts=clis.map(c=>`<option value="${c.id}"${fCli===c.id?" selected":""}>${esc(c.name)}${c.mkt?" · "+esc(c.mkt):""}</option>`).join("");
  const cols=["todo","doing","done"].map(st=>{
    const items=filtered.filter(t=>t.status===st);
    const nextSt={todo:"doing",doing:"done",done:"todo"}[st];
    const nextLbl={todo:"Iniciar →",doing:"Concluir →",done:"↺ Reabrir"}[st];
    const cards=items.length===0?`<div class="task-empty">Sem tarefas</div>`:items.map((t,idx)=>{
      const e=getEmp(t.emp),c=getCliV(t);
      const di=deadlineInfo(t);
      const ownerName=c&&c.custId?(getCust(c.custId)?getCust(c.custId).name:""):"";
      return`<div class="task-card${di.overdue?" overdue":""}" draggable="true" data-card="${t.id}" data-status="${st}" style="border-left:3px solid ${PCOL[t.pri]}">
        <div style="display:flex;align-items:flex-start;gap:6px">
          <span class="drag-handle" title="Arraste para reordenar">⠿</span>
          <div data-view="${t.id}" title="Ver detalhes" style="font-size:13px;font-weight:600;line-height:1.35;flex:1;cursor:pointer;color:#0f172a">${esc(t.title)}</div>
          <div class="card-actions">
            <button data-view="${t.id}" title="Ver detalhes">👁</button>
            <button data-edit="${t.id}" title="Editar">✎</button>
            <button data-del="${t.id}" title="Excluir" class="del">✕</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin:7px 0 0 18px;flex-wrap:wrap">
          <span class="deadline" style="background:${di.bg};color:${di.color}">${di.label}</span>
          ${priB(t.pri)}
          ${isAdTask(t)?`<span class="badge" style="background:#dcfce7;color:#16a34a">📢 ${adQtyOf(t)}</span>`:""}
        </div>
        ${(e||c)?`<div style="display:flex;align-items:center;gap:6px;margin:8px 0 0 18px;font-size:10.5px;color:#94a3b8;min-width:0">
          ${e?avHTML(e,18):""}
          ${c?`<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}${ownerName?" · "+esc(ownerName):""}</span>`:""}
        </div>`:""}
        <button data-move="${t.id}" data-next="${nextSt}" class="move-btn">${nextLbl}</button>
      </div>`;
    }).join("");
    return`<div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:${SCOL[st]}"></div>
        <span style="font-size:12.5px;font-weight:700">${SLBL[st]}</span>
        <span class="badge" style="background:${SBGCOL[st]};color:${SCOL[st]}">${items.length}</span>
      </div>
      <div class="kanban-col" data-col="${st}">${cards}</div>
    </div>`;
  }).join("");
  return`
    <div class="filter-bar">
      <span style="font-size:11px;color:#64748b;font-weight:600;margin-right:2px">🔍 FILTRAR</span>
      <select id="k-emp"><option value="all">Todos os funcionários</option>${empOpts}</select>
      <select id="k-cli" data-search data-placeholder="🔍 Buscar loja..."><option value="all">Todas as lojas</option>${cliOpts}</select>
      ${custs.length>0?`<select id="k-cust" data-search data-placeholder="🔍 Buscar cliente..."><option value="all">Todos os clientes</option>${custs.map(cu=>`<option value="${cu.id}"${fCust===cu.id?" selected":""}>${esc(cu.name)}</option>`).join("")}</select>`:""}
      <span style="font-size:11px;color:#64748b;font-weight:600;margin-left:8px">↕ ORDENAR</span>
      <select id="k-sort">
        <option value="prazo"${fSort==="prazo"?" selected":""}>Por prazo</option>
        <option value="prioridade"${fSort==="prioridade"?" selected":""}>Por prioridade</option>
        <option value="ordem"${fSort==="ordem"?" selected":""}>Ordem manual ⠿</option>
      </select>
      ${currentUser?`<button class="btn-sm" id="k-myonly" style="${myOnly?"background:#ea580c;color:white;font-weight:700":""}">${myOnly?"👤 Minhas":"👥 Todas"}</button>`:""}
      ${(fEmp!=="all"||fCli!=="all"||fCust!=="all"||myOnly)?`<button class="btn-sm" id="k-clear">✕ Limpar filtros</button>`:""}
    </div>
    <div class="kanban-grid">${cols}</div>`;
}

// ─── RELATÓRIO DE CLIENTE / VENDAS / FERRAMENTAS ──────────────────────
// As três eram abas dentro do relatorio-cliente.html. Viraram entradas do menu
// porque eram três telas diferentes escondidas atrás de um clique extra — quem
// abria o relatório de um cliente não estava procurando faturamento geral.
//
// Continuam sendo a MESMA página, aberta com ?aba=... — duplicar o código em
// telas separadas criaria duas versões da mesma regra para manter em sincronia,
// que é exatamente como o painel ficou fora do padrão da oferta relâmpago.
function telaRelatorio(aba,titulo){
  return`<iframe src="relatorio-cliente.html?embed=1&aba=${aba}" title="${esc(titulo)}"
     style="width:100%;height:calc(100vh - 132px);border:1px solid #e2e8f0;border-radius:12px;background:#fff"></iframe>`;
}
// ─── PRODUTOS DO CLIENTE ──────────────────────────────────────────────
// A MESMA página que o cliente vê (cliente.html), embutida aqui. Não é uma
// segunda tela parecida: é a de verdade, com ?cliente= dizendo de quem, e
// ?embed=1 escondendo a barra lateral dela porque esta já tem uma.
//
// Duas coisas se ganham de graça com isso: você enxerga exatamente o que o
// cliente enxerga (sem "na minha tela aparecia certo"), e qualquer melhoria
// na área do cliente aparece aqui no mesmo instante.
//
// Dentro dela, por ser funcionário, aparecem os botões de editar e desvincular
// que o cliente não tem.
function rProdutos(){
  const donos=custs.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"","pt-BR"));
  if(!donos.length)return`<div class="empty">Nenhum cliente cadastrado ainda.</div>`;
  if(!prodCliente||!donos.some(d=>d.id===prodCliente))prodCliente=donos[0].id;
  const dono=getCust(prodCliente);
  const lojas=storesOfCust(prodCliente);
  const url=`cliente.html?embed=1&cliente=${encodeURIComponent(prodCliente)}&nome=${encodeURIComponent(dono?dono.name:"")}`;
  return`
  <div class="filter-bar" style="margin-bottom:14px">
    <span style="font-size:11px;color:#64748b;font-weight:600">👤 CLIENTE</span>
    <select id="prod-cliente" data-search data-placeholder="Buscar cliente...">
      ${donos.map(d=>`<option value="${esc(d.id)}"${d.id===prodCliente?" selected":""}>${esc(d.name)}</option>`).join("")}
    </select>
    <span style="font-size:12px;color:#94a3b8">${lojas.length} loja${lojas.length!==1?"s":""}${lojas.length?" · "+lojas.map(l=>esc(l.name)).join(", "):""}</span>
    <button id="prod-especialistas" class="btn-sm" style="margin-left:auto">🤝 Especialistas</button>
  </div>
  <iframe id="prod-frame" src="${url}" title="Produtos de ${esc(dono?dono.name:"")}"
    style="width:100%;height:calc(100vh - 178px);border:1px solid #e2e8f0;border-radius:12px;background:#fff"></iframe>`;
}

function rRelCliente(){ return telaRelatorio("cliente","Relatório de Cliente"); }
function rVendas(){ return telaRelatorio("vendas","Vendas · Todas as Lojas"); }
function rFerramentas(){ return telaRelatorio("ferramentas","Ferramentas por Loja"); }

// ─── INTEGRAÇÕES (Shopee) ─────────────────────────────────────────────
// Conecta cada loja à API da Shopee via OAuth. O botão abre o link de
// autorização do backend; ao voltar, o backend grava o status em "integracoes".
function integStatus(cliId){
  const it=integs.find(i=>i.id===cliId);
  return it&&it.conectado?it:null;
}
function rIntegracoes(){
  // Só lojas Shopee podem ser integradas (a API é da Shopee).
  let lojas=clis.filter(c=>!c._deleted&&(c.mkt||"").toLowerCase()==="shopee");
  if(fIntegBusca){
    const q=fIntegBusca.toLowerCase();
    lojas=lojas.filter(c=>(c.name||"").toLowerCase().includes(q));
  }
  const conectadas=lojas.filter(c=>integStatus(c.id)).length;
  if(fIntegFiltro==="on")lojas=lojas.filter(c=>integStatus(c.id));
  if(fIntegFiltro==="off")lojas=lojas.filter(c=>!integStatus(c.id));
  lojas.sort((a,b)=>(a.name||"").localeCompare(b.name||"","pt-BR"));

  const total=clis.filter(c=>!c._deleted&&(c.mkt||"").toLowerCase()==="shopee").length;
  const cards=lojas.map(c=>{
    const st=integStatus(c.id);
    const dono=c.custId&&getCust(c.custId)?getCust(c.custId).name:"";
    const badge=st
      ?`<span style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700">● Conectada</span>`
      :`<span style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700">○ Não conectada</span>`;
    // Andamento da recuperação do histórico (roda sozinha depois de conectar).
    let hist="";
    if(st&&st.historicoCompleto===false&&st.historicoProximo){
      hist=`<span style="color:#b45309"> · recuperando histórico… já em ${esc(String(st.historicoProximo).split("-").reverse().join("/"))}</span>`;
    }else if(st&&st.historicoCompleto===true){
      hist=`<span style="color:#16a34a"> · histórico completo</span>`;
    }
    const info=st?`<div style="font-size:11.5px;color:#94a3b8;margin-top:4px">Shop ID ${esc(String(st.shopId||"—"))}${hist}</div>`:"";
    const acao=st
      ?`<button class="btn-ghost" data-reconn="${c.id}" style="font-size:12px">Reconectar</button>
         <button class="btn-ghost" data-desconn="${c.id}" style="font-size:12px;color:#dc2626">Desconectar</button>`
      :`<button class="btn-primary" data-conn="${c.id}" style="font-size:12.5px;padding:7px 16px">Conectar</button>`;
    return`<div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:14px;color:#0f172a">${esc(c.name||"—")}</div>
        <div style="font-size:11.5px;color:#94a3b8;margin-top:2px">${esc(dono)}</div>
        ${info}
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">${badge}${acao}</div>
    </div>`;
  }).join("");

  return`
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin-bottom:16px">
    <div style="font-weight:700;font-size:13px;color:#1e40af;margin-bottom:4px">Como conectar uma loja</div>
    <div style="font-size:12.5px;color:#1e3a8a;line-height:1.6">
      Clique em <strong>Conectar</strong> e faça login com a conta de vendedor <strong>daquela loja</strong> na Shopee.
      Após autorizar, a janela fecha sozinha e o status muda para “Conectada”.
      A partir daí o sistema busca vendas e promoções automaticamente.
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
    <div style="font-size:13px;color:#475569"><strong>${conectadas}</strong> de <strong>${total}</strong> lojas Shopee conectadas</div>
    <button class="btn-ghost" id="sync-agora" style="font-size:12.5px">↻ Sincronizar agora</button>
    <div style="flex:1"></div>
    <input id="integ-busca" class="finput" placeholder="Buscar loja…" value="${esc(fIntegBusca)}" style="max-width:220px">
    <select id="integ-filtro" class="finput" style="max-width:180px">
      <option value="all"${fIntegFiltro==="all"?" selected":""}>Todas</option>
      <option value="off"${fIntegFiltro==="off"?" selected":""}>Não conectadas</option>
      <option value="on"${fIntegFiltro==="on"?" selected":""}>Conectadas</option>
    </select>
  </div>
  <div style="display:grid;gap:10px">
    ${cards||'<p style="text-align:center;color:#94a3b8;padding:30px;font-size:13px">Nenhuma loja encontrada.</p>'}
  </div>`;
}
function conectarLoja(cliId){
  if(SEM_BACKEND)return backendIndisponivel();
  // Abre a janela ANTES do fetch (senão o bloqueador de pop-up mata), e o
  // servidor — validando que somos admin — devolve o link assinado.
  const w=window.open("about:blank","_blank","width=1000,height=760");
  (async()=>{
    try{
      const tk=await window.fb.auth.currentUser.getIdToken();
      const r=await fetch(`${FN_BASE}/linkAutorizacao?cliente=${encodeURIComponent(cliId)}`,{
        headers:{Authorization:"Bearer "+tk}
      });
      const j=await r.json();
      if(!r.ok)throw new Error(j.erro||"falha ao gerar o link");
      w.location=j.url;
    }catch(e){
      if(w)w.close();
      showToast("Erro ao conectar: "+e.message,"error");
    }
  })();
}
// Puxa os dados da Shopee na hora, sem esperar o agendamento (30 min).
async function sincronizarAgora(btn){
  if(SEM_BACKEND)return backendIndisponivel();
  const txt=btn.textContent;
  btn.disabled=true;btn.textContent="Sincronizando…";
  try{
    const tk=await window.fb.auth.currentUser.getIdToken();
    const r=await fetch(`${FN_BASE}/syncPeloApp`,{method:"POST",headers:{Authorization:"Bearer "+tk}});
    const j=await r.json();
    if(!r.ok)throw new Error(j.erro||"falha");
    const v=Number(j.faturamento||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
    showToast(`${j.lojas} loja(s) · ${j.pedidos} pedidos · ${v} hoje`,"success");
  }catch(e){
    showToast("Erro ao sincronizar: "+e.message,"error");
  }finally{
    btn.disabled=false;btn.textContent=txt;
  }
}

async function desconectarLoja(cliId){
  if(SEM_BACKEND)return backendIndisponivel();
  const nome=(clis.find(c=>c.id===cliId)||{}).name||"esta loja";
  askConfirm("Desconectar loja",`Desconectar ${nome} da API da Shopee? O sistema para de buscar vendas dessa loja até você conectar de novo.`,async()=>{
    try{
      const tk=await window.fb.auth.currentUser.getIdToken();
      const r=await fetch(`${FN_BASE}/shopeeDesconectar?cliente=${encodeURIComponent(cliId)}`,{
        method:"POST",headers:{Authorization:"Bearer "+tk}
      });
      const j=await r.json();
      if(!r.ok)throw new Error(j.erro||"falha");
      showToast("Loja desconectada.","success");
    }catch(e){showToast("Erro ao desconectar: "+e.message,"error");}
  });
}

// ─── CLIENTES ─────────────────────────────────────────────────────────
function rClientes(){
  // Filter stores by selected owner AND by ERP
  let filtered=fCust==="all"?clis.slice():clis.filter(c=>c.custId===fCust);
  if(fErp!=="all")filtered=filtered.filter(c=>erpOfStore(c)===fErp);
  if(fMkt!=="all")filtered=filtered.filter(c=>(c.mkt||"")===fMkt);
  // Sort: owners with more stores first, then keep each owner's stores grouped together,
  // and finally alphabetical by store name within the same owner.
  const storeCountOf=cid=>cid?storesOfCust(cid).length:0;
  filtered.sort((a,b)=>{
    // 1) by store count of the owner (more stores first)
    const d=storeCountOf(b.custId)-storeCountOf(a.custId);
    if(d!==0)return d;
    // 2) group same owner together — order owners by their name
    const an=a.custId&&getCust(a.custId)?getCust(a.custId).name:"zzz";
    const bn=b.custId&&getCust(b.custId)?getCust(b.custId).name:"zzz";
    const o=an.localeCompare(bn);
    if(o!==0)return o;
    // 3) within the same owner, alphabetical by store name
    return a.name.localeCompare(b.name);
  });
  // Customer dropdown options — sorted by store count desc (most stores first)
  const cuOpts=custs.slice().sort((a,b)=>{
    const d=storesOfCust(b.id).length-storesOfCust(a.id).length;
    return d!==0?d:a.name.localeCompare(b.name);
  }).map(cu=>{
    const n=storesOfCust(cu.id).length;
    return`<option value="${cu.id}"${fCust===cu.id?" selected":""}>${esc(cu.name)} (${n})</option>`;
  }).join("");
  // ERP dropdown options — only ERPs actually in use
  const usedErps=[...new Set(clis.map(erpOfStore).filter(Boolean))];
  const erpOpts=usedErps.map(k=>`<option value="${k}"${fErp===k?" selected":""}>${esc(ERP_PRESETS[k]?ERP_PRESETS[k].label:k)}</option>`).join("");
  const usedMkts=[...new Set(clis.map(c=>c.mkt).filter(Boolean))];
  const mktOpts=usedMkts.map(m=>`<option value="${esc(m)}"${fMkt===m?" selected":""}>${esc(m)}</option>`).join("");
  const rows=filtered.map(c=>{
    const open=tsks.filter(t=>t.cli===c.id&&t.status!=="done").length;
    const _cu=c.custId?getCust(c.custId):null;
    const _lg=(_cu&&_cu.login)||{};
    const _sl=(_lg.stores&&_lg.stores[c.id])||{};
    const hasAcc=(c.access&&(c.access.user||c.access.pass||c.access.url))||_sl.user||_sl.pass||_sl.url||(_lg.erp&&(_lg.erp.user||_lg.erp.pass||_lg.erp.url||_lg.erp.id))||_lg.sheet;
    return`<tr>
      <td>
        <div style="font-weight:600">${esc(c.name)}</div>
        ${ownerBadgeHTML(c)}
      </td>
      <td style="text-align:center">${mktBadge(c.mkt)}</td>
      <td><span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;font-size:13px;color:${open>0?"#dc2626":"#16a34a"}"><span style="width:7px;height:7px;border-radius:50%;background:${open>0?"#dc2626":"#16a34a"};display:inline-block"></span>${open}</span></td>
      <td><div style="display:flex;gap:6px;align-items:center">
        <button data-acc="${c.id}" title="Ver acessos da loja" class="acc-btn${hasAcc?" has":""}">🔑 Acesso</button>
        ${isAdmin()&&c.custId?`<button data-plan="${c.id}" title="Importar a planilha desta loja" class="acc-btn">📄 Planilha</button>`:''}
        ${isAdmin()?`<button data-ecli="${c.id}" title="Editar" class="icon-btn">✎</button>
        <button data-dcli="${c.id}" title="Excluir" class="icon-btn danger">✕</button>`:''}
      </div></td>
    </tr>`;
  }).join("");

  // Filter bar
  const filterBar=(custs.length>0||usedMkts.length>0)?`<div class="filter-bar" style="margin-bottom:14px">
    <span style="font-size:11px;color:#64748b;font-weight:600">🔍 FILTRAR</span>
    ${custs.length>0?`<select id="cli-cust-filter" data-search data-placeholder="🔍 Buscar cliente..."><option value="all">Todos os clientes (${clis.length} lojas)</option>${cuOpts}</select>`:""}
    ${usedErps.length>0?`<select id="cli-erp-filter"><option value="all">Todos os ERPs</option>${erpOpts}</select>`:""}
    ${usedMkts.length>0?`<select id="cli-mkt-filter"><option value="all">Todos os marketplaces</option>${mktOpts}</select>`:""}
    ${(fCust!=="all"||fErp!=="all"||fMkt!=="all")?'<button class="btn-sm" id="cli-clear-filter">✕ Limpar</button>':""}
  </div>`:"";

  return`
    ${isAdmin()?`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;gap:8px">
        <button class="btn-outline" id="manage-custs-btn">👥 Gerenciar clientes (${custs.length})</button>
      </div>
      <button class="btn-primary" id="new-cli-btn">+ Nova loja</button>
    </div>`:''}
    ${filterBar}
    <div class="card-table">
      <table><thead><tr><th>Loja</th><th style="text-align:center">Marketplace</th><th>Em aberto</th><th>Ações</th></tr></thead>
      <tbody>${rows}</tbody></table>
      ${filtered.length===0?`<p style="text-align:center;color:#94a3b8;padding:28px 0;font-size:13px">${clis.length===0?"Nenhuma loja cadastrada.":"Nenhuma loja para o cliente selecionado."}</p>`:""}
    </div>`;
}

// ─── EQUIPE ───────────────────────────────────────────────────────────
function rEquipe(){
  const cards=emps.map(e=>{
    const et=tsks.filter(t=>t.emp===e.id);
    const dn=et.filter(t=>t.status==="done").length;
    const p=pct(dn,et.length);
    const urg=et.filter(t=>t.pri==="alta"&&t.status!=="done").length;
    const roleBadge=e.role==="admin"?'<span style="font-size:9px;background:#ea580c;color:white;padding:1px 6px;border-radius:4px;font-weight:700;letter-spacing:.3px">ADMIN</span>':"";
    const hasLogin=e.email?'<span style="font-size:10px;color:#16a34a">📧 '+esc(e.email)+'</span>':'<span style="font-size:10px;color:#94a3b8">Sem e-mail</span>';
    return`<div class="team-card">
      ${avHTML(e,46)}
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:14px;font-weight:700">${esc(e.name)}</span>
            ${roleBadge}
          </div>
          ${urg>0?`<span class="badge" style="background:#fee2e2;color:#dc2626">${urg} urgente${urg>1?"s":""}</span>`:""}
        </div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${et.length} tarefas · ${dn} concluídas · ${hasLogin}</div>
        <div class="prog-track"><div class="prog-bar" style="background:${e.color};width:${p}%"></div></div>
        <div style="font-size:10px;color:#94a3b8;margin-top:3px">${p}% concluído</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        <button data-eemp="${e.id}" style="background:none;border:none;color:#94a3b8;font-size:14px;cursor:pointer">✎</button>
        <button data-demp="${e.id}" style="background:none;border:none;color:#fca5a5;font-size:14px;cursor:pointer">✕</button>
      </div>
    </div>`;
  }).join("");
  return`
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
      <button class="btn-primary" id="new-emp-btn">+ Novo funcionário</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${emps.length===0?'<p style="color:#94a3b8;font-size:13px;grid-column:span 2;text-align:center;margin-top:40px">Nenhum funcionário cadastrado.</p>':cards}
    </div>`;
}

// ─── RELATÓRIOS ───────────────────────────────────────────────────────
function inRepRange(taskDate){
  if(repRange==="all")return true;
  if(repRange==="custom"){
    if(repFrom&&taskDate<repFrom)return false;
    if(repTo&&taskDate>repTo)return false;
    return true;
  }
  const t=new Date(todayISO()),d=new Date(taskDate);
  const diff=Math.round((d-t)/(24*3600*1000));
  if(repRange==="today")return taskDate===todayISO();
  if(repRange==="last7")return diff>=-6&&diff<=0;
  if(repRange==="last30")return diff>=-29&&diff<=0;
  if(repRange==="last90")return diff>=-89&&diff<=0;
  return true;
}
function repFmtBR(iso){if(!iso)return"";const p=iso.split("-");return p.length===3?p[2]+"/"+p[1]+"/"+p[0]:iso;}
function repSyncDates(range){
  repRange=range;
  const iso=ts=>new Date(ts).toISOString().slice(0,10);
  const today=todayISO();
  if(range==="today"){repFrom=today;repTo=today;}
  else if(range==="last7"){repFrom=iso(Date.now()-6*864e5);repTo=today;}
  else if(range==="last30"){repFrom=iso(Date.now()-29*864e5);repTo=today;}
  else if(range==="last90"){repFrom=iso(Date.now()-89*864e5);repTo=today;}
  else {repFrom="";repTo="";} // "all" — sem intervalo fixo
}
function repRangeLabel(){
  if(repRange==="custom"){
    if(repFrom&&repTo)return repFmtBR(repFrom)+" a "+repFmtBR(repTo);
    if(repFrom)return "A partir de "+repFmtBR(repFrom);
    if(repTo)return "Até "+repFmtBR(repTo);
    return "Período personalizado";
  }
  return{today:"Hoje",last7:"Últimos 7 dias",last30:"Últimos 30 dias",last90:"Últimos 90 dias",all:"Todo o histórico"}[repRange]||"";
}
function repAdsDayCell(apd){
  const meta=plNum(repGoals.adsPerDay);
  const col=meta<=0?"#ea580c":apd>=meta?"#16a34a":apd>=meta*0.7?"#d69304":"#e03b3b";
  const check=(meta>0&&apd>=meta)?" ✓":"";
  return '<span style="color:'+col+'">'+apd.toFixed(1)+'/dia'+check+'</span>';
}
function repGoalBar(atual,meta,unidade,fmt){
  fmt=fmt||(v=>v);
  const ok=meta>0&&atual>=meta;
  const pctv=meta>0?Math.min(100,Math.round(atual/meta*100)):0;
  const col=meta<=0?"#94a3b8":ok?"#16a34a":pctv>=70?"#d69304":"#e03b3b";
  const bg=meta<=0?"#f1f5f9":ok?"#e2f5ea":pctv>=70?"#fbf2d6":"#fce7e7";
  return `<div class="goal-prog">
    <div class="goal-prog-head"><b style="color:${col}">${fmt(atual)}</b><span>meta ${meta>0?fmt(meta):"—"}${unidade?" "+unidade:""}</span></div>
    <div class="goal-prog-track"><div class="goal-prog-fill" style="width:${pctv}%;background:${col}"></div></div>
    <div class="goal-prog-pct" style="color:${col}">${meta>0?(ok?"✓ atingida":pctv+"%"):"sem meta"}</div>
  </div>`;
}
function repGoalsPanel(conclusaoAtual,adsByEmp,rangeDays){
  const teamAvgAds=adsByEmp.length?adsByEmp.reduce((s,a)=>s+a.adsDone/rangeDays,0)/adsByEmp.length:0;
  return `<div class="goals-card" id="goals-card">
    <div class="goals-head">
      <div><b>🎯 Metas</b><span> · ${repRangeLabel()}</span></div>
      <button class="goals-edit" onclick="document.getElementById('goals-edit').classList.toggle('open')">⚙ Definir metas</button>
    </div>
    <div class="goals-grid">
      <div class="goal-item"><div class="goal-name">Taxa de conclusão</div>${repGoalBar(conclusaoAtual,plNum(repGoals.conclusao),"%",v=>Math.round(v)+"%")}</div>
      <div class="goal-item"><div class="goal-name">Anúncios/dia · média da equipe</div>${repGoalBar(teamAvgAds,plNum(repGoals.adsPerDay),"",v=>v.toFixed(1))}</div>
    </div>
    <div class="goals-editbox${(plNum(repGoals.conclusao)<=0&&plNum(repGoals.adsPerDay)<=0)?' open':''}" id="goals-edit">
      <div class="goal-in"><label>Meta de conclusão (%)</label><input id="goal-concl" type="number" min="0" max="100" step="1" value="${repGoals.conclusao||''}" placeholder="ex: 90"></div>
      <div class="goal-in"><label>Meta de anúncios/dia por funcionário</label><input id="goal-ads" type="number" min="0" step="0.1" value="${repGoals.adsPerDay||''}" placeholder="ex: 5"></div>
      <button class="goal-save" onclick="repSaveGoals()">Salvar metas</button>
    </div>
  </div>`;
}
function repSaveGoals(){
  const c=document.getElementById("goal-concl"),a=document.getElementById("goal-ads");
  repGoals={conclusao:c?plNum(c.value):0,adsPerDay:a?plNum(a.value):0};
  fbSet("config","repgoals",repGoals).then(()=>showToast("Metas salvas")).catch(e=>showToast("Erro ao salvar metas: "+(e.message||""),"error"));
  render();
}
function rRelatorios(){
  const allTasks=visibleTasks();
  const vts=allTasks.filter(t=>inRepRange(repRefDate(t)));
  const tot=vts.length,dn=vts.filter(t=>t.status==="done").length;
  const alta=vts.filter(t=>t.pri==="alta"&&t.status!=="done").length;
  const overdue=allTasks.filter(t=>isOverdue(t)).length;
  const visEmps=isAdmin()?emps:emps.filter(e=>currentUser&&e.id===currentUser.id);
  const maxV=maxOf(visEmps.map(e=>vts.filter(t=>t.emp===e.id).length));
  const bars=visEmps.map(e=>{
    const a=vts.filter(t=>t.emp===e.id&&t.status==="todo").length;
    const b=vts.filter(t=>t.emp===e.id&&t.status==="doing").length;
    const c=vts.filter(t=>t.emp===e.id&&t.status==="done").length;
    return`<div class="chart-col">
      <div style="display:flex;align-items:flex-end;gap:2px;height:120px">
        ${bar(a,maxV,"#fca5a5",120)}${bar(b,maxV,"#ea580c",120)}${bar(c,maxV,"#4ade80",120)}
      </div>
      <div class="chart-lbl">${e.name.split(" ")[0]}</div>
    </div>`;
  }).join("");
  const stData=[
    {lbl:"A fazer",v:vts.filter(t=>t.status==="todo").length,col:"#94a3b8"},
    {lbl:"Em andamento",v:vts.filter(t=>t.status==="doing").length,col:"#ea580c"},
    {lbl:"Concluído",v:vts.filter(t=>t.status==="done").length,col:"#16a34a"},
  ];
  const svgPie=makePieSVG(stData);
  const pieLegend=stData.map(s=>`<div style="display:flex;align-items:center;gap:6px;margin-top:7px"><div style="width:8px;height:8px;border-radius:2px;background:${s.col}"></div><span style="font-size:11px;color:#64748b">${s.lbl}: <strong>${s.v}</strong></span></div>`).join("");
  const tRows=visEmps.filter(e=>e.role!=="admin").map(e=>{
    const et=vts.filter(t=>t.emp===e.id);
    const a=et.filter(t=>t.status==="todo").length;
    const b=et.filter(t=>t.status==="doing").length;
    const c=et.filter(t=>t.status==="done").length;
    const ov=et.filter(t=>isOverdue(t)).length;
    const p=pct(c,et.length);
    return`<tr>
      <td><div style="display:flex;align-items:center;gap:7px">${avHTML(e,22)}<span style="font-weight:500">${esc(e.name)}</span></div></td>
      <td style="color:#dc2626;font-weight:600">${a}</td>
      <td style="color:#ea580c;font-weight:600">${b}</td>
      <td style="color:#16a34a;font-weight:600">${c}</td>
      <td style="font-weight:800">${et.length}</td>
      <td style="color:${ov>0?"#dc2626":"#94a3b8"};font-weight:700">${ov}</td>
      <td><div style="display:flex;align-items:center;gap:7px"><div style="flex:1;height:5px;background:#f1f5f9;border-radius:3px"><div style="height:5px;background:${e.color};border-radius:3px;width:${p}%"></div></div><span style="font-size:11px;font-weight:700;color:${e.color};min-width:30px">${p}%</span></div></td>
    </tr>`;
  }).join("");
  // Ads metrics: tasks containing "anúncio" or "anuncio" (case-insensitive)
  const adsTasks=vts.filter(isAdTask);
  const adsByEmp=visEmps.filter(e=>e.role!=="admin").map(e=>{
    const list=adsTasks.filter(t=>t.emp===e.id);
    const doneList=list.filter(t=>t.status==="done");
    const progList=list.filter(t=>t.status!=="done");
    const sum=arr=>arr.reduce((s,t)=>s+adQtyOf(t),0);
    return{
      emp:e,
      total:list.length,done:doneList.length,inProgress:progList.length,
      adsTotal:sum(list),adsDone:sum(doneList),adsProgress:sum(progList)
    };
  });
  const totalAds=adsTasks.length;
  const totalAdsDone=adsTasks.filter(t=>t.status==="done").length;
  const totalAdsQtyDone=adsTasks.filter(t=>t.status==="done").reduce((s,t)=>s+adQtyOf(t),0);
  const totalAdsQty=adsTasks.reduce((s,t)=>s+adQtyOf(t),0);
  // Calculate days in range for avg/day metric
  function bizDaysBetween(from,to){return bizDays(from,to).dias;}
  const _rngStart=repRange==="custom"?(repFrom?new Date(repFrom+"T12:00").getTime():Math.min(...allTasks.map(t=>new Date(t.date).getTime()),Date.now())):repRange==="today"?Date.now():repRange==="last7"?Date.now()-6*864e5:repRange==="last30"?Date.now()-29*864e5:repRange==="last90"?Date.now()-89*864e5:Math.min(...allTasks.map(t=>new Date(t.date).getTime()),Date.now());
  const _rngEnd=(repRange==="custom"&&repTo)?new Date(repTo+"T12:00").getTime():Date.now();
  const _rngInfo=bizDays(_rngStart,_rngEnd),rangeDays=_rngInfo.dias,rangeFeriados=_rngInfo.feriados;

  const rangeOpts=[["today","Hoje"],["last7","Últimos 7d"],["last30","Últimos 30d"],["last90","Últimos 90d"],["all","Tudo"]];

  return`
    <div class="range-bar" style="margin-bottom:14px;flex-wrap:wrap">
      <span style="font-size:11px;color:#64748b;margin-right:4px;font-weight:600">📅 PERÍODO DO RELATÓRIO</span>
      ${rangeOpts.map(([k,l])=>`<button class="range-pill${repRange===k?" active":""}" data-reprange="${k}">${l}</button>`).join("")}
      <span class="range-cal${repRange==="custom"?" active":""}" title="Filtrar por data">
        <input type="date" id="rep-from" value="${repFrom}" max="${todayISO()}">
        <span style="color:#94a3b8;font-size:12px">→</span>
        <input type="date" id="rep-to" value="${repTo}" max="${todayISO()}">
      </span>
      <div style="margin-left:auto"><button class="btn-outline" id="export-csv">⬇ Exportar CSV</button></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Total de tarefas</div><div class="stat-value" style="color:#0f172a">${tot}</div></div>
      <div class="stat-card"><div class="stat-label">Taxa de conclusão</div><div class="stat-value" style="color:#16a34a">${pct(dn,tot)}%</div></div>
      <div class="stat-card"><div class="stat-label">Urgentes em aberto</div><div class="stat-value" style="color:#dc2626">${alta}</div></div>
      <div class="stat-card" style="background:${overdue>0?"#fef2f2":"white"};border-color:${overdue>0?"#fecaca":"#e2e8f0"}"><div class="stat-label" style="color:${overdue>0?"#dc2626":"#64748b"}">⚠ Atrasadas</div><div class="stat-value" style="color:#dc2626">${overdue}</div></div>
    </div>
    ${isAdmin()?repGoalsPanel(pct(dn,tot),adsByEmp,rangeDays):""}
    <div class="card-table" style="margin-bottom:14px">
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:14px;font-weight:800;color:#0f172a;letter-spacing:-.01em">📢 Métricas de anúncios</div>
          <div style="font-size:11.5px;color:#64748b;margin-top:2px">Tarefas com "anúncio" no título · ${repRangeLabel()} · <strong style="color:#475569">${rangeDays} dias úteis</strong> (seg–sex)${rangeFeriados>0?` · ${rangeFeriados} feriado${rangeFeriados>1?"s":""} excluído${rangeFeriados>1?"s":""}`:""}</div>
        </div>
        <div style="display:flex;gap:18px;flex-wrap:wrap">
          <div style="text-align:right"><div style="font-size:11px;color:#64748b;font-weight:600">TAREFAS</div><div style="font-size:20px;font-weight:800;color:#0f172a">${totalAdsDone}<span style="font-size:12px;color:#94a3b8;font-weight:600">/${totalAds}</span></div></div>
          <div style="text-align:right;padding-left:18px;border-left:1px solid var(--border)"><div style="font-size:11px;color:#16a34a;font-weight:700">ANÚNCIOS FEITOS</div><div style="font-size:22px;font-weight:800;color:#16a34a">${totalAdsQtyDone}<span style="font-size:12px;color:#86efac;font-weight:600">/${totalAdsQty}</span></div></div>
          ${rangeDays>1?`<div style="text-align:right"><div style="font-size:11px;color:#ea580c;font-weight:600">ANÚNCIOS/DIA</div><div style="font-size:20px;font-weight:800;color:#ea580c">${(totalAdsQtyDone/rangeDays).toFixed(1)}</div></div>`:""}
        </div>
      </div>
      <table>
        <thead><tr><th>Funcionário</th><th>Tarefas concl.</th><th>Em and.</th><th>📢 Anúncios feitos</th><th>Anún. em and.</th><th>Anúncios/dia</th></tr></thead>
        <tbody>
        ${adsByEmp.length===0?'<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px;font-size:12.5px">Nenhum funcionário</td></tr>':adsByEmp.map(a=>`
          <tr>
            <td><div style="display:flex;align-items:center;gap:7px">${avHTML(a.emp,22)}<span style="font-weight:500">${esc(a.emp.name)}</span></div></td>
            <td style="color:#16a34a;font-weight:600">${a.done}<span style="font-size:11px;color:#94a3b8;font-weight:500">/${a.total}</span></td>
            <td style="color:#ea580c;font-weight:600">${a.inProgress}</td>
            <td style="color:#16a34a;font-weight:800;font-size:15px">${a.adsDone}</td>
            <td style="color:#ea580c;font-weight:600">${a.adsProgress}</td>
            <td style="font-weight:800">${repAdsDayCell(a.adsDone/rangeDays)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      <div style="padding:10px 18px;background:#fff7ed;border-top:1px solid var(--border);font-size:11px;color:#9a3412">
        💡 Tarefas com "anúncio" no título entram aqui; a coluna soma a "Qtd. de anúncios" de cada tarefa (sem quantidade, conta 1).
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:14px">
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">Produtividade por funcionário · ${repRangeLabel()}</div>
        <div class="chart-group" style="height:130px">${bars}</div>
        <div class="legend">
          <span><span class="ldot" style="background:#fca5a5"></span>A fazer</span>
          <span><span class="ldot" style="background:#ea580c"></span>Em andamento</span>
          <span><span class="ldot" style="background:#4ade80"></span>Concluído</span>
        </div>
      </div>
      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px">Por status</div>
        ${svgPie}${pieLegend}
      </div>
    </div>
    <div class="card-table">
      <div style="padding:12px 18px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700">Detalhe por funcionário</div>
      <table><thead><tr><th>Funcionário</th><th>A fazer</th><th>Em and.</th><th>Concluído</th><th>Total</th><th>Atrasadas</th><th>% Concluído</th></tr></thead>
      <tbody>${tRows}</tbody></table>
    </div>`;
}

// ─── PROMOÇÕES ────────────────────────────────────────────────────────
const PROMO_TYPES=["Promoção de Desconto","Leve Mais por Menos"];

function promoUrgency(p){
  if(p.status==="renewed")return{cls:"",lbl:"Renovada",col:"#16a34a",bg:"#dcfce7"};
  if(p.status==="expired")return{cls:"expired",lbl:"Expirada",col:"#64748b",bg:"#f1f5f9"};
  const d=daysUntil(p.end);
  if(d<0)return{cls:"urg-red",lbl:`Vencida ${Math.abs(d)}d`,col:"#dc2626",bg:"#fee2e2"};
  if(d===0)return{cls:"urg-red",lbl:"Hoje!",col:"#dc2626",bg:"#fee2e2"};
  if(d===1)return{cls:"urg-red",lbl:"Amanhã",col:"#dc2626",bg:"#fee2e2"};
  if(d<=3)return{cls:"urg-orange",lbl:`Em ${d}d`,col:"#ea580c",bg:"#ffedd5"};
  if(d<=7)return{cls:"urg-amber",lbl:`Em ${d}d`,col:"#d97706",bg:"#fef3c7"};
  return{cls:"urg-green",lbl:`Em ${d}d`,col:"#16a34a",bg:"#dcfce7"};
}

function rPromos(){
  const vps=visibleProms();
  // Stats
  const active=vps.filter(p=>p.status==="active").length;
  const urgent=vps.filter(p=>p.status==="active"&&daysUntil(p.end)<=2).length;
  const weekly=vps.filter(p=>p.status==="active"&&daysUntil(p.end)>=0&&daysUntil(p.end)<=7).length;
  const expired=vps.filter(p=>p.status==="active"&&daysUntil(p.end)<0).length;
  // Sort by end date asc, active first
  const sorted=[...vps].sort((a,b)=>{
    const sa=a.status==="active"?0:1,sb=b.status==="active"?0:1;
    if(sa!==sb)return sa-sb;
    return a.end.localeCompare(b.end);
  });
  const cards=sorted.length===0
    ?`<div style="background:white;border-radius:12px;padding:40px;text-align:center;color:#94a3b8;font-size:13px">Nenhuma promoção cadastrada.</div>`
    :sorted.map(p=>{
      const e=getEmp(p.emp),c=getCli(p.cli);
      const u=promoUrgency(p);
      const d=daysUntil(p.end);
      const showRenew=p.status==="active"&&d<=7;
      return`<div class="promo-card ${u.cls}">
        <div class="promo-time" style="background:${u.bg};color:${u.col}">
          <div class="promo-time-big">${d<0?Math.abs(d):d}</div>
          <div class="promo-time-lbl">${d<0?"dias atrás":d===0?"HOJE":d===1?"AMANHÃ":"dias"}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="font-size:14px;font-weight:700;color:#0f172a">${esc(p.name)}</span>
            <span class="badge" style="background:${u.bg};color:${u.col}">${u.lbl}</span>
          </div>
          <div style="font-size:12px;color:#64748b;margin-bottom:5px">
            🏪 <strong>${c?esc(c.name):"—"}</strong> · ${esc(p.type)} · expira ${fmtDate(p.end)}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            ${avHTML(e,18)}
            <span style="font-size:11px;color:#94a3b8">${e?esc(e.name):"—"}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${showRenew?`<button class="btn-renew" data-renew="${p.id}">✓ Renovar/Duplicada</button>`:""}
          <div style="display:flex;gap:4px;justify-content:flex-end">
            <button data-eprm="${p.id}" style="background:none;border:none;color:#94a3b8;font-size:14px;padding:2px 5px">✎</button>
            <button data-dprm="${p.id}" style="background:none;border:none;color:#fca5a5;font-size:14px;padding:2px 5px">✕</button>
          </div>
        </div>
      </div>`;
    }).join("");
  return`
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:12.5px;color:#9a3412;line-height:1.5">
      💡 <strong>Como funciona:</strong> Cadastre cada promoção/ferramenta ativa nas suas lojas Shopee com a data de expiração. Quando faltarem poucos dias para vencer, a promo aparece em <strong>destaque</strong> aqui com o botão de renovar. Clique em <strong>"Renovar/Duplicada"</strong> após renovar para registrar.
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">Ativas</div><div class="stat-value" style="color:#0f172a">${active}</div></div>
      <div class="stat-card" style="background:${urgent>0?"#fef2f2":"white"};border-color:${urgent>0?"#fecaca":"#e2e8f0"}"><div class="stat-label" style="color:${urgent>0?"#dc2626":"#64748b"}">🔴 Urgentes (≤2d)</div><div class="stat-value" style="color:#dc2626">${urgent}</div></div>
      <div class="stat-card"><div class="stat-label">Esta semana</div><div class="stat-value" style="color:#ea580c">${weekly}</div></div>
      <div class="stat-card"><div class="stat-label">Vencidas</div><div class="stat-value" style="color:#94a3b8">${expired}</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
      <button class="btn-primary" id="new-promo-btn">+ Nova Promoção</button>
    </div>
    ${cards}`;
}

function openPromoForm(promId){
  const p=promId?proms.find(x=>x.id===promId):null;
  const cOpts=clis.map(c=>`<option value="${c.id}"${p&&p.cli===c.id?" selected":""}>${esc(c.name)} (${esc(c.mkt)})</option>`).join("");
  const eOpts=emps.map(e=>`<option value="${e.id}"${p?p.emp===e.id?" selected":"":currentUser&&currentUser.id===e.id?" selected":""}>${esc(e.name)}</option>`).join("");
  const tOpts=PROMO_TYPES.map(t=>`<option${p&&p.type===t?" selected":""}>${esc(t)}</option>`).join("");
  const formHTML=`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:14px;font-weight:700">${p?"Editar promoção":"Nova promoção"}</span>
      <button id="pf-close" style="background:none;border:none;color:#94a3b8;font-size:18px">✕</button>
    </div>
    <input id="pf-name" class="finput" placeholder="Nome da promoção (ex: Cupom 10% OFF)" value="${p?esc(p.name):""}" style="margin-bottom:10px;font-size:14px;font-weight:500"/>
    <div class="form-row" style="grid-template-columns:1fr 1fr 1fr">
      <div class="form-group"><label>Loja</label><select id="pf-cli" class="finput" data-search data-placeholder="🔍 Buscar loja...">${cOpts}</select></div>
      <div class="form-group"><label>Tipo de ferramenta</label><select id="pf-type" class="finput">${tOpts}</select></div>
      <div class="form-group"><label>Responsável</label><select id="pf-emp" class="finput">${eOpts}</select></div>
    </div>
    <div class="form-row" style="grid-template-columns:auto 1fr">
      <div class="form-group"><label>⏰ Data de expiração</label><input type="date" id="pf-end" class="finput" value="${p?p.end:daysAhead(7)}"/></div>
      ${p?`<div class="form-group"><label>Status</label><select id="pf-status" class="finput">
        <option value="active"${p.status==="active"?" selected":""}>Ativa</option>
        <option value="renewed"${p.status==="renewed"?" selected":""}>Renovada</option>
        <option value="expired"${p.status==="expired"?" selected":""}>Expirada</option>
      </select></div>`:""}
    </div>
    <div class="form-actions">
      <button id="pf-cancel" class="btn-sm">Cancelar</button>
      <button id="pf-save" class="btn-primary">${p?"Salvar":"Cadastrar"}</button>
    </div>
  </div>`;
  showFormModal(formHTML);
  document.getElementById("pf-close").onclick=document.getElementById("pf-cancel").onclick=closeFormModal;
  document.getElementById("pf-save").onclick=async()=>{
    const name=document.getElementById("pf-name").value.trim();
    if(!name){showToast("Informe o nome da promoção","error");return;}
    const obj={
      id:promId||uid(),
      name,
      cli:document.getElementById("pf-cli").value,
      type:document.getElementById("pf-type").value,
      emp:document.getElementById("pf-emp").value,
      end:document.getElementById("pf-end").value,
      status:promId?document.getElementById("pf-status").value:"active",
      taskId:p?p.taskId:""
    };
    closeFormModal();
    try{
      const{id,...patch}=obj;
      if(promId){await fbSet("promos",promId,patch);}
      else{await fbAdd("promos",patch);}
      showToast(promId?"Promoção atualizada":"Promoção cadastrada");
    }catch(e){showToast("Erro: "+(e.message||""),"error");}
  };
}

async function renewPromo(id){
  const p=proms.find(x=>x.id===id);
  if(!p)return;
  showRenewModal(p);
}

function showRenewModal(p){
  const cli=getCli(p.cli);
  const presets=[
    {days:7,label:"7 dias"},
    {days:15,label:"15 dias"},
    {days:30,label:"30 dias",default:true},
    {days:60,label:"60 dias"},
    {days:90,label:"90 dias"},
  ];
  const defaultDate=(()=>{const d=new Date();d.setDate(d.getDate()+30);return d.toISOString().slice(0,10);})();
  const formHTML=`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:14px;font-weight:700">🎯 Confirmar duplicação</span>
      <button id="rn-close" style="background:none;border:none;color:#94a3b8;font-size:18px">✕</button>
    </div>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:12.5px;color:#9a3412;line-height:1.5">
      <strong>${esc(p.name)}</strong> · ${esc(p.type)}<br/>
      Loja: ${cli?esc(cli.name):"—"} · expira ${fmtDate(p.end)}<br/>
      <span style="font-size:11.5px;color:#c2410c">A promo atual será marcada como renovada e uma nova será criada com a duração que você escolher abaixo.</span>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label style="margin-bottom:8px;display:block">⏱️ Quanto tempo a nova promoção vai durar?</label>
      <div id="rn-presets" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
        ${presets.map(pr=>`<button type="button" class="rn-preset${pr.default?" active":""}" data-days="${pr.days}">${pr.label}</button>`).join("")}
      </div>
    </div>
    <div class="form-group">
      <label>📅 Ou data de expiração específica</label>
      <input type="date" id="rn-date" class="finput" value="${defaultDate}" style="width:auto"/>
    </div>
    <div class="form-actions">
      <button id="rn-cancel" class="btn-sm">Cancelar</button>
      <button id="rn-confirm" class="btn-primary">✓ Confirmar duplicação</button>
    </div>
  </div>`;
  showFormModal(formHTML);
  document.getElementById("rn-close").onclick=document.getElementById("rn-cancel").onclick=closeFormModal;
  // Preset buttons update date
  document.querySelectorAll(".rn-preset").forEach(btn=>{
    btn.onclick=()=>{
      document.querySelectorAll(".rn-preset").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const days=+btn.dataset.days;
      const d=new Date();d.setDate(d.getDate()+days);
      document.getElementById("rn-date").value=d.toISOString().slice(0,10);
    };
  });
  // Manual date clears preset selection
  document.getElementById("rn-date").onchange=()=>{
    document.querySelectorAll(".rn-preset").forEach(b=>b.classList.remove("active"));
  };
  document.getElementById("rn-confirm").onclick=async()=>{
    const newEnd=document.getElementById("rn-date").value;
    if(!newEnd){showToast("Selecione uma data válida","error");return;}
    closeFormModal();
    try{
      const batch=window.fb.writeBatch(window.fb.db);
      batch.update(window.fb.doc(window.fb.db,"promos",p.id),{status:"renewed"});
      const newRef=window.fb.doc(window.fb.collection(window.fb.db,"promos"));
      batch.set(newRef,{id:newRef.id,cli:p.cli,emp:p.emp,name:p.name,type:p.type,end:newEnd,status:"active",taskId:""});
      if(p.taskId&&tsks.some(t=>t.id===p.taskId)){batch.update(window.fb.doc(window.fb.db,"tasks",p.taskId),{status:"done"});}
      await batch.commit();
      const days=Math.round((new Date(newEnd)-new Date(todayISO()))/(24*3600*1000));
      showToast(`✓ Promo duplicada · nova expira em ${days} dia${days!==1?"s":""}`);
    }catch(e){showToast("Erro: "+(e.message||""),"error");}
  };
}

