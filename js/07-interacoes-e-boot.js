// ─── EVENT BINDING ────────────────────────────────────────────────────
// ─── KANBAN DRAG & DROP ───────────────────────────────────────────────
let dragId=null;
function setupKanbanDnD(C){
  const cols=C.querySelectorAll(".kanban-col");
  if(cols.length===0)return;

  C.querySelectorAll(".task-card[draggable=true]").forEach(card=>{
    card.addEventListener("dragstart",e=>{
      dragId=card.dataset.card;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed="move";
      try{e.dataTransfer.setData("text/plain",dragId);}catch(_){}
    });
    card.addEventListener("dragend",()=>{
      card.classList.remove("dragging");
      C.querySelectorAll(".kanban-col.drag-over").forEach(c=>c.classList.remove("drag-over"));
      dragId=null;
    });
  });

  // Returns the card element we should insert before, based on cursor Y
  function cardAfter(col,y){
    const els=[...col.querySelectorAll(".task-card:not(.dragging)")];
    let closest=null,closestOffset=-Infinity;
    els.forEach(el=>{
      const box=el.getBoundingClientRect();
      const offset=y-box.top-box.height/2;
      if(offset<0&&offset>closestOffset){closestOffset=offset;closest=el;}
    });
    return closest;
  }

  cols.forEach(col=>{
    col.addEventListener("dragover",e=>{
      e.preventDefault();
      e.dataTransfer.dropEffect="move";
      col.classList.add("drag-over");
      const dragging=C.querySelector(".task-card.dragging");
      if(!dragging)return;
      const after=cardAfter(col,e.clientY);
      if(after==null)col.appendChild(dragging);
      else col.insertBefore(dragging,after);
    });
    col.addEventListener("dragleave",e=>{
      // Only remove highlight when truly leaving the column
      if(!col.contains(e.relatedTarget))col.classList.remove("drag-over");
    });
    col.addEventListener("drop",async e=>{
      e.preventDefault();
      col.classList.remove("drag-over");
      const id=dragId;if(!id)return;
      const newStatus=col.dataset.col;
      // Compute new ordered list of card ids in this column (DOM order)
      const orderedIds=[...col.querySelectorAll(".task-card[data-card]")].map(el=>el.dataset.card);
      // Switch to manual order so the new sequence sticks visually
      if(fSort!=="ordem")fSort="ordem";
      try{
        const batch=window.fb.writeBatch(window.fb.db);
        const movedTask=tsks.find(t=>t.id===id);
        const statusChanged=movedTask&&movedTask.status!==newStatus;
        // Renumber every card in this column 0,1,2... and set status of the moved one
        orderedIds.forEach((cid,i)=>{
          const ref=window.fb.doc(window.fb.db,"tasks",cid);
          const patch={order:i};
          if(cid===id&&statusChanged){patch.status=newStatus;setDoneDate(movedTask,newStatus,patch);}
          batch.update(ref,patch);
        });
        await batch.commit();
        if(statusChanged)showToast("Tarefa movida para "+SLBL[newStatus]);
      }catch(err){
        showToast("Erro ao reordenar: "+(err.message||""),"error");
        render();
      }
    });
  });
}

