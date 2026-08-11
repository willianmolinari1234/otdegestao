// ─── FORMS ────────────────────────────────────────────────────────────
function openTaskView(taskId){
  const t=tsks.find(x=>x.id===taskId);
  if(!t){showToast("Tarefa não encontrada","error");return;}
  const e=getEmp(t.emp),c=getCliV(t);
  const cu=c&&c.custId?getCust(c.custId):null;
  const di=deadlineInfo(t);
  const canEdit=isAdmin()||(currentUser&&t.emp===currentUser.id);
  const row=(label,value)=>`<div style="display:flex;gap:14px;padding:11px 0;border-bottom:1px solid #f1f5f9">
      <div style="font-size:11px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:.5px;width:120px;flex-shrink:0;padding-top:2px">${label}</div>
      <div style="font-size:13.5px;color:#0f172a;flex:1;line-height:1.5">${value}</div>
    </div>`;
  const html=`<div class="form-panel" style="padding:24px 28px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px">
      <div style="flex:1">
        <div style="font-size:10.5px;color:var(--brand);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">👁 Detalhes da tarefa</div>
        <div style="font-size:19px;font-weight:800;color:#0f172a;line-height:1.3;letter-spacing:-.01em">${esc(t.title)}</div>
      </div>
      <button id="tv-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
      ${stB(t.status)}
      ${priB(t.pri)}
      <span class="deadline" style="background:${di.bg};color:${di.color};font-size:11.5px;padding:3px 9px">${di.label}</span>
    </div>
    ${t.desc?`<div style="background:#f8fafc;border-radius:10px;padding:14px 16px;margin-bottom:18px;font-size:13.5px;color:#334155;line-height:1.6;white-space:pre-wrap">${esc(t.desc)}</div>`
            :`<div style="font-size:12.5px;color:#cbd5e1;font-style:italic;margin-bottom:18px">Sem descrição.</div>`}
    <div style="border-top:1px solid #f1f5f9">
      ${row("Funcionário", e?`<div style="display:flex;align-items:center;gap:9px">${avHTML(e,26)}<span>${esc(e.name)}</span></div>`:'<span style="color:#94a3b8">—</span>')}
      ${row("Loja", c?`<span>${esc(c.name)}</span><span style="font-size:11.5px;color:#94a3b8;margin-left:8px">${esc(c.mkt||"")}</span>`:'<span style="color:#94a3b8">—</span>')}
      ${cu?row("Cliente proprietário", `👤 ${esc(cu.name)}`):""}
      ${isAdTask(t)?row("📢 Anúncios", `<span style="font-weight:700;color:#16a34a">${adQtyOf(t)}</span> anúncio${adQtyOf(t)!==1?"s":""}`):""}
      ${row("Prazo", `${fmtDate(t.date)}${di.overdue?` <span style="color:#dc2626;font-weight:700;margin-left:6px">· ${di.label}</span>`:""}`)}
    </div>
    <div class="form-actions" style="margin-top:22px">
      <button id="tv-close-btn" class="btn-sm">Fechar</button>
      ${canEdit?`<button id="tv-edit" class="btn-primary">✎ Editar tarefa</button>`:""}
    </div>
  </div>`;
  showFormModal(html);
  document.getElementById("tv-close").onclick=document.getElementById("tv-close-btn").onclick=closeFormModal;
  const eb=document.getElementById("tv-edit");
  if(eb)eb.onclick=()=>{closeFormModal();setTimeout(()=>openTaskForm(taskId),120);};
}

