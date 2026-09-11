// O mínimo de cupons deixou de ser 4 para todo mundo.
//
// Loja de ticket baixo trabalha com dois cupons: o de 3% e o Prêmio de
// Seguidor. Cobrar quatro dela era inventar falta — o mesmo erro do "3
// descontos", que acusava 35 de 40 lojas e ensinava a equipe a rolar a tela.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abaixoDoMinimo, minCuponsDoPerfil, PERFIS_CUPOM, MINIMO_FERRAMENTAS,
} from "../js/prazos.js";

const AGORA = 1786000000;
const h = (n) => AGORA + n * 3600;

// Cupom comum e o Prêmio, com os campos crus que o backend guarda.
const cupom = (nome) => ({ tipo: "cupom", nome, inicio: h(-24), fim: h(240), bruto: { voucher_purpose: 0 } });
const premio = () => ({ tipo: "cupom", nome: "prêmio", inicio: h(-24), fim: h(240), bruto: { voucher_purpose: 3 } });

test("perfil padrão continua exigindo 4", () => {
  assert.equal(minCuponsDoPerfil("padrao"), 4);
  assert.equal(PERFIS_CUPOM.padrao, 4);
});

test("ticket baixo exige 2", () => {
  assert.equal(minCuponsDoPerfil("ticketbaixo"), 2);
});

test("perfil vazio, desconhecido ou nulo cai no padrão", () => {
  assert.equal(minCuponsDoPerfil(""), MINIMO_FERRAMENTAS.cupom);
  assert.equal(minCuponsDoPerfil(null), MINIMO_FERRAMENTAS.cupom);
  assert.equal(minCuponsDoPerfil("inventado"), MINIMO_FERRAMENTAS.cupom);
  assert.equal(minCuponsDoPerfil("TicketBaixo"), 2, "não pode depender de maiúscula");
});

test("loja de ticket baixo com 3% + Prêmio não é acusada", () => {
  const lojas = [{ cliente: "LOW", minCupons: 2, promocoes: [cupom("3%"), premio()] }];
  assert.deepEqual(abaixoDoMinimo(lojas, AGORA), []);
});

test("a MESMA loja seria acusada sob o mínimo de 4", () => {
  const lojas = [{ cliente: "LOW", promocoes: [cupom("3%"), premio()] }];
  const fora = abaixoDoMinimo(lojas, AGORA);
  assert.equal(fora.length, 1);
  assert.equal(fora[0].faltas[0].texto, "2/4 cupons");
});

test("ticket baixo com só 1 cupom continua sendo acusada, no número certo", () => {
  const lojas = [{ cliente: "LOW", minCupons: 2, promocoes: [premio()] }];
  const fora = abaixoDoMinimo(lojas, AGORA);
  assert.equal(fora.length, 1);
  assert.equal(fora[0].faltas[0].texto, "1/2 cupons");
});

test("ticket baixo sem o Prêmio de Seguidor continua cobrado pelo Prêmio", () => {
  const lojas = [{ cliente: "LOW", minCupons: 2, promocoes: [cupom("3%"), cupom("10%")] }];
  const fora = abaixoDoMinimo(lojas, AGORA);
  assert.equal(fora.length, 1);
  assert.deepEqual(fora[0].faltas.map((f) => f.chave), ["seguidor"]);
});

test("minCupons inválido não vira mínimo 0 (loja deixaria de ser checada)", () => {
  for (const ruim of [0, -1, "", null, undefined, "abc"]) {
    const lojas = [{ cliente: "X", minCupons: ruim, promocoes: [cupom("3%")] }];
    const fora = abaixoDoMinimo(lojas, AGORA);
    assert.equal(fora.length, 1, `minCupons=${JSON.stringify(ruim)} deveria cair no padrão 4`);
    assert.equal(fora[0].faltas[0].texto, "1/4 cupons");
  }
});