function bindAll(){
  const C=document.getElementById("content");
  // Report range pills
  C.querySelectorAll("[data-reprange]").forEach(btn=>{
    btn.onclick=()=>{repSyncDates(btn.dataset.reprange);render();};
  });
  const repFromEl=C.querySelector("#rep-from"),repToEl=C.querySelector("#rep-to");
  if(repFromEl)repFromEl.onchange=()=>{repFrom=repFromEl.value;repRange="custom";render();};
  if(repToEl)repToEl.onchange=()=>{repTo=repToEl.value;repRange="custom";render();};
  // Range pills (delegated)
  C.querySelectorAll("[data-range]").forEach(btn=>{
    btn.onclick=()=>{
      fRange=btn.dataset.range;
      if(fRange==="custom"){const inp=document.getElementById("range-date");if(inp)fDate=inp.value;}
      render();
    };
  });
  const rd=C.querySelector("#range-date");
  if(rd)rd.onchange=e=>{fDate=e.target.value;fRange="custom";render();};
  // Kanban filters
  const ke=C.querySelector("#k-emp");if(ke)ke.onchange=e=>{fEmp=e.target.value;render();};
  const kc=C.querySelector("#k-cli");if(kc)kc.onchange=e=>{fCli=e.target.value;render();};
  const kcu=C.querySelector("#k-cust");if(kcu)kcu.onchange=e=>{fCust=e.target.value;render();};
  const ks=C.querySelector("#k-sort");if(ks)ks.onchange=e=>{fSort=e.target.value;render();};
  const kcl=C.querySelector("#k-clear");if(kcl)kcl.onclick=()=>{fEmp="all";fCli="all";fCust="all";myOnly=false;render();};
  // Integrações Shopee
  C.querySelectorAll("[data-conn]").forEach(b=>{b.onclick=()=>conectarLoja(b.dataset.conn);});
  C.querySelectorAll("[data-reconn]").forEach(b=>{b.onclick=()=>conectarLoja(b.dataset.reconn);});
  C.querySelectorAll("[data-desconn]").forEach(b=>{b.onclick=()=>desconectarLoja(b.dataset.desconn);});
  const ib=C.querySelector("#integ-busca");
  if(ib)ib.oninput=e=>{fIntegBusca=e.target.value;const p=e.target.selectionStart;render();const n=document.getElementById("integ-busca");if(n){n.focus();n.setSelectionRange(p,p);}};
  const ifl=C.querySelector("#integ-filtro");
  if(ifl)ifl.onchange=e=>{fIntegFiltro=e.target.value;render();};
  const sa=C.querySelector("#sync-agora");
  if(sa)sa.onclick=()=>sincronizarAgora(sa);
  // New buttons
  const nc=C.querySelector("#new-cli-btn");if(nc)nc.onclick=()=>openClientForm(null);
  const ne=C.querySelector("#new-emp-btn");if(ne)ne.onclick=()=>openEmployeeForm();
  // CSV export
  const exp=C.querySelector("#export-csv");if(exp)exp.onclick=exportCSV;
  // Promo form
  const np=C.querySelector("#new-promo-btn");if(np)np.onclick=()=>openPromoForm(null);
  // Customer panel
  const mc=C.querySelector("#manage-custs-btn");if(mc)mc.onclick=showCustomersPanel;
  const cf=C.querySelector("#cli-cust-filter");if(cf)cf.onchange=e=>{fCust=e.target.value;render();};
  const cef=C.querySelector("#cli-erp-filter");if(cef)cef.onchange=e=>{fErp=e.target.value;render();};
  const cmf=C.querySelector("#cli-mkt-filter");if(cmf)cmf.onchange=e=>{fMkt=e.target.value;render();};
  const ccf=C.querySelector("#cli-clear-filter");if(ccf)ccf.onclick=()=>{fCust="all";fErp="all";fMkt="all";render();};
  // My-only toggle
  const my=C.querySelector("#k-myonly");if(my)my.onclick=()=>{myOnly=!myOnly;render();};
  // Drag & drop reordering / status change
  setupKanbanDnD(C);
  // Task actions via delegation — vincula UMA única vez.
  // O #content persiste entre renders (só o innerHTML muda), então adicionar o
  // listener a cada render() empilhava handlers duplicados. O guard resolve.
  if(!C._clickBound){C._clickBound=true;
  C.addEventListener("click",ev=>{
    const vw=ev.target.closest("[data-view]");if(vw){openTaskView(vw.dataset.view);return;}
    const ed=ev.target.closest("[data-edit]");if(ed){openTaskForm(ed.dataset.edit);return;}
    const dl=ev.target.closest("[data-del]");if(dl){askConfirm("Excluir tarefa","Tem certeza que deseja excluir esta tarefa? Esta ação não pode ser desfeita.",async()=>{try{await fbDelete("tasks",dl.dataset.del);showToast("Tarefa excluída");}catch(e){showToast("Erro: "+(e.message||""),"error");}});return;}
    const mv=ev.target.closest("[data-move]");if(mv){const _tk=tsks.find(t=>t.id===mv.dataset.move);const _patch=setDoneDate(_tk,mv.dataset.next,{status:mv.dataset.next});fbUpdate("tasks",mv.dataset.move,_patch).catch(e=>showToast("Erro: "+(e.message||""),"error"));return;}
    const ec=ev.target.closest("[data-ecli]");if(ec){openClientForm(ec.dataset.ecli);return;}
    const dc=ev.target.closest("[data-dcli]");if(dc){askConfirm("Excluir loja","Tem certeza que deseja excluir esta loja? Esta ação não pode ser desfeita.",async()=>{try{await fbDelete("clients",dc.dataset.dcli);showToast("Loja excluída");}catch(e){showToast("Erro: "+(e.message||""),"error");}});return;}
    const de=ev.target.closest("[data-demp]");if(de){
      if(currentUser&&currentUser.id===de.dataset.demp){showToast("Você não pode remover sua própria conta","error");return;}
      askConfirm("Remover funcionário","O funcionário não conseguirá mais acessar o sistema. Continuar?",async()=>{
        try{await fbDelete("employees",de.dataset.demp);showToast("Funcionário removido");}
        catch(err){showToast("Erro: "+(err.message||""),"error");}
      });return;
    }
    const eemp=ev.target.closest("[data-eemp]");if(eemp){openEmployeeForm(eemp.dataset.eemp);return;}
    // Promo actions
    const eprm=ev.target.closest("[data-eprm]");if(eprm){openPromoForm(eprm.dataset.eprm);return;}
    const dprm=ev.target.closest("[data-dprm]");if(dprm){askConfirm("Excluir promoção","Tem certeza que deseja excluir esta promoção?",async()=>{try{await fbDelete("promos",dprm.dataset.dprm);showToast("Promoção excluída");}catch(e){showToast("Erro: "+(e.message||""),"error");}});return;}
    const ren=ev.target.closest("[data-renew]");if(ren){renewPromo(ren.dataset.renew);return;}
    // Access modal
    const ac=ev.target.closest("[data-acc]");if(ac){showAccessModal(ac.dataset.acc);return;}
    // Customer actions
    const ecu=ev.target.closest("[data-ecust]");if(ecu){renameCust(ecu.dataset.ecust);return;}
    const dcu=ev.target.closest("[data-dcust]");if(dcu){deleteCust(dcu.dataset.dcust);return;}
    if(ev.target.closest("#add-cust-btn")){quickAddCust();return;}
    if(ev.target.closest("#close-cust-panel")){closeFormModal();return;}
  });
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────
async function checkSetupNeeded(){
  // Check if any admin exists in Firestore
  try{
    const snap=await window.fb.getDocs(window.fb.collection(window.fb.db,"employees"));
    return snap.empty;
  }catch(e){
    console.error("Setup check failed:",e);
    return false;
  }
}

async function boot(){
  // Wait for Firebase SDK to be loaded
  if(!window.fbReady){
    await new Promise(resolve=>{
      window.addEventListener("fb-ready",resolve,{once:true});
      setTimeout(resolve,5000);
    });
  }
  if(!window.fb){
    document.getElementById("loading-text").textContent="Erro ao carregar Firebase. Verifique sua conexão e atualize a página.";
    return;
  }

  // Listen for auth state changes
  window.fb.onAuthStateChanged(window.fb.auth,async(user)=>{
    if(user){
      // User is signed in — load their employee record
      setSyncStatus("loading","Carregando...");
      try{
        const empDoc=await window.fb.getDoc(window.fb.doc(window.fb.db,"employees",user.uid));
        if(!empDoc.exists()){
          // Conta sem cadastro de funcionário: não entra.
          await window.fb.signOut(window.fb.auth);
          document.body.classList.remove("sessao-ativa");
          showAuthScreen("login");
          document.getElementById("loading-overlay").style.display="none";
          showToast("Sua conta não está vinculada a um funcionário. Contate o admin.","error");
          return;
        }
        currentUser=empDoc.data();
        // Só agora o sistema pode ficar visível: sessão confirmada E cadastro
        // de funcionário existente.
        document.body.classList.add("sessao-ativa");
        hideAuthScreen();
        document.getElementById("loading-overlay").style.display="none";
        updateUserChip();
        startListeners();
      }catch(e){
        console.error("Boot error:",e);
        showToast("Erro ao carregar dados: "+(e.message||""),"error");
      }
    }else{
      // User is signed out
      stopListeners();
      currentUser=null;
      emps=[];clis=[];tsks=[];proms=[];custs=[];
      myOnly=false;
      updateUserChip();
      // Esconde o sistema e mostra o login ANTES de tirar o overlay.
      // Antes, o overlay saía primeiro e ainda havia uma consulta ao banco
      // pela frente — nesse intervalo o dashboard aparecia para quem não
      // estava logado. Também não há mais "modo setup" (auto-cadastro).
      document.body.classList.remove("sessao-ativa");
      setSyncStatus("offline","Desconectado");
      showAuthScreen("login");
      document.getElementById("loading-overlay").style.display="none";
    }
  });
}

// Bind global logout + topbar clicks
document.getElementById("logout-btn").onclick=()=>askConfirm("Sair do sistema","Deseja realmente sair?",logout);
document.getElementById("new-task-btn").onclick=()=>{if(currentUser)openTaskForm(null);};
document.getElementById("nav").addEventListener("click",e=>{
  const btn=e.target.closest(".nav-btn");
  if(!btn||!btn.dataset.view||!currentUser)return;
  view=btn.dataset.view;
  render();
});

boot();