function openTaskForm(taskId){
  const t=taskId?tsks.find(x=>x.id===taskId):null;
  // Non-admin can only assign tasks to themselves
  const empList=isAdmin()?emps:emps.filter(e=>currentUser&&e.id===currentUser.id);
  const eOpts=empList.map(e=>`<option value="${e.id}"${(t&&t.emp===e.id)||(!t&&currentUser&&e.id===currentUser.id)?" selected":""}>${esc(e.name)}</option>`).join("");
  const cOpts=`<option value="all"${(t&&t.cli==="all")||!t?" selected":""}>🏪 Todas as lojas</option>`+clis.map(c=>`<option value="${c.id}"${t&&t.cli===c.id?" selected":""}>${esc(c.name)}</option>`).join("");
  const tplHTML=!t?`<div class="templates">
    <div class="tpl-label">⚡ Modelos rápidos · clique para preencher</div>
    ${TPL.map((tp,i)=>`<button class="tpl-btn" data-tpl="${i}">${esc(tp.title)}</button>`).join("")}
  </div>`:"";
  const formHTML=`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:14px;font-weight:700">${t?"Editar tarefa":"Nova tarefa"}</span>
      <button id="tf-close" style="background:none;border:none;color:#94a3b8;font-size:18px">✕</button>
    </div>
    ${tplHTML}
    <input id="tf-title" class="finput" placeholder="Título da tarefa *" value="${t?esc(t.title):""}" style="margin-bottom:10px;font-size:14px;font-weight:500"/>
    <textarea id="tf-desc" class="finput" rows="2" placeholder="Descrição (opcional)" style="margin-bottom:10px;resize:vertical">${t?esc(t.desc||""):""}</textarea>
    <div class="form-row">
      <div class="form-group"><label>Funcionário</label><select id="tf-emp" class="finput">${eOpts}</select></div>
      <div class="form-group"><label>Cliente</label><select id="tf-cli" class="finput" data-search data-placeholder="🔍 Buscar loja...">${cOpts}</select></div>
      <div class="form-group"><label>Status</label><select id="tf-status" class="finput">
        <option value="todo"${!t||t.status==="todo"?" selected":""}>A fazer</option>
        <option value="doing"${t&&t.status==="doing"?" selected":""}>Em andamento</option>
        <option value="done"${t&&t.status==="done"?" selected":""}>Concluído</option>
      </select></div>
      <div class="form-group"><label>Prioridade</label><select id="tf-pri" class="finput">
        <option value="alta"${t&&t.pri==="alta"?" selected":""}>Alta</option>
        <option value="media"${!t||t.pri==="media"?" selected":""}>Média</option>
        <option value="baixa"${t&&t.pri==="baixa"?" selected":""}>Baixa</option>
      </select></div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="form-group" style="margin-bottom:0"><label>⏰ Prazo</label><input type="date" id="tf-date" class="finput" value="${t?t.date:todayISO()}" style="width:auto"/></div>
      <div class="form-group" style="margin-bottom:0"><label>📢 Qtd. de anúncios <span style="color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0">(0 = não é anúncio)</span></label><input type="number" min="0" id="tf-qty" class="finput" value="${t&&t.qty!=null&&t.qty!==''?esc(String(t.qty)):''}" placeholder="0" style="width:120px"/></div>
    </div>
    <div class="form-actions">
      <button id="tf-cancel" class="btn-sm">Cancelar</button>
      <button id="tf-save" class="btn-primary">${t?"Salvar alterações":"Criar tarefa"}</button>
    </div>
  </div>`;
  showFormModal(formHTML);
  document.getElementById("tf-close").onclick=document.getElementById("tf-cancel").onclick=closeFormModal;
  // Auto-detect ad quantity from the title (only fills when qty field is empty, so manual edits are never overwritten)
  const titleEl=document.getElementById("tf-title");
  const qtyEl=document.getElementById("tf-qty");
  let qtyTouched=!!(t&&t.qty!=null&&t.qty!=="");
  if(qtyEl)qtyEl.addEventListener("input",()=>{qtyTouched=true;});
  function maybeAutofillQty(){
    if(qtyTouched||!qtyEl||!titleEl)return;
    if(!ADS_RE.test(titleEl.value))return;
    const n=extractAdQty(titleEl.value);
    if(n>0)qtyEl.value=String(n);
  }
  if(titleEl)titleEl.addEventListener("input",maybeAutofillQty);
  // Template clicks
  document.querySelectorAll("#form-modal-content [data-tpl]").forEach(btn=>{
    btn.onclick=()=>{
      const tp=TPL[+btn.dataset.tpl];
      document.getElementById("tf-title").value=tp.title;
      document.getElementById("tf-desc").value=tp.desc||"";
      document.getElementById("tf-pri").value=tp.pri;
      maybeAutofillQty();
    };
  });
  document.getElementById("tf-save").onclick=async()=>{
    const title=document.getElementById("tf-title").value.trim();
    if(!title){showToast("Informe o título da tarefa","error");return;}
    const qtyRaw=document.getElementById("tf-qty").value;
    const qty=qtyRaw===""?null:Math.max(0,parseInt(qtyRaw,10)||0);
    const obj={id:taskId||uid(),title,desc:document.getElementById("tf-desc").value.trim(),emp:document.getElementById("tf-emp").value,cli:document.getElementById("tf-cli").value,status:document.getElementById("tf-status").value,pri:document.getElementById("tf-pri").value,date:document.getElementById("tf-date").value,qty:qty};
    closeFormModal();
    try{
      if(taskId){
        const{id,...patch}=obj;
        const _prev=tsks.find(t=>t.id===taskId);
        setDoneDate(_prev,patch.status,patch);
        await fbSet("tasks",taskId,patch);
      }else{
        const _add={title:obj.title,desc:obj.desc,emp:obj.emp,cli:obj.cli,status:obj.status,pri:obj.pri,date:obj.date,qty:obj.qty};
        setDoneDate(null,obj.status,_add);
        await fbAdd("tasks",_add);
      }
      showToast(taskId?"Tarefa atualizada":"Tarefa criada");
    }catch(e){showToast("Erro: "+(e.message||"falha ao salvar"),"error");}
  };
}

