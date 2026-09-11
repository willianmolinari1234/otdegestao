// O backend não pode pedir uma ficha diferente da que a tela desenha.
//
// js/ficha-produto.js é servido ao navegador; functions/ficha-produto.js é
// cópia gerada (ferramentas/espelhar-ficha-produto.js), porque o Hosting não
// publica functions/** e o deploy de functions só empacota functions/.
//
// Se este teste quebrar, ninguém precisa investigar nada: rode
//   node ferramentas/espelhar-ficha-produto.js
// e faça o commit do resultado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { conteudoEspelho, originalDoEspelho, MARCADOR, ORIGEM, ESPELHO } from "../ferramentas/espelhar-ficha-produto.js";

test("functions/ficha-produto.js é cópia exata de js/ficha-produto.js", () => {
  const original = fs.readFileSync(ORIGEM, "utf8");
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.equal(
    espelho, conteudoEspelho(original, MARCADOR),
    "functions/ficha-produto.js está diferente de js/ficha-produto.js — rode: node ferramentas/espelhar-ficha-produto.js",
  );
});

test("o espelho se identifica como gerado, para ninguém editar à mão", () => {
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.ok(espelho.startsWith(MARCADOR));
  assert.equal(originalDoEspelho(espelho, MARCADOR), fs.readFileSync(ORIGEM, "utf8"));
});

test("o marcador de um espelho não serve para o outro", async () => {
  const prazos = await import("../ferramentas/espelhar-prazos.js");
  assert.notEqual(prazos.MARCADOR, MARCADOR);
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.equal(originalDoEspelho(espelho, prazos.MARCADOR), null);
});
