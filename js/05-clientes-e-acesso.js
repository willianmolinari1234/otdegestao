// ─── ACCESS MODAL ─────────────────────────────────────────────────────
function showAccessModal(cliId){
  const c=getCli(cliId);if(!c)return;
  const cu=c.custId?getCust(c.custId):null;
  const lg=(cu&&cu.login)||{};
  // Per-store login saved on the customer record
  const storeLogin=(lg.stores&&lg.stores[c.id])||{};
  // Legacy fallback: data saved directly on the store
  const legacy=c.access||{};
  const acc={
    url:storeLogin.url||legacy.url||"",
    user:storeLogin.user||legacy.user||"",
    pass:storeLogin.pass||legacy.pass||"",
    notes:legacy.notes||""
  };
  const erp=lg.erp||{};
  const erpLabel=erp.provider&&ERP_PRESETS[erp.provider]?ERP_PRESETS[erp.provider].label:(erp.provider||"ERP");
  const mask=document.getElementById("confirm-mask");
  const titleEl=document.getElementById("confirm-title");
  const msgEl=document.getElementById("confirm-msg");
  const okBtn=document.getElementById("confirm-ok");
  const cancelBtn=document.getElementById("confirm-cancel");
  titleEl.innerHTML=`🔑 Acessos — ${esc(c.name)}`;
  const ownerLine=cu?`<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12px;color:#64748b">${mktBadge(c.mkt)}<span>·</span><span>👤 ${esc(cu.name)}</span></div>`:`<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;font-size:12px;color:#94a3b8">${mktBadge(c.mkt)}<span>·</span><span>sem cliente vinculado</span></div>`;
  const row=(label,val,isPass,isLink)=>{
    if(!val)return`<div class="access-row"><label>${label}</label><div class="val empty">não cadastrado</div></div>`;
    const display=isPass?`<span class="val pw-val" data-pw="${esc(val)}">••••••••</span><button class="pw-toggle">👁</button>`
      :isLink?`<a class="val access-link" href="${esc(val)}" target="_blank" rel="noopener">${esc(val)} ↗</a>`
      :`<span class="val">${esc(val)}</span>`;
    return`<div class="access-row"><label>${label}</label>${display}<button class="copy-btn" data-copy="${esc(val)}">Copiar</button></div>`;
  };
  const hasStore=acc.url||acc.user||acc.pass||acc.notes;
  const hasErp=erp.user||erp.pass||erp.url||erp.id;
  const hasSheet=!!lg.sheet;
  const hasAny=hasStore||hasErp||hasSheet;
  msgEl.innerHTML=`${ownerLine}${hasAny?`
    ${hasStore?`<div style="font-size:10.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:4px 0 6px">🏪 Acesso da loja</div>
    ${row("Link",acc.url,false,true)}
    ${row("Usuário",acc.user,false,false)}
    ${row("Senha",acc.pass,true,false)}
    ${acc.notes?`<div class="access-row" style="align-items:flex-start"><label style="padding-top:4px">Notas</label><div class="val" style="font-family:inherit;white-space:pre-wrap">${esc(acc.notes)}</div><button class="copy-btn" data-copy="${esc(acc.notes)}">Copiar</button></div>`:""}`:""}
    ${hasErp?`<div style="font-size:10.5px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px">🧾 ${esc(erpLabel)}</div>
    ${row("Link",erp.url,false,true)}
    ${row("Usuário",erp.user,false,false)}
    ${row("Senha",erp.pass,true,false)}
    ${erp.id?row("ID / Empresa",erp.id,false,false):""}`:""}
    ${hasSheet?`<div style="font-size:10.5px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:12px 0 6px">📊 Planilha</div>${row("Precificação",lg.sheet,false,true)}`:""}
  `:'<div style="text-align:center;color:#94a3b8;font-size:13px;padding:20px 0">Nenhum dado de acesso cadastrado. Cadastre em <strong>Gerenciar clientes → 🔑 (chave do cliente)</strong>.</div>'}`;
  msgEl.style.textAlign="left";
  msgEl.classList.add("access-scroll");
  okBtn.style.display="none";
  cancelBtn.textContent="Fechar";
  cancelBtn.className="btn-sm";
  mask.classList.add("show");
  const close=()=>{
    mask.classList.remove("show");
    okBtn.style.display="";okBtn.className="btn-danger";okBtn.textContent="Confirmar";
    cancelBtn.textContent="Cancelar";
    msgEl.style.textAlign="";
    msgEl.classList.remove("access-scroll");
    cancelBtn.onclick=null;mask.onclick=null;
  };
  cancelBtn.onclick=close;
  mask.onclick=e=>{if(e.target===mask)close();};
  // Bind copy buttons
  msgEl.querySelectorAll(".copy-btn").forEach(btn=>{
    btn.onclick=async()=>{
      try{
        await navigator.clipboard.writeText(btn.dataset.copy);
        const orig=btn.textContent;
        btn.classList.add("copied");btn.textContent="✓ Copiado";
        setTimeout(()=>{btn.classList.remove("copied");btn.textContent=orig;},1500);
      }catch{
        // Fallback for clipboard API failures
        const ta=document.createElement("textarea");ta.value=btn.dataset.copy;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();
        const orig=btn.textContent;
        btn.classList.add("copied");btn.textContent="✓ Copiado";
        setTimeout(()=>{btn.classList.remove("copied");btn.textContent=orig;},1500);
      }
    };
  });
  // Password toggles (multiple — store password, ERP password, etc.)
  msgEl.querySelectorAll(".pw-toggle").forEach(pwt=>{
    pwt.onclick=()=>{
      const v=pwt.previousElementSibling;
      if(!v)return;
      const shown=v.textContent!=="••••••••";
      v.textContent=shown?"••••••••":v.dataset.pw;
      pwt.textContent=shown?"👁":"🙈";
    };
  });
}