// Aceita "8%", "7,5%" ou "8" e devolve número (os campos do cliente são texto).
function pctNum(v){
  if(v===undefined||v===null||v==="")return null;
  const n=Number(String(v).replace("%","").replace(",",".").trim());
  return isFinite(n)?n:null;
}

function openClientForm(clientId){
  const c=clientId?clis.find(x=>x.id===clientId):null;
  // Percentuais herdados do cliente proprietário, só para mostrar no campo.
  const dono=c&&c.custId?custs.find(x=>x.id===c.custId):null;
  const herdado={fee:dono?pctNum(dono.fee):null,imposto:dono?pctNum(dono.imposto):null};
  const mOpts=MKTS.map(m=>`<option${c&&c.mkt===m?" selected":""}>${esc(m)}</option>`).join("");
  const cuOpts=custs.map(cu=>`<option value="${cu.id}"${c&&c.custId===cu.id?" selected":""}>${esc(cu.name)}</option>`).join("");
  const acc=c&&c.access?c.access:{url:"",user:"",pass:"",notes:""};
  const formHTML=`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:14px;font-weight:700">${c?"Editar loja":"Nova loja"}</span>
      <button id="cf-close" style="background:none;border:none;color:#94a3b8;font-size:18px">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr 2fr;gap:10px;margin-bottom:12px">
      <div class="form-group"><label>Nome da loja</label><input id="cf-name" class="finput" placeholder="Ex: Diamond Tricot" value="${c?esc(c.name):""}"/></div>
      <div class="form-group"><label>Marketplace</label><select id="cf-mkt" class="finput">${mOpts}</select></div>
      <div class="form-group"><label>👤 Cliente (proprietário)</label>
        <div style="display:flex;gap:5px">
          <select id="cf-cust" class="finput" style="flex:1" data-search data-placeholder="🔍 Buscar cliente..."><option value="">— Sem cliente —</option>${cuOpts}</select>
          <button type="button" id="cf-new-cust" class="btn-sm" title="Novo cliente">+</button>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px;max-width:540px">
      <div class="form-group">
        <label>💰 Comissão (%) <span style="color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0">— exceção desta loja</span></label>
        <input id="cf-comissao" class="finput" type="number" step="0.1" min="0" max="100"
               placeholder="${herdado.fee!==null?`herda ${herdado.fee}% do cliente`:"herda 2% (padrão)"}"
               value="${c&&c.comissao!==undefined&&c.comissao!==null&&c.comissao!==""?esc(String(c.comissao)):""}"/>
      </div>
      <div class="form-group">
        <label>🧾 Imposto (%) <span style="color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0">— exceção desta loja</span></label>
        <input id="cf-imposto" class="finput" type="number" step="0.1" min="0" max="100"
               placeholder="${herdado.imposto!==null?`herda ${herdado.imposto}% do cliente`:"herda 0% (não deduz)"}"
               value="${c&&c.imposto!==undefined&&c.imposto!==null&&c.imposto!==""?esc(String(c.imposto)):""}"/>
      </div>
    </div>
    <div style="font-size:11.5px;color:#64748b;margin-bottom:12px;max-width:540px">
      Deixe em branco para usar o percentual do <strong>cliente proprietário</strong>
      (definido em Clientes → Acesso). Preencha apenas se esta loja tiver condição diferente.
    </div>
    <div class="form-group" style="margin-bottom:12px;max-width:320px">
      <label>📅 Base de cobrança <span style="color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0">— só afeta o relatório do cliente</span></label>
      <select id="cf-base" class="finput">
        <option value="mes"${!c||c.baseCobranca!=="ultimos30"?" selected":""}>Mês fechado (1º ao último dia)</option>
        <option value="ultimos30"${c&&c.baseCobranca==="ultimos30"?" selected":""}>Últimos 30 dias</option>
      </select>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>🛒 Username Shopee <span style="color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0">(usado pela extensão de importação automática)</span></label>
      <input id="cf-shopee-user" class="finput" placeholder="ex: azure.tricot, continentalbones" value="${c&&c.shopeeUsername?esc(c.shopeeUsername):""}"/>
    </div>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px 14px">
      <div style="font-size:11.5px;font-weight:700;color:#9a3412;margin-bottom:8px;text-transform:uppercase;letter-spacing:.4px">🔑 Informações de acesso</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div class="form-group"><label>Link da loja</label><input id="cf-acc-url" class="finput" placeholder="https://shopee.com.br/..." value="${esc(acc.url||"")}"/></div>
        <div class="form-group"><label>Usuário / e-mail</label><input id="cf-acc-user" class="finput" placeholder="Login da conta" value="${esc(acc.user||"")}"/></div>
        <div class="form-group"><label>Senha</label><input type="text" id="cf-acc-pass" class="finput" placeholder="Senha" value="${esc(acc.pass||"")}"/></div>
      </div>
      <div class="form-group"><label>Observações (PIN, 2FA, recuperação, etc.)</label><textarea id="cf-acc-notes" class="finput" rows="2" style="resize:vertical">${esc(acc.notes||"")}</textarea></div>
    </div>
    <div class="form-actions">
      <button id="cf-cancel" class="btn-sm">Cancelar</button>
      <button id="cf-save" class="btn-primary">${c?"Salvar":"Cadastrar"}</button>
    </div>
  </div>`;
  showFormModal(formHTML);
  document.getElementById("cf-close").onclick=document.getElementById("cf-cancel").onclick=closeFormModal;
  document.getElementById("cf-new-cust").onclick=()=>{
    const snap={
      name:document.getElementById("cf-name").value,
      mkt:document.getElementById("cf-mkt").value,
      shopeeUser:document.getElementById("cf-shopee-user").value,
      url:document.getElementById("cf-acc-url").value,
      user:document.getElementById("cf-acc-user").value,
      pass:document.getElementById("cf-acc-pass").value,
      notes:document.getElementById("cf-acc-notes").value,
    };
    askInput({
      title:"Novo cliente",
      message:"O cliente será adicionado e selecionado para esta loja automaticamente.",
      placeholder:"Ex: João Silva",
      okLabel:"Adicionar",
      icon:"+",
      onOk:async(nm)=>{
        try{
          const newId=await fbAdd("customers",{name:nm});
          openClientForm(clientId);
          setTimeout(()=>{
            if(document.getElementById("cf-name")){
              document.getElementById("cf-name").value=snap.name;
              document.getElementById("cf-mkt").value=snap.mkt;
              document.getElementById("cf-cust").value=newId;
              document.getElementById("cf-shopee-user").value=snap.shopeeUser||"";
              document.getElementById("cf-acc-url").value=snap.url;
              document.getElementById("cf-acc-user").value=snap.user;
              document.getElementById("cf-acc-pass").value=snap.pass;
              document.getElementById("cf-acc-notes").value=snap.notes;
            }
          },100);
          showToast("Cliente cadastrado");
        }catch(e){showToast("Erro: "+(e.message||""),"error");}
      }
    });
  };
  document.getElementById("cf-save").onclick=async()=>{
    const name=document.getElementById("cf-name").value.trim();
    if(!name){showToast("Informe o nome da loja","error");return;}
    const obj={
      id:clientId||uid(),
      name,
      mkt:document.getElementById("cf-mkt").value,
      custId:document.getElementById("cf-cust").value||"",
      // % de comissão da OTDE sobre o faturamento desta loja.
      // Vazio = usa o padrão do sistema (2%).
      comissao:(()=>{const v=document.getElementById("cf-comissao").value.trim();
                     return v===""?null:Math.max(0,Math.min(100,Number(v)));})(),
      // Imposto sobre o faturamento da loja (ex.: Simples Nacional).
      // Vazio = não deduz nada.
      imposto:(()=>{const v=document.getElementById("cf-imposto").value.trim();
                    return v===""?null:Math.max(0,Math.min(100,Number(v)));})(),
      // Base usada na COBRANÇA deste cliente. O relatório mensal consolidado
      // continua sempre por mês fechado, independente desta escolha.
      baseCobranca:document.getElementById("cf-base").value,
      shopeeUsername:document.getElementById("cf-shopee-user").value.trim().toLowerCase(),
      access:{
        url:document.getElementById("cf-acc-url").value.trim(),
        user:document.getElementById("cf-acc-user").value.trim(),
        pass:document.getElementById("cf-acc-pass").value,
        notes:document.getElementById("cf-acc-notes").value.trim(),
      }
    };
    closeFormModal();
    try{
      const{id,...patch}=obj;
      if(clientId){await fbSet("clients",clientId,patch);}
      else{await fbAdd("clients",patch);}
      showToast(clientId?"Loja atualizada":"Loja cadastrada");
    }catch(e){showToast("Erro: "+(e.message||""),"error");}
  };
}

