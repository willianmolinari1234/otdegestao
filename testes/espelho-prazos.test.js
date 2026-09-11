// O backend não pode ficar com uma regra mais velha que a do painel.
//
// js/prazos.js é servido ao navegador; functions/prazos.js é cópia gerada
// (ferramentas/espelhar-prazos.js), porque o Hosting não publica functions/**
// e o deploy de functions só empacota a pasta functions/. A cópia existe para
// NÃO haver duas versões escritas à mão da mesma regra.
//
// Se este teste quebrar, ninguém precisa investigar nada: rode
//   node ferramentas/espelhar-prazos.js
// e faça o commit do resultado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { conteudoEspelho, originalDoEspelho, MARCADOR, ORIGEM, ESPELHO } from "../ferramentas/espelhar-prazos.js";

test("functions/prazos.js é cópia exata de js/prazos.js", () => {
  const original = fs.readFileSync(ORIGEM, "utf8");
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.equal(
    espelho, conteudoEspelho(original, MARCADOR),
    "functions/prazos.js está diferente de js/prazos.js — rode: node ferramentas/espelhar-prazos.js",
  );
});

test("o espelho se identifica como gerado, para ninguém editar à mão", () => {
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.ok(espelho.startsWith(MARCADOR));
  assert.equal(originalDoEspelho(espelho, MARCADOR), fs.readFileSync(ORIGEM, "utf8"));
});

test("espelho sem o marcador é recusado", () => {
  assert.equal(originalDoEspelho("export const x = 1;\n", MARCADOR), null);
});