// ─── CUSTOMERS MANAGEMENT PANEL ───────────────────────────────────────
let custSearchTerm="";
function showCustomersPanel(){
  function buildRows(){
    const q=custSearchTerm.toLowerCase().trim();
    const filtered=q?custs.filter(cu=>cu.name.toLowerCase().includes(q)):custs.slice();
    if(custs.length===0)
      return '<p style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">Nenhum cliente cadastrado. Clique em "Novo cliente" para começar.</p>';
    if(filtered.length===0)
      return '<p style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">Nenhum cliente encontrado para essa busca.</p>';
    return filtered.map(cu=>{
      const stores=storesOfCust(cu.id);
      const lg=cu.login||{};
      const hasLogin=lg.sheet||lg.user||lg.pass||lg.url||lg.notes||(lg.erp&&(lg.erp.user||lg.erp.pass||lg.erp.url||lg.erp.id))||(lg.stores&&Object.keys(lg.stores).length>0);
      return`<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid #f1f5f9">
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:600;color:#0f172a;margin-bottom:2px">${esc(cu.name)}${cu.fee?`<span style="font-size:10.5px;font-weight:700;color:#16a34a;background:#dcfce7;border-radius:5px;padding:1px 7px;margin-left:7px">💰 ${esc(cu.fee)}</span>`:""}</div>
          <div style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${stores.length} loja${stores.length!==1?"s":""}${stores.length?" · "+stores.map(s=>esc(s.name)).join(", "):""}</div>
        </div>
        <button data-acust="${cu.id}" title="Informações de login" style="background:${hasLogin?"#fff7ed":"none"};border:1px solid ${hasLogin?"#fed7aa":"transparent"};color:${hasLogin?"#ea580c":"#94a3b8"};font-size:14px;cursor:pointer;padding:4px 8px;border-radius:6px;font-weight:600">🔑${hasLogin?"":""}</button>
        <button data-ecust="${cu.id}" title="Renomear" style="background:none;border:none;color:#94a3b8;font-size:15px;cursor:pointer;padding:4px 7px;border-radius:6px">✎</button>
        <button data-dcust="${cu.id}" title="Excluir" style="background:none;border:none;color:#fca5a5;font-size:15px;cursor:pointer;padding:4px 7px;border-radius:6px">✕</button>
      </div>`;
    }).join("");
  }
  showFormModal(`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:800;color:#0f172a">👥 Gerenciar clientes</div>
        <div style="font-size:11.5px;color:#64748b;margin-top:2px">Proprietários das lojas marketplace</div>
      </div>
      <button id="close-cust-panel" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer">✕</button>
    </div>
    <input id="cust-search" class="finput" placeholder="🔍 Buscar cliente pelo nome..." value="${esc(custSearchTerm)}" style="margin-bottom:12px" autocomplete="off"/>
    <div id="cust-rows" style="background:#fafbfc;border-radius:10px;border:1px solid #e5e7eb;overflow:hidden;max-height:46vh;overflow-y:auto">${buildRows()}</div>
    <div class="form-actions">
      <button class="btn-primary" id="add-cust-btn">+ Novo cliente</button>
    </div>
  </div>`);
  // Bind handlers directly on the modal (not via delegation, since modal lives outside #content)
  setTimeout(()=>{
    const addBtn=document.getElementById("add-cust-btn");
    if(addBtn)addBtn.onclick=quickAddCust;
    const closeBtn=document.getElementById("close-cust-panel");
    if(closeBtn)closeBtn.onclick=closeFormModal;
    const search=document.getElementById("cust-search");
    const rowsBox=document.getElementById("cust-rows");
    function rebind(){
      rowsBox.querySelectorAll("[data-acust]").forEach(b=>{b.onclick=()=>openCustAccessForm(b.dataset.acust);});
      rowsBox.querySelectorAll("[data-ecust]").forEach(b=>{b.onclick=()=>renameCust(b.dataset.ecust);});
      rowsBox.querySelectorAll("[data-dcust]").forEach(b=>{b.onclick=()=>deleteCust(b.dataset.dcust);});
    }
    if(search){
      search.oninput=e=>{custSearchTerm=e.target.value;rowsBox.innerHTML=buildRows();rebind();};
      search.focus();
    }
    rebind();
  },0);
}