let selColor=COLORS[0];
function openEmployeeForm(empId){
  const e=empId?emps.find(x=>x.id===empId):null;
  if(e)selColor=e.color;
  const colBtns=COLORS.map((c,i)=>`<button data-ci="${i}" data-cc="${c}" style="width:26px;height:26px;border-radius:50%;background:${c};border:${c===selColor?"3px solid #0f172a":"2px solid transparent"};cursor:pointer"></button>`).join("");
  const helpText=e
    ?`<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:11.5px;color:#9a3412;line-height:1.5">ℹ️ <strong>E-mail e senha não podem ser alterados aqui.</strong> Para mudar a senha, o funcionário pode usar "Esqueci minha senha" na tela de login.</div>`
    :`<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:11.5px;color:#9a3412;line-height:1.5">📧 <strong>Como funciona:</strong> Cadastre o e-mail e uma senha provisória. Repasse essas credenciais para o funcionário, que poderá trocar a senha depois usando "Esqueci minha senha".</div>`;
  const formHTML=`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <span style="font-size:14px;font-weight:700">${e?"Editar funcionário":"Novo funcionário"}</span>
      <button id="ef-close" style="background:none;border:none;color:#94a3b8;font-size:18px">✕</button>
    </div>
    ${helpText}
    <div class="form-row" style="grid-template-columns:2fr 2fr 1fr">
      <div class="form-group"><label>Nome completo</label><input id="ef-name" class="finput" placeholder="Ex: Maria Silva" value="${e?esc(e.name):""}"/></div>
      <div class="form-group"><label>E-mail ${e?"(não editável)":""}</label><input id="ef-email" type="email" class="finput" placeholder="email@exemplo.com" value="${e&&e.email?esc(e.email):""}" ${e?"disabled style=opacity:.6;cursor:not-allowed":""}/></div>
      <div class="form-group"><label>Tipo</label><select id="ef-role" class="finput">
        <option value="emp"${!e||e.role==="emp"?" selected":""}>Funcionário</option>
        <option value="admin"${e&&e.role==="admin"?" selected":""}>Administrador</option>
      </select></div>
    </div>
    ${e?"":`<div class="form-group" style="margin-bottom:12px"><label>Senha provisória (mín. 6 caracteres)</label><input type="password" id="ef-pass" class="finput" placeholder="Senha temporária"/></div>`}
    <div class="form-group"><label>Cor do avatar</label><div id="color-row" style="display:flex;gap:6px;padding-top:3px">${colBtns}</div></div>
    <div class="form-actions">
      <button id="ef-cancel" class="btn-sm">Cancelar</button>
      <button id="ef-save" class="btn-primary">${e?"Salvar":"Adicionar"}</button>
    </div>
  </div>`;
  showFormModal(formHTML);
  document.getElementById("color-row").addEventListener("click",ev=>{
    const btn=ev.target.closest("button[data-cc]");if(!btn)return;
    selColor=btn.dataset.cc;
    document.querySelectorAll("#color-row button").forEach(b=>{b.style.border=b.dataset.cc===selColor?"3px solid #0f172a":"2px solid transparent";});
  });
  document.getElementById("ef-close").onclick=document.getElementById("ef-cancel").onclick=closeFormModal;
  document.getElementById("ef-save").onclick=async()=>{
    const name=document.getElementById("ef-name").value.trim();
    const role=document.getElementById("ef-role").value;
    if(!name){showToast("Informe o nome do funcionário","error");return;}
    const ini=name.split(" ").slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"?";
    if(e){
      // Edit existing — only update name, color, role, ini
      try{
        await fbUpdate("employees",e.id,{name,ini,color:selColor,role});
        closeFormModal();
        showToast("Funcionário atualizado");
      }catch(err){showToast("Erro: "+(err.message||""),"error");}
    }else{
      // Create new employee with Firebase Auth + Firestore
      const email=document.getElementById("ef-email").value.trim().toLowerCase();
      const pass=document.getElementById("ef-pass").value;
      if(!email){showToast("Informe o e-mail","error");return;}
      if(pass.length<8){showToast("Senha deve ter ao menos 8 caracteres","error");return;}
      if(SEM_BACKEND)return backendIndisponivel();
      const saveBtn=document.getElementById("ef-save");
      saveBtn.disabled=true;saveBtn.textContent="Criando...";
      try{
        // A conta é criada pelo BACKEND (Admin SDK), que valida se quem pede
        // é admin. Nada de criar usuário pelo navegador nem trocar de sessão.
        const tk=await window.fb.auth.currentUser.getIdToken();
        const r=await fetch(`${FN_BASE}/criarFuncionario`,{
          method:"POST",
          headers:{Authorization:"Bearer "+tk,"Content-Type":"application/json"},
          body:JSON.stringify({nome:name,email,senha:pass,cor:selColor,papel:role}),
        });
        const j=await r.json();
        if(!r.ok)throw new Error(j.erro||"falha ao criar");
        closeFormModal();
        showToast(`✓ ${name} cadastrado · repasse o login: ${email}`);
      }catch(err){
        showToast("Erro: "+(err.message||""),"error");
        saveBtn.disabled=false;saveBtn.textContent="Adicionar";
      }
    }
  };
}

