// O backend não pode calcular com uma tabela de taxas diferente da da tela.
//
// js/taxas.js é servido ao navegador; functions/taxas.js é cópia gerada
// (ferramentas/espelhar-taxas.js), porque o Hosting não publica functions/**
// e o deploy de functions só empacota functions/. Se divergirem, a tela mostra
// uma margem e o dado gravado fica com outra, sem erro nenhum aparecer.
//
// Se este teste quebrar, ninguém precisa investigar nada: rode
//   node ferramentas/espelhar-taxas.js
// e faça o commit do resultado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { conteudoEspelho, originalDoEspelho, MARCADOR, ORIGEM, ESPELHO } from "../ferramentas/espelhar-taxas.js";

test("functions/taxas.js é cópia exata de js/taxas.js", () => {
  const original = fs.readFileSync(ORIGEM, "utf8");
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.equal(
    espelho, conteudoEspelho(original, MARCADOR),
    "functions/taxas.js está diferente de js/taxas.js — rode: node ferramentas/espelhar-taxas.js",
  );
});

test("o espelho se identifica como gerado, para ninguém editar à mão", () => {
  const espelho = fs.readFileSync(ESPELHO, "utf8");
  assert.ok(espelho.startsWith(MARCADOR));
  assert.equal(originalDoEspelho(espelho, MARCADOR), fs.readFileSync(ORIGEM, "utf8"));
});

test("as duas cópias calculam a mesma margem", async () => {
  // O teste acima compara texto. Este prova o que importa de verdade: os dois
  // arquivos, carregados como código, dão o mesmo número.
  const daTela = await import("../js/taxas.js");
  const doBackend = await import("../functions/taxas.js");
  const caso = { preco: 150, custo: 60, peso: "500g", mkt: "Shein" };
  assert.deepEqual(doBackend.calcularMargem(caso), daTela.calcularMargem(caso));
});
