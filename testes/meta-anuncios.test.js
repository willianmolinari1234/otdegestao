// Quantos anúncios uma tarefa vale.
//
// A porcentagem ao lado do nome de cada funcionário no dashboard sai daqui, e
// ela media COMO A PESSOA DIGITAVA: o título era varrido por um número solto,
// então "Revisar 3 fotos do anúncio" valia 3 anúncios. Medir errado o trabalho
// de alguém é pior do que não medir — e não quebra tela nenhuma.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Só o arquivo de utilitários, num contexto vazio: estas funções são puras.
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(raiz, "js", "02-utilitarios.js"), "utf8"), ctx);
const isAdTask = (t) => vm.runInContext("isAdTask", ctx)(t);
const adQtyOf = (t) => vm.runInContext("adQtyOf", ctx)(t);

// ─── o bug que motivou tudo ───────────────────────────────────────────
test("número solto no título não vira quantidade de anúncio", () => {
  // O caso exato do relatório: eram 3 fotos, não 3 anúncios.
  assert.equal(adQtyOf({ title: "Revisar 3 fotos do anúncio" }), 1);
  assert.equal(adQtyOf({ title: "Corrigir anúncio da loja 2" }), 1);
  assert.equal(adQtyOf({ title: "Anúncio com desconto de 30%" }), 1);
});

test("número colado na palavra anúncio ainda conta, nos dois sentidos", () => {
  assert.equal(adQtyOf({ title: "Subir 5 anúncios" }), 5);
  assert.equal(adQtyOf({ title: "Subir 20 anuncios da Eva Home" }), 20);
  assert.equal(adQtyOf({ title: "Anúncios 12 para revisar" }), 12);
});

// ─── o campo do formulário manda ──────────────────────────────────────
test("a quantidade digitada vence o título, sempre", () => {
  assert.equal(adQtyOf({ title: "Subir 5 anúncios", qty: 2 }), 2);
  assert.equal(adQtyOf({ title: "Revisar 3 fotos do anúncio", qty: 1 }), 1);
  assert.equal(adQtyOf({ title: "Sem número nenhum", qty: 7 }), 7);
});

test("zero significa 'não é anúncio', que é o que o formulário promete", () => {
  // Antes o zero era ignorado e o título voltava a decidir: marcar 0 numa
  // tarefa com a palavra anúncio não fazia nada.
  const t = { title: "Trocar a foto de capa do anúncio", qty: 0 };
  assert.equal(isAdTask(t), false);
  assert.equal(adQtyOf(t), 0);
});

test("a quantidade também é aceita como texto, que é como o formulário grava", () => {
  assert.equal(adQtyOf({ title: "x", qty: "8" }), 8);
  assert.equal(adQtyOf({ title: "Subir 5 anúncios", qty: "0" }), 0);
});

test("campo vazio não conta como zero: cai no título", () => {
  for (const vazio of ["", null, undefined]) {
    assert.equal(adQtyOf({ title: "Subir 5 anúncios", qty: vazio }), 5, JSON.stringify(vazio));
  }
});

// ─── o que é e o que não é tarefa de anúncio ──────────────────────────
test("tarefa sem a palavra anúncio e sem quantidade não entra na meta", () => {
  assert.equal(isAdTask({ title: "Ativar desconto — Eva Home" }), false);
  assert.equal(adQtyOf({ title: "Ativar desconto — Eva Home" }), 0);
});

test("a palavra anúncio, com ou sem acento, identifica a tarefa", () => {
  for (const t of ["Criar anúncio", "criar anuncio", "ANÚNCIOS novos"]) {
    assert.equal(isAdTask({ title: t }), true, t);
    assert.equal(adQtyOf({ title: t }), 1, t);
  }
});

test("quantidade preenchida faz da tarefa uma tarefa de anúncio, mesmo sem a palavra", () => {
  // É como a equipe registra o trabalho que não cabe num título.
  assert.equal(isAdTask({ title: "Subir a coleção de verão", qty: 15 }), true);
  assert.equal(adQtyOf({ title: "Subir a coleção de verão", qty: 15 }), 15);
});

test("tarefa sem título não quebra a conta", () => {
  assert.equal(isAdTask({}), false);
  assert.equal(adQtyOf({}), 0);
  assert.equal(adQtyOf({ title: null }), 0);
});

test("quantidade inválida é tratada como ausente, não como zero", () => {
  // Tratar lixo como zero tiraria a tarefa da meta em silêncio.
  assert.equal(adQtyOf({ title: "Subir 5 anúncios", qty: "muitos" }), 5);
  assert.equal(adQtyOf({ title: "Subir 5 anúncios", qty: -3 }), 5);
});