// ─── FORM MODAL ───────────────────────────────────────────────────────
function showFormModal(html){
  const mask=document.getElementById("form-modal-mask");
  const box=document.getElementById("form-modal-content");
  box.innerHTML=html;
  enhanceSearchSelects(box);
  mask.classList.add("show");
  document.body.style.overflow="hidden";
  // Bind backdrop click to close
  mask.onclick=e=>{if(e.target===mask)closeFormModal();};
  // Auto-focus first input
  setTimeout(()=>{
    const inp=box.querySelector("input:not([type=hidden]),textarea,select");
    if(inp){inp.focus();if(inp.select)inp.select();}
  },120);
}
function closeFormModal(){
  const mask=document.getElementById("form-modal-mask");
  mask.classList.remove("show");
  document.getElementById("form-modal-content").innerHTML="";
  document.body.style.overflow="";
  mask.onclick=null;
}


// ─── SEARCHABLE SELECT — combobox with type-to-filter ──────────────────
function enhanceSearchSelects(container){
  container = container || document;
  container.querySelectorAll("select[data-search]:not([data-ss-done])").forEach(sel=>{
    sel.setAttribute("data-ss-done","1");
    const opts = Array.from(sel.options).map(o=>({value:o.value,text:o.textContent}));
    const findOpt = v => opts.find(o=>o.value===v);
    const placeholder = sel.dataset.placeholder || "Buscar...";

    const wrap = document.createElement("div");
    wrap.className = "ss-wrap";
    // Inherit flex/width sizing from the original select so adjacent buttons stay inline
    if(sel.style.flex){ wrap.style.flex = sel.style.flex; wrap.style.width = "auto"; }
    wrap.innerHTML =
      `<input class="ss-input finput" placeholder="${esc(placeholder)}" readonly autocomplete="off"/>`+
      `<span class="ss-chev">▾</span>`+
      `<div class="ss-list" hidden></div>`;

    sel.style.display = "none";
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    wrap._sel = sel; // referência usada pelo fechamento global (clique fora)

    const input = wrap.querySelector(".ss-input");
    const list  = wrap.querySelector(".ss-list");

    function renderList(query){
      const q = (query||"").toLowerCase().trim();
      const filtered = q
        ? opts.filter(o => o.text.toLowerCase().includes(q))
        : opts.slice();
      if(filtered.length === 0){
        list.innerHTML = `<div class="ss-empty">Nenhum resultado</div>`;
        return;
      }
      list.innerHTML = filtered.map(o =>
        `<div class="ss-opt${o.value===sel.value?" is-selected":""}" data-value="${esc(o.value)}">${esc(o.text)}</div>`
      ).join("");
    }

    function syncInputFromSelect(){
      const cur = findOpt(sel.value) || opts[0];
      input.value = cur ? cur.text : "";
    }

    function open(){
      input.removeAttribute("readonly");
      input.value = "";
      renderList("");
      list.hidden = false;
      wrap.classList.add("is-open");
      setTimeout(()=>input.focus(),0);
    }
    function close(){
      input.setAttribute("readonly","readonly");
      syncInputFromSelect();
      list.hidden = true;
      wrap.classList.remove("is-open");
    }
    function pick(value){
      sel.value = value;
      sel.dispatchEvent(new Event("change",{bubbles:true}));
      close();
    }

    input.addEventListener("mousedown", e=>{
      if(list.hidden){ e.preventDefault(); open(); }
    });
    input.addEventListener("focus", ()=>{ if(list.hidden) open(); });
    input.addEventListener("input", e => renderList(e.target.value));
    input.addEventListener("keydown", e=>{
      if(e.key === "Escape"){ close(); }
      else if(e.key === "Enter"){
        const active = list.querySelector(".ss-opt.is-active") || list.querySelector(".ss-opt");
        if(active) pick(active.dataset.value);
        e.preventDefault();
      }
      else if(e.key === "ArrowDown" || e.key === "ArrowUp"){
        const items = Array.from(list.querySelectorAll(".ss-opt"));
        if(items.length === 0) return;
        let idx = items.findIndex(el => el.classList.contains("is-active"));
        items.forEach(el => el.classList.remove("is-active"));
        idx = e.key === "ArrowDown" ? (idx+1) % items.length : (idx<=0 ? items.length-1 : idx-1);
        items[idx].classList.add("is-active");
        items[idx].scrollIntoView({block:"nearest"});
        e.preventDefault();
      }
    });
    list.addEventListener("mousedown", e=>{
      const opt = e.target.closest(".ss-opt");
      if(opt){ e.preventDefault(); pick(opt.dataset.value); }
    });

    // Fechamento por clique fora é tratado por UM listener global (ssBindGlobalClose),
    // vinculado uma única vez — antes, um listener era adicionado por select a cada
    // render(), acumulando indefinidamente.
    syncInputFromSelect();
  });
  ssBindGlobalClose();
}

