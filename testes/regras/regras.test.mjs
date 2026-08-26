// Testes de isolamento das regras do Firestore.
//
// A pergunta que este arquivo responde é uma só: um cliente consegue ver o
// dado de outro cliente? Enquanto a resposta não for "não", com teste, não
// existe tela nenhuma da área do cliente.
//
// Precisa do emulador do Firestore (por isso mora fora do `node --test` do
// resto do projeto). Rode com TESTAR-REGRAS.command na raiz.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where,
} from "firebase/firestore";

let env;

// Dois proprietários diferentes. O segundo existe só para ser o vizinho que
// o primeiro não pode enxergar.
const REANA = "cust_reana";
const MANU = "cust_manu";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-otde",
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
  });
});
after(async () => { await env?.cleanup(); });

// Contextos: cada um é um login diferente, com a claim que a Function
// espelharia a partir de accounts/{uid}.
const admin      = () => env.authenticatedContext("uid_admin").firestore();
const funcionario= () => env.authenticatedContext("uid_emp").firestore();
const cliente    = (cust) => env.authenticatedContext("uid_cli_" + cust, { papel: "cliente", custId: cust }).firestore();
const espML      = () => env.authenticatedContext("uid_ml", { papel: "especialista", mkt: "Mercado Livre" }).firestore();
const espTikTok  = () => env.authenticatedContext("uid_tt", { papel: "especialista", mkt: "TikTok" }).firestore();
const deslogado  = () => env.unauthenticatedContext().firestore();

beforeEach(async () => {
  await env.clearFirestore();
  // Semente escrita SEM regras: é o estado do banco, não uma operação testada.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "employees/uid_emp"), { name: "Funcionário", role: "emp" });
    await setDoc(doc(db, "employees/uid_admin"), { name: "Willian", role: "admin" });

    await setDoc(doc(db, "accounts/uid_cli_" + REANA), { papel: "cliente", custId: REANA });
    await setDoc(doc(db, "accounts/uid_ml"), { papel: "especialista", mkt: "Mercado Livre" });

    await setDoc(doc(db, "products/p_reana"), {
      custId: REANA, sku: "MTB-8090", nome: "Manta tricot", custo: 21.4,
      mkts: ["Shopee", "Mercado Livre"],
    });
    await setDoc(doc(db, "products/p_manu"), {
      custId: MANU, sku: "TCU-77", nome: "Toalha capuz", custo: 18.2,
      mkts: ["Shopee", "TikTok"],
    });

    await setDoc(doc(db, "listings/l_reana_ml"), { custId: REANA, sku: "MTB-8090", mkt: "Mercado Livre", preco: 73 });
    await setDoc(doc(db, "listings/l_manu_tt"), { custId: MANU, sku: "TCU-77", mkt: "TikTok", preco: 49 });

    await setDoc(doc(db, "customers/" + REANA), { name: "Reana Comércio", login: "senha-da-shopee" });
    await setDoc(doc(db, "clients/loja1"), { name: "Reana Tricot", custId: REANA, access: { pass: "senha" } });
  });
});

// ─── o teste que existe antes de qualquer tela ────────────────────────

test("cliente NÃO lê o produto de outro cliente", async () => {
  const db = cliente(REANA);
  await assertSucceeds(getDoc(doc(db, "products/p_reana")));
  await assertFails(getDoc(doc(db, "products/p_manu")));
});

test("cliente NÃO lista a coleção inteira, só a fatia dele", async () => {
  const db = cliente(REANA);
  // Sem o filtro, a consulta poderia devolver produto alheio: negada inteira.
  await assertFails(getDocs(collection(db, "products")));
  await assertSucceeds(getDocs(query(collection(db, "products"), where("custId", "==", REANA))));
  // E não adianta filtrar pelo vizinho.
  await assertFails(getDocs(query(collection(db, "products"), where("custId", "==", MANU))));
});

test("cliente NÃO lê o anúncio de outro cliente", async () => {
  const db = cliente(REANA);
  await assertSucceeds(getDoc(doc(db, "listings/l_reana_ml")));
  await assertFails(getDoc(doc(db, "listings/l_manu_tt")));
});

test("especialista vê só o marketplace dele", async () => {
  await assertSucceeds(getDoc(doc(espML(), "products/p_reana")));   // tem Mercado Livre
  await assertFails(getDoc(doc(espML(), "products/p_manu")));       // Shopee e TikTok
  await assertSucceeds(getDoc(doc(espTikTok(), "products/p_manu")));
  await assertFails(getDoc(doc(espTikTok(), "products/p_reana")));
});