function openCustAccessForm(custId){
  const cu=getCust(custId);if(!cu)return;
  const lg=cu.login||{};
  const stores=storesOfCust(custId);
  const erp=lg.erp||{};
  // Determine which ERP preset is currently selected (saved value, or guess from URL, default Expedy)
  let erpProvider=erp.provider||"";
  if(!erpProvider){
    if(erp.url){
      const u=erp.url.toLowerCase();
      if(u.includes("expedy"))erpProvider="expedy";
      else if(u.includes("snap"))erpProvider="snap";
      else if(u.includes("upseller"))erpProvider="upseller";
      else erpProvider="outro";
    }else erpProvider="expedy";
  }
  const storeLogins=lg.stores||{};
  // Enquanto ninguém marcou nada, mostra o que dá para deduzir das lojas — a
  // tela abre já preenchida com o que o sistema sabe, em vez de vazia.
  const semCampoProprio=!(Array.isArray(cu.marketplaces)&&cu.marketplaces.length);
  const mktsAtuais=mktsDoCliente(cu);
  // Backward-compat: migrate legacy flat {url,user,pass} into the first store block on display
  let legacyHint=null;
  if((lg.user||lg.pass||lg.url)&&!lg.erp&&!lg.stores&&!lg.sheet){
    legacyHint={url:lg.url||"",user:lg.user||"",pass:lg.pass||""};
  }

  const pwField=(id,val)=>`<div style="display:flex;gap:5px">
        <input id="${id}" type="password" class="finput" placeholder="Senha" value="${esc(val||"")}" style="flex:1"/>
        <button type="button" data-pwtoggle="${id}" class="btn-sm" title="Mostrar/ocultar senha" style="padding:0 12px">👁</button>
      </div>`;

  const block=(opts)=>{
    const {title,icon,bg,border,titleColor,urlId,urlLabel,urlPh,userId,userVal,passId,passVal,urlVal,idId,idLabel,idPh,idVal}=opts;
    return`<div style="background:${bg};border:1px solid ${border};border-radius:11px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:11px;color:${titleColor};font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px">${icon} ${esc(title)}</div>
      ${urlId?`<div class="form-group" style="margin-bottom:10px"><label>${esc(urlLabel)}</label><input id="${urlId}" class="finput" placeholder="${esc(urlPh||"https://...")}" value="${esc(urlVal||"")}"/></div>`:""}
      <div class="form-row">
        <div class="form-group"><label>Usuário / e-mail</label><input id="${userId}" class="finput" placeholder="Login da conta" value="${esc(userVal||"")}"/></div>
        <div class="form-group"><label>Senha</label>${pwField(passId,passVal)}</div>
      </div>
      ${idId?`<div class="form-group" style="margin-top:10px"><label>${esc(idLabel)}</label><input id="${idId}" class="finput" placeholder="${esc(idPh||"")}" value="${esc(idVal||"")}"/></div>`:""}
    </div>`;
  };

  // Per-store blocks
  const storeBlocks=stores.length===0
    ? `<div style="font-size:12px;color:#94a3b8;font-style:italic;padding:4px 0 12px">Nenhuma loja vinculada a este cliente ainda.</div>`
    : stores.map((s,i)=>{
        const sl=storeLogins[s.id]|| (i===0&&legacyHint?legacyHint:{});
        return block({
          title:`Loja: ${esc(s.name)}`+(s.mkt?` · ${esc(s.mkt)}`:""),
          icon:"🏪",bg:"#f8fafc",border:"#e2e8f0",titleColor:"#475569",
          urlId:`ca-st-url-${s.id}`,urlLabel:"Link da loja",urlPh:"https://shopee.com.br/...",urlVal:sl.url,
          userId:`ca-st-user-${s.id}`,userVal:sl.user,
          passId:`ca-st-pass-${s.id}`,passVal:sl.pass
        });
      }).join("");

  showFormModal(`<div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px">
      <div>
        <div style="font-size:10.5px;color:var(--brand);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px">🔑 Informações de acesso</div>
        <div style="font-size:18px;font-weight:800;color:#0f172a;line-height:1.3">${esc(cu.name)}</div>
        <div style="font-size:11.5px;color:#94a3b8;margin-top:3px">${stores.length} loja${stores.length!==1?"s":""}${stores.length?" · "+esc(stores.map(s=>s.name).join(", ")):""}</div>
      </div>
      <button id="ca-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;line-height:1">✕</button>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div class="form-group" style="flex:1;min-width:200px">
        <label>📊 Planilha de precificação</label>
        <input id="ca-sheet" class="finput" placeholder="Cole o link da planilha (Google Sheets, Excel online...)" value="${esc(lg.sheet||lg.url||"")}"/>
      </div>
      <div class="form-group" style="width:130px">
        <label>💰 % de gestão</label>
        <input id="ca-fee" class="finput" placeholder="Ex: 8%" value="${esc(cu.fee||"")}"/>
      </div>
      <div class="form-group" style="width:130px">
        <label>🧾 Imposto %</label>
        <input id="ca-imposto" class="finput" placeholder="Ex: 7,5%" value="${esc(cu.imposto||"")}"/>
      </div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:11px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:11px;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">🛒 Marketplaces em que opera</div>
      <div style="font-size:11.5px;color:#94a3b8;margin-bottom:11px;line-height:1.5">Decide o que ele vê na área do cliente e qual especialista atende ele. Marque também onde ainda não tem loja cadastrada aqui.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${MKTS.map((m,i)=>{
          const st=mktStyle(m),on=mktsAtuais.includes(m);
          return `<label for="ca-mkt-${i}" style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:${on?"700":"500"};border:1.5px solid ${on?st.border:"#e2e8f0"};background:${on?st.bg:"#fff"};color:${on?st.fg:"#94a3b8"}">
            <input type="checkbox" id="ca-mkt-${i}" data-mkt="${esc(m)}" ${on?"checked":""} style="margin:0;accent-color:#ea580c"/>${esc(m)}
          </label>`;
        }).join("")}
      </div>
      ${semCampoProprio?`<div style="font-size:11.5px;color:#b45309;margin-top:10px;line-height:1.5">Deduzido das lojas cadastradas. Salve para confirmar.</div>`:""}
    </div>

    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:11px;padding:14px 16px;margin-bottom:12px">
      <div style="font-size:11px;color:#9a3412;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px">🧾 ERP — Sistema de emissão de notas</div>
      <div class="form-group" style="margin-bottom:10px">
        <label>Qual ERP?</label>
        <select id="ca-erp-provider" class="finput">
          ${Object.entries(ERP_PRESETS).map(([k,p])=>`<option value="${k}"${erpProvider===k?" selected":""}>${esc(p.label)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label>Link do ERP</label>
        <input id="ca-erp-url" class="finput" placeholder="https://..." value="${esc(erp.url||"")}"/>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Usuário / e-mail</label><input id="ca-erp-user" class="finput" placeholder="Login da conta" value="${esc(erp.user||"")}"/></div>
        <div class="form-group"><label>Senha</label>${pwField("ca-erp-pass",erp.pass)}</div>
      </div>
      <div class="form-group" id="ca-erp-id-wrap" style="margin-top:10px${ERP_PRESETS[erpProvider]&&ERP_PRESETS[erpProvider].hasId?"":";display:none"}">
        <label>ID / Nº da empresa</label>
        <input id="ca-erp-id" class="finput" placeholder="Ex: 12345" value="${esc(erp.id||"")}"/>
      </div>
    </div>

    <div style="font-size:11px;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 10px">🏪 Acesso das lojas</div>
    ${storeBlocks}

    <div class="form-group" style="margin-top:4px">
      <label>📝 Observações gerais (PIN, 2FA, recuperação, etc.)</label>
      <textarea id="ca-notes" class="finput" rows="3" placeholder="Anotações livres..." style="resize:vertical">${esc(lg.notes||"")}</textarea>
    </div>

    <div class="form-actions" style="margin-top:18px">
      <button id="ca-cancel" class="btn-sm">Cancelar</button>
      <button id="ca-save" class="btn-primary">Salvar acesso</button>
    </div>
  </div>`);
  setTimeout(()=>{
    const close=()=>{closeFormModal();setTimeout(showCustomersPanel,120);};
    document.getElementById("ca-close").onclick=document.getElementById("ca-cancel").onclick=close;
    // A pilha do marketplace acende e apaga junto com a caixinha — sem isso
    // o clique marca mas a tela continua igual, e a pessoa clica de novo.
    document.querySelectorAll("#form-modal-content [data-mkt]").forEach(cx=>{
      cx.onchange=()=>{
        const st=mktStyle(cx.dataset.mkt),on=cx.checked,lb=cx.parentElement;
        lb.style.fontWeight=on?"700":"500";
        lb.style.border="1.5px solid "+(on?st.border:"#e2e8f0");
        lb.style.background=on?st.bg:"#fff";
        lb.style.color=on?st.fg:"#94a3b8";
      };
    });
    // Wire all password toggles
    document.querySelectorAll("#form-modal-content [data-pwtoggle]").forEach(btn=>{
      btn.onclick=()=>{const f=document.getElementById(btn.dataset.pwtoggle);if(f)f.type=f.type==="password"?"text":"password";};
    });
    // ERP provider selector: auto-fill URL + show/hide ID field
    const erpSel=document.getElementById("ca-erp-provider");
    const erpUrl=document.getElementById("ca-erp-url");
    const erpIdWrap=document.getElementById("ca-erp-id-wrap");
    if(erpSel){
      erpSel.onchange=()=>{
        const p=ERP_PRESETS[erpSel.value];
        if(!p)return;
        // Known ERPs auto-fill their fixed login URL; "Outro" clears the field for manual entry.
        erpUrl.value=erpSel.value==="outro"?"":p.url;
        // Show/hide the ID field
        if(erpIdWrap)erpIdWrap.style.display=p.hasId?"":"none";
      };
      // On open: if URL is empty and a known ERP is selected, pre-fill its login URL
      const initP=ERP_PRESETS[erpSel.value];
      if(initP&&erpSel.value!=="outro"&&erpUrl&&!erpUrl.value.trim())erpUrl.value=initP.url;
    }
    document.getElementById("ca-save").onclick=async()=>{
      const v=id=>{const el=document.getElementById(id);return el?el.value:"";};
      const storesObj={};
      stores.forEach(s=>{
        const u=v(`ca-st-url-${s.id}`).trim(),us=v(`ca-st-user-${s.id}`).trim(),ps=v(`ca-st-pass-${s.id}`);
        if(u||us||ps)storesObj[s.id]={url:u,user:us,pass:ps};
      });
      const erpProv=v("ca-erp-provider");
      const erpHasId=ERP_PRESETS[erpProv]&&ERP_PRESETS[erpProv].hasId;
      const login={
        sheet:v("ca-sheet").trim(),
        erp:{provider:erpProv,url:v("ca-erp-url").trim(),user:v("ca-erp-user").trim(),pass:v("ca-erp-pass"),id:erpHasId?v("ca-erp-id").trim():""},
        stores:storesObj,
        notes:v("ca-notes").trim()
      };
      try{
        const marketplaces=[...document.querySelectorAll("#form-modal-content [data-mkt]")]
          .filter(c=>c.checked).map(c=>c.dataset.mkt);
        await fbUpdate("customers",custId,{login,fee:v("ca-fee").trim(),imposto:v("ca-imposto").trim(),marketplaces});
        closeFormModal();setTimeout(showCustomersPanel,120);
        showToast("Informações de acesso salvas");
      }catch(e){showToast("Erro: "+(e.message||""),"error");}
    };
    const sheet=document.getElementById("ca-sheet");if(sheet)sheet.focus();
  },0);
}


function quickAddCust(){
  askInput({
    title:"Novo cliente",
    message:"Cadastre o proprietário das lojas. Você poderá vincular lojas a ele em seguida.",
    placeholder:"Ex: João Silva",
    okLabel:"Adicionar",
    icon:"+",
    onOk:async(nm)=>{
      try{
        await fbAdd("customers",{name:nm});
        showCustomersPanel();
        showToast("Cliente cadastrado");
      }catch(e){showToast("Erro: "+(e.message||""),"error");}
    }
  });
}

function renameCust(id){
  const cu=getCust(id);if(!cu)return;
  askInput({
    title:"Renomear cliente",
    message:"Atualize o nome do cliente proprietário das lojas.",
    placeholder:"Nome do cliente",
    defaultValue:cu.name,
    okLabel:"Salvar",
    icon:"✎",
    onOk:async(nm)=>{
      try{
        await fbUpdate("customers",id,{name:nm});
        showCustomersPanel();
        showToast("Cliente atualizado");
      }catch(e){showToast("Erro: "+(e.message||""),"error");}
    }
  });
}

function deleteCust(id){
  const stores=storesOfCust(id);
  const msg=stores.length>0?`Este cliente possui ${stores.length} loja(s) vinculada(s). Elas ficarão sem cliente após a exclusão. Continuar?`:"Excluir este cliente?";
  askConfirm("Excluir cliente",msg,async()=>{
    try{
      // Batch: unlink stores + delete customer
      const batch=window.fb.writeBatch(window.fb.db);
      stores.forEach(s=>{batch.update(window.fb.doc(window.fb.db,"clients",s.id),{custId:""});});
      batch.delete(window.fb.doc(window.fb.db,"customers",id));
      await batch.commit();
      showToast("Cliente excluído");
    }catch(e){showToast("Erro: "+(e.message||""),"error");}
  });
}

// ─── CSV EXPORT ───────────────────────────────────────────────────────
function exportCSV(){
  const head=["ID","Título","Descrição","Funcionário","Cliente","Marketplace","Status","Prioridade","Prazo","Atrasada","Qtd Anúncios"];
  const escCSV=v=>{const s=String(v==null?"":v);return /[,;"\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
  const rows=tsks.map(t=>{
    const e=getEmp(t.emp),c=getCliV(t);
    return[t.id,t.title,t.desc||"",e?e.name:"",c?c.name:"",c?c.mkt:"",SLBL[t.status],PLBL[t.pri],fmtDate(t.date),isOverdue(t)?"Sim":"Não",isAdTask(t)?adQtyOf(t):""].map(escCSV).join(";");
  });
  const csv="\uFEFF"+[head.join(";"),...rows].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=`OTDE-tarefas-${todayISO()}.csv`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function makePieSVG(data){
  const tot=data.reduce((s,d)=>s+d.v,0);
  if(!tot)return`<div style="height:100px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px">Sem dados</div>`;
  const cx=80,cy=65,r=45,ri=25;let ang=-Math.PI/2;
  const paths=data.map(d=>{
    const sw=d.v/tot*Math.PI*2;
    const x1=cx+r*Math.cos(ang),y1=cy+r*Math.sin(ang);
    ang+=sw;
    const x2=cx+r*Math.cos(ang),y2=cy+r*Math.sin(ang);
    const xi1=cx+ri*Math.cos(ang-sw),yi1=cy+ri*Math.sin(ang-sw);
    const xi2=cx+ri*Math.cos(ang),yi2=cy+ri*Math.sin(ang);
    const lg=sw>Math.PI?1:0;
    return`<path d="M${x1},${y1} A${r},${r} 0 ${lg},1 ${x2},${y2} L${xi2},${yi2} A${ri},${ri} 0 ${lg},0 ${xi1},${yi1}Z" fill="${d.col}" stroke="white" stroke-width="2"/>`;
  }).join("");
  return`<svg width="160" height="130" viewBox="0 0 160 130">${paths}</svg>`;
}