// Fecha qualquer searchable-select aberto ao clicar fora dele. Vinculado uma só vez.
function ssBindGlobalClose(){
  if(window._ssGlobalBound)return;
  window._ssGlobalBound=true;
  document.addEventListener("mousedown", e=>{
    document.querySelectorAll(".ss-wrap.is-open").forEach(wrap=>{
      if(wrap.contains(e.target))return;
      const sel=wrap._sel, input=wrap.querySelector(".ss-input"), list=wrap.querySelector(".ss-list");
      if(sel&&input){const o=Array.from(sel.options).find(o=>o.value===sel.value);input.value=o?o.textContent:"";}
      if(input)input.setAttribute("readonly","readonly");
      if(list)list.hidden=true;
      wrap.classList.remove("is-open");
    });
  });
}

// ─── TOASTS ───────────────────────────────────────────────────────────
function showToast(message,type){
  type=type||"success";
  const c=document.getElementById("toast-container");
  const t=document.createElement("div");
  t.className="toast toast-"+type;
  const icon=type==="success"?"✓":type==="error"?"✕":"i";
  t.innerHTML=`<span class="toast-icon-wrap">${icon}</span><span>${esc(message)}</span>`;
  c.appendChild(t);
  requestAnimationFrame(()=>t.classList.add("show"));
  setTimeout(()=>{t.classList.remove("show");setTimeout(()=>t.remove(),350);},3200);
}