test("especialista NÃO arrasta anúncio para outro marketplace", async () => {
  // Nem criando já no marketplace alheio...
  await assertFails(setDoc(doc(espML(), "listings/novo"), { custId: REANA, mkt: "TikTok", preco: 10 }));
  await assertSucceeds(setDoc(doc(espML(), "listings/novo"), { custId: REANA, mkt: "Mercado Livre", preco: 10 }));
  // ...nem editando um que é dele para fora.
  await assertFails(setDoc(doc(espML(), "listings/l_reana_ml"), { custId: REANA, mkt: "TikTok", preco: 10 }));
});

test("cliente NÃO escreve anúncio: quem anuncia é a OTDE", async () => {
  const db = cliente(REANA);
  await assertFails(setDoc(doc(db, "listings/x"), { custId: REANA, mkt: "Shopee", preco: 10 }));
});

// ─── o cliente não decide quem o enxerga ──────────────────────────────

test("cliente cadastra produto seu, e só seu", async () => {
  const db = cliente(REANA);
  await assertSucceeds(setDoc(doc(db, "products/novo"), { custId: REANA, sku: "X-1", nome: "Novo", custo: 5 }));
  await assertFails(setDoc(doc(db, "products/alheio"), { custId: MANU, sku: "X-2", nome: "Novo", custo: 5 }));
});

test("cliente NÃO escreve mkts: não é ele que decide quem enxerga o produto dele", async () => {
  const db = cliente(REANA);
  await assertFails(setDoc(doc(db, "products/novo"), {
    custId: REANA, sku: "X-1", nome: "Novo", custo: 5, mkts: ["TikTok"],
  }));
});

test("cliente NÃO muda o produto de dono nem mexe no mkts", async () => {
  const db = cliente(REANA);
  await assertSucceeds(setDoc(doc(db, "products/p_reana"), {
    custId: REANA, sku: "MTB-8090", nome: "Manta tricot 80x90", custo: 22,
    mkts: ["Shopee", "Mercado Livre"],
  }));
  await assertFails(setDoc(doc(db, "products/p_reana"), {
    custId: MANU, sku: "MTB-8090", nome: "Manta", custo: 22, mkts: ["Shopee", "Mercado Livre"],
  }));
  await assertFails(setDoc(doc(db, "products/p_reana"), {
    custId: REANA, sku: "MTB-8090", nome: "Manta", custo: 22, mkts: ["Shopee", "Mercado Livre", "TikTok"],
  }));
});

test("cliente NÃO apaga produto", async () => {
  await assertFails(deleteDoc(doc(cliente(REANA), "products/p_reana")));
});

// ─── o que nunca pode sair ────────────────────────────────────────────

test("nenhum papel externo lê clients: ali mora a senha da loja", async () => {
  await assertFails(getDoc(doc(cliente(REANA), "clients/loja1")));
  await assertFails(getDoc(doc(espML(), "clients/loja1")));
});

test("nenhum papel externo lê customers", async () => {
  await assertFails(getDoc(doc(cliente(REANA), "customers/" + REANA)));
  await assertFails(getDoc(doc(espML(), "customers/" + REANA)));
});

test("cliente NÃO edita a própria conta: seria trocar de dono numa linha", async () => {
  const db = cliente(REANA);
  await assertSucceeds(getDoc(doc(db, "accounts/uid_cli_" + REANA)));
  await assertFails(setDoc(doc(db, "accounts/uid_cli_" + REANA), { papel: "cliente", custId: MANU }));
  // E não lê a conta de outra pessoa.
  await assertFails(getDoc(doc(db, "accounts/uid_ml")));
});

test("deslogado não lê nada", async () => {
  await assertFails(getDoc(doc(deslogado(), "products/p_reana")));
  await assertFails(getDoc(doc(deslogado(), "accounts/uid_cli_" + REANA)));
});

// ─── a equipe continua funcionando como antes ─────────────────────────

test("funcionário continua lendo e escrevendo produto de qualquer cliente", async () => {
  const db = funcionario();
  await assertSucceeds(getDoc(doc(db, "products/p_reana")));
  await assertSucceeds(getDoc(doc(db, "products/p_manu")));
  await assertSucceeds(getDocs(collection(db, "products")));
  await assertSucceeds(setDoc(doc(db, "products/p_reana"), { custId: REANA, sku: "MTB-8090", custo: 30 }));
  await assertSucceeds(deleteDoc(doc(db, "products/p_manu")));
});

test("funcionário continua lendo clients e customers", async () => {
  await assertSucceeds(getDoc(doc(funcionario(), "clients/loja1")));
  await assertSucceeds(getDoc(doc(funcionario(), "customers/" + REANA)));
});

test("conta sem claim nenhuma não vira cliente por acidente", async () => {
  // É o caso de todo funcionário: token sem papel. A regra tem que NEGAR,
  // não ERRAR — foi por isso que os helpers usam .get(campo, padrão).
  const db = env.authenticatedContext("uid_solto").firestore();
  await assertFails(getDoc(doc(db, "products/p_reana")));
  await assertFails(getDocs(query(collection(db, "products"), where("custId", "==", REANA))));
});
