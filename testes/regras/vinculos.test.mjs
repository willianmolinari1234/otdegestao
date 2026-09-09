import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { criarServicoVinculos } from "../../functions/vinculos-anuncios.js";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db, env, servico;
const base = { mkt: "Mercado Livre", contaId: "123", itemId: "MLB1" };
const escolha = { ...base, custId: "ana", produtoId: "ana__sku" };
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Teste exige emulador.");
  const projectId = "demo-otde-vinculos";
  env = await initializeTestEnvironment({ projectId,
    firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") } });
  app = initializeApp({ projectId }, "vinculos-test"); db = getFirestore(app);
  servico = criarServicoVinculos(db, () => "2026-09-09T00:00:00.000Z");
});
after(async () => { await env?.cleanup(); if (app) await deleteApp(app); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const custId of ["ana", "bia"]) {
    await db.doc(`customers/${custId}`).set({ name: custId });
    await db.doc(`products/${custId}__sku`).set({ custId, sku: "IGUAL", nome: `Produto ${custId}`, mkts: ["Mercado Livre"] });
  }
});
test("anúncio desconhecido fica pendente mesmo com SKU de produto existente", async () => {
  assert.deepEqual(await servico.resolver({ ...base, sku: "IGUAL" }), { status: "pendente" });
});
test("registro repetido é idempotente e preserva autor original", async () => {
  const um = await servico.registrar(base, "admin1");
  const dois = await servico.registrar({ ...base, custId: "bia", status: "confirmado" }, "admin2");
  assert.deepEqual(dois, um);
  assert.equal((await db.collection("vinculos_anuncios").get()).size, 1);
  assert.equal(um.status, "pendente"); assert.equal(um.custId, undefined);
});
test("SKUs iguais podem pertencer a clientes diferentes por anúncio", async () => {
  await servico.registrar(base, "admin");
  await servico.vincular(escolha, "admin");
  const outro = { ...base, itemId: "MLB2" };
  await servico.registrar(outro, "admin");
  await servico.vincular({ ...outro, custId: "bia", produtoId: "bia__sku" }, "admin");
  assert.equal((await servico.resolver(base)).custId, "ana");
  assert.equal((await servico.resolver(outro)).custId, "bia");
  assert.deepEqual(await servico.resolver({ ...base, contaId: "456" }), { status: "pendente" });
});
test("cliente e autoria vêm de validação no servidor", async () => {
  await servico.registrar(base, "admin");
  const r = await servico.vincular({ ...escolha, custNome: "falso", confirmadoPor: { uid: "falso" } }, "verdadeiro");
  assert.equal(r.custNome, "ana");
  assert.deepEqual(r.confirmadoPor, { uid: "verdadeiro", emNomeDe: "ana" });
  assert.equal((await db.doc("products/ana__sku").get()).data().sku, "IGUAL");
  assert.equal((await db.collection("listings").get()).size, 0);
});
test("não aceita produto de outro cliente nem confirmação sem registro", async () => {
  await assert.rejects(servico.vincular(escolha, "admin"), { status: 404 });
  await servico.registrar(base, "admin");
  await assert.rejects(servico.vincular({ ...escolha, produtoId: "bia__sku" }, "admin"), { status: 409 });
  assert.equal((await servico.resolver(base)).status, "pendente");
});
test("não aceita produto fora do marketplace", async () => {
  await db.doc("products/ana__sku").update({ mkts: ["TikTok"] });
  await servico.registrar(base, "admin");
  await assert.rejects(servico.vincular(escolha, "admin"), { status: 409 });
});
test("confirmações concorrentes não trocam o dono", async () => {
  await servico.registrar(base, "admin");
  const resultados = await Promise.allSettled([
    servico.vincular(escolha, "um"),
    servico.vincular({ ...escolha, custId: "bia", produtoId: "bia__sku" }, "dois"),
  ]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(resultados.find(r => r.status === "rejected").reason.status, 409);
});
test("repetir registro e confirmação não apaga vínculo ou autoria", async () => {
  await servico.registrar(base, "admin");
  const r = await servico.vincular(escolha, "um");
  assert.deepEqual(await servico.registrar(base, "dois"), r);
  assert.deepEqual(await servico.vincular(escolha, "dois"), r);
});
for (const [nome, alterar] of [
  ["produto removido", () => db.doc("products/ana__sku").delete()],
  ["produto mudou de cliente", () => db.doc("products/ana__sku").update({ custId: "bia" })],
  ["marketplace removido", () => db.doc("products/ana__sku").update({ mkts: [] })],
  ["cliente removido", () => db.doc("customers/ana").delete()],
]) test(`resolução volta a pendente se ${nome}`, async () => {
  await servico.registrar(base, "admin"); await servico.vincular(escolha, "admin"); await alterar();
  assert.deepEqual(await servico.resolver(base), { status: "pendente" });
});
test("listagem pagina todos os registros e isola a conta", async () => {
  await Promise.all(Array.from({ length: 102 }, (_, i) => servico.registrar({ ...base, itemId: `MLB${i}` }, "admin")));
  await servico.registrar({ ...base, contaId: "outra" }, "admin");
  const primeira = await servico.listar(base);
  const segunda = await servico.listar({ ...base, depois: primeira.depois });
  assert.equal(primeira.itens.length, 100); assert.equal(segunda.itens.length, 2);
  assert.equal(new Set([...primeira.itens, ...segunda.itens].map(x => x.id)).size, 102);
  assert.equal(segunda.depois, null);
});
for (const papel of ["cliente", "especialista", "equipe", "deslogado"]) test(`${papel} não lê nem grava vínculos diretamente`, async () => {
  const r = await servico.registrar(base, "admin");
  const ctx = papel === "deslogado" ? env.unauthenticatedContext() : env.authenticatedContext(papel, { papel, custId: "ana", mkt: "Mercado Livre" });
  if (papel === "equipe") await db.doc("employees/equipe").set({ role: "admin" });
  const ref = doc(ctx.firestore(), "vinculos_anuncios", r.id);
  await assertFails(getDoc(ref));
  await assertFails(setDoc(ref, { ...r, custId: "bia", status: "confirmado" }));
});