// ─── CUSTOM INPUT MODAL ───────────────────────────────────────────────
function askInput(opts){
  // opts: {title, message, placeholder, defaultValue, okLabel, icon, validate, onOk}
  const mask=document.getElementById("input-mask");
  document.getElementById("input-icon").textContent=opts.icon||"✎";
  document.getElementById("input-title").textContent=opts.title||"Editar";
  document.getElementById("input-msg").textContent=opts.message||"";
  const inp=document.getElementById("input-field");
  inp.value=opts.defaultValue||"";
  inp.placeholder=opts.placeholder||"";
  inp.type=opts.type||"text";
  const okBtn=document.getElementById("input-ok");
  const cancelBtn=document.getElementById("input-cancel");
  const err=document.getElementById("input-err");
  err.classList.remove("show");
  okBtn.textContent=opts.okLabel||"Confirmar";
  mask.classList.add("show");
  setTimeout(()=>{inp.focus();inp.select();},80);
  const close=()=>{
    mask.classList.remove("show");
    okBtn.onclick=null;cancelBtn.onclick=null;mask.onclick=null;inp.onkeydown=null;
    err.classList.remove("show");
  };
  const submit=()=>{
    const v=inp.value.trim();
    if(opts.validate){
      const e=opts.validate(v);
      if(e){err.textContent=e;err.classList.add("show");inp.focus();return;}
    }else if(!v){
      err.textContent="Campo obrigatório.";err.classList.add("show");inp.focus();return;
    }
    close();opts.onOk(v);
  };
  okBtn.onclick=submit;
  cancelBtn.onclick=close;
  mask.onclick=e=>{if(e.target===mask)close();};
  inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();submit();}else if(e.key==="Escape"){close();}};
}

// ─── CUSTOM CONFIRM ───────────────────────────────────────────────────
function askConfirm(title,msg,onYes){
  const mask=document.getElementById("confirm-mask");
  document.getElementById("confirm-title").textContent=title;
  const msgEl=document.getElementById("confirm-msg");
  msgEl.textContent=msg;
  // Reset any leftover state from the access modal (which hides OK and changes labels)
  msgEl.classList.remove("access-scroll");
  msgEl.style.textAlign="";
  const ok=document.getElementById("confirm-ok");
  const cancel=document.getElementById("confirm-cancel");
  ok.style.display="";
  ok.className="btn-danger";
  ok.textContent="Confirmar";
  cancel.className="btn-sm";
  cancel.textContent="Cancelar";
  mask.classList.add("show");
  const close=()=>{mask.classList.remove("show");ok.onclick=null;cancel.onclick=null;mask.onclick=null;};
  ok.onclick=()=>{close();onYes();};
  cancel.onclick=close;
  mask.onclick=e=>{if(e.target===mask)close();};
}

