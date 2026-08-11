// ─── AUTH UI ──────────────────────────────────────────────────────────
function showAuthScreen(mode){
  const scr=document.getElementById("auth-screen");
  scr.classList.add("show");
  document.body.style.overflow="hidden";
  const logo=document.getElementById("auth-logo");
  const title=document.getElementById("auth-title");
  const sub=document.getElementById("auth-sub");
  const fields=document.getElementById("auth-fields");
  const err=document.getElementById("auth-err");
  const btn=document.getElementById("auth-submit");
  err.classList.remove("show");
  const sidebarLogo=document.querySelector("#sidebar .logo-img");
  const logoSrc=sidebarLogo?sidebarLogo.src:"";
  logo.innerHTML=`<img src="${logoSrc}" alt="OTDE"/><h2>OTDE</h2><span>Gestão de Contas</span>`;
  if(mode==="setup"){
    title.textContent="Primeiro acesso";
    sub.textContent="Crie sua conta de administrador. Esse será o login principal do sistema.";
    fields.innerHTML=`
      <input class="auth-input" id="auth-name" placeholder="Seu nome completo" autofocus/>
      <input class="auth-input" id="auth-email" type="email" placeholder="Seu e-mail" autocomplete="email"/>
      <input type="password" class="auth-input" id="auth-pass" placeholder="Senha (mín. 6 caracteres)" autocomplete="new-password"/>
      <a href="#" id="auth-switch-login" style="font-size:11.5px;color:#64748b;text-decoration:none;font-weight:500;display:inline-block;margin-top:-4px">Já tenho conta · Entrar</a>`;
    btn.textContent="Criar conta de admin";
    btn.onclick=async()=>{
      // DESATIVADO por segurança: este fluxo permitia que qualquer pessoa na
      // internet criasse uma conta de ADMINISTRADOR. Contas agora são criadas
      // apenas por um admin logado, na tela Equipe (validado no servidor).
      err.textContent="Cadastro desativado. Peça ao administrador para criar sua conta.";
      err.classList.add("show");
      return;
      /* eslint-disable no-unreachable */
      try{
        // (código antigo mantido apenas como referência; inalcançável)
      }catch(e){
        let msg="Erro ao criar conta.";
        if(e.code==="auth/email-already-in-use")msg="Este e-mail já está cadastrado. Use a tela de login.";
        else if(e.code==="auth/invalid-email")msg="E-mail inválido.";
        else if(e.code==="auth/weak-password")msg="Senha muito fraca (mín. 6 caracteres).";
        else msg=e.message||msg;
        err.textContent=msg;err.classList.add("show");
        btn.disabled=false;btn.textContent="Criar conta de admin";
      }
    };
  }else{
    title.textContent="Entrar";
    sub.textContent="Acesse sua conta para continuar.";
    fields.innerHTML=`
      <input class="auth-input" id="auth-email" type="email" placeholder="E-mail" autocomplete="email" autofocus/>
      <input type="password" class="auth-input" id="auth-pass" placeholder="Senha" autocomplete="current-password"/>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:-4px">
        <a href="#" id="auth-forgot" style="font-size:11.5px;color:#ea580c;text-decoration:none;font-weight:600">Esqueci minha senha</a>
        <span style="font-size:11.5px;color:#94a3b8">Sem conta? Peça ao administrador.</span>
      </div>`;
    btn.textContent="Entrar";
    btn.onclick=async()=>{
      err.classList.remove("show");
      const email=document.getElementById("auth-email").value.trim().toLowerCase();
      const pass=document.getElementById("auth-pass").value;
      if(!email||!pass){err.textContent="Preencha e-mail e senha.";err.classList.add("show");return;}
      btn.disabled=true;btn.textContent="Entrando...";
      try{
        await window.fb.signInWithEmailAndPassword(window.fb.auth,email,pass);
        // onAuthStateChanged handles the rest
      }catch(e){
        let msg="E-mail ou senha incorretos.";
        if(e.code==="auth/invalid-email")msg="E-mail inválido.";
        else if(e.code==="auth/user-disabled")msg="Esta conta foi desativada.";
        else if(e.code==="auth/too-many-requests")msg="Muitas tentativas. Tente novamente em alguns minutos.";
        err.textContent=msg;err.classList.add("show");
        btn.disabled=false;btn.textContent="Entrar";
      }
    };
    setTimeout(()=>{
      const fg=document.getElementById("auth-forgot");
      if(fg)fg.onclick=async ev=>{
        ev.preventDefault();
        const email=document.getElementById("auth-email").value.trim().toLowerCase();
        if(!email){err.textContent="Digite seu e-mail primeiro.";err.classList.add("show");return;}
        try{
          await window.fb.sendPasswordResetEmail(window.fb.auth,email);
          err.style.background="#dcfce7";err.style.color="#15803d";
          err.textContent="✓ Enviamos um link de recuperação para "+email;err.classList.add("show");
        }catch(e){
          err.style.background="";err.style.color="";
          err.textContent="Erro ao enviar e-mail: "+(e.message||"tente novamente");err.classList.add("show");
        }
      };
      // Auto-cadastro removido: contas são criadas apenas por administradores,
      // pela tela Equipe (validado no servidor).
    },50);
  }
  fields.querySelectorAll("input").forEach(inp=>{inp.onkeydown=e=>{if(e.key==="Enter")btn.click();};});
  // Bind switch-mode links
  setTimeout(()=>{
    const swLogin=document.getElementById("auth-switch-login");
    if(swLogin)swLogin.onclick=ev=>{ev.preventDefault();showAuthScreen("login");};
  },50);
}
function hideAuthScreen(){
  document.getElementById("auth-screen").classList.remove("show");
  document.body.style.overflow="";
}
async function logout(){
  const nm=currentUser?currentUser.name.split(" ")[0]:"";
  try{await window.fb.signOut(window.fb.auth);}catch(e){console.error(e);}
  // onAuthStateChanged handles the rest
  if(nm)showToast(`Até logo, ${nm}!`,"info");
}
function updateUserChip(){
  const chip=document.getElementById("user-chip");
  if(!currentUser){chip.style.display="none";return;}
  chip.style.display="flex";
  document.getElementById("user-chip-avatar").innerHTML=avHTML(currentUser,28);
  document.getElementById("user-chip-name").textContent=currentUser.name.split(" ")[0];
  document.getElementById("user-chip-role").textContent=currentUser.role==="admin"?"Admin":"Funcionário";
  // Hide admin-only nav items for non-admins
  document.querySelectorAll("[data-admin]").forEach(el=>{el.style.display=isAdmin()?"":"none";});
}

// ─── CLEANUP: legacy auto-generated renewal tasks ─────────────────────
// Promoções NÃO criam mais tarefas automaticamente. Esta rotina roda uma
// única vez por sessão (apenas admin) para remover as tarefas de duplicação
// que foram criadas pelo comportamento antigo e limpar referências órfãs.
let _renewCleanupDone=false;
async function cleanupRenewalTasks(){
  if(!isAdmin()||_renewCleanupDone)return;
  _renewCleanupDone=true; // trava síncrona para evitar limpezas concorrentes
  const stale=tsks.filter(t=>t.title&&t.title.indexOf("Duplicar promo:")!==-1);
  const refs=proms.filter(p=>p.taskId);
  if(!stale.length&&!refs.length)return;
  try{
    const batch=window.fb.writeBatch(window.fb.db);
    for(const t of stale){batch.delete(window.fb.doc(window.fb.db,"tasks",t.id));}
    for(const p of refs){batch.update(window.fb.doc(window.fb.db,"promos",p.id),{taskId:""});}
    await batch.commit();
  }catch(e){console.error("Cleanup error:",e);_renewCleanupDone=false;}
}

