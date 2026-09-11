// O motor que transforma alerta em tarefa com dono.
//
// O que está em jogo em cada caso:
//   · duplicar → o kanban recebe 4 cópias por dia da mesma pendência e a
//     equipe aprende a ignorar o kanban;
//   · fechar cedo demais → some do painel um problema que ainda existe;
//   · reabrir cedo demais → cobra a pessoa por um dado de até 6 horas atrás,
//     que é culpa do sync e não dela;
//   · encostar em tarefa digitada por gente → o sistema decidindo que o
//     trabalho de alguém acabou.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planejar, montarPendencias, idDaTarefa, marcoDaConclusao, REGRAS,
} from "../functions/tarefas-automaticas.js";
import { semFerramenta, vencendo } from "../js/prazos.js";

const HOJE = "2026-09-11";
const AGORA = Math.floor(Date.parse("2026-09-11T12:00:00-03:00") / 1000);
const h = (n) => AGORA + n * 3600;
const SYNC = Date.parse("2026-09-11T11:00:00-03:00"); // Shopee consultada às 11h

const lojasCadastro = (extra = {}) => new Map([
  ["l1", { id: "l1", name: "Diamond Tricot", respId: "ana", sincronizadoEm: SYNC, ...extra }],
]);

const pendSemDesconto = [{
  loja: "l1", regra: "semDesconto", titulo: "Ativar desconto — Diamond Tricot",
  desc: "texto", pri: "alta", prazo: HOJE,
}];

// ── Id determinístico ──────────────────────────────────────────────────

test("o id não depende do dia: rodar de novo atualiza, não duplica", () => {
  assert.equal(idDaTarefa("l1", "semDesconto"), "auto__l1__semDesconto");
  assert.equal(idDaTarefa("l1", "semDesconto"), idDaTarefa("l1", "semDesconto"));
});

// ── Criar ──────────────────────────────────────────────────────────────

test("pendência nova vira tarefa do responsável da loja", () => {
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [], hoje: HOJE });
  assert.equal(p.criar.length, 1);
  const t = p.criar[0];
  assert.equal(t.id, "auto__l1__semDesconto");
  assert.equal(t.emp, "ana");
  assert.equal(t.cli, "l1");
  assert.equal(t.status, "todo");
  assert.equal(t.pri, "alta");
  assert.equal(t.date, HOJE);
  assert.equal(t.auto, true);
  assert.equal(t.reaberturas, 0);
});

test("loja sem responsável gera tarefa SEM DONO em vez de não gerar nada", () => {
  const p = planejar({
    pendencias: pendSemDesconto,
    lojas: new Map([["l1", { id: "l1", name: "X", respId: "", sincronizadoEm: SYNC }]]),
    tarefas: [], hoje: HOJE,
  });
  assert.equal(p.criar.length, 1);
  assert.equal(p.criar[0].emp, "", "sem dono é estado visível, não motivo para sumir");
});

test("loja que saiu do cadastro não gera tarefa nova", () => {
  const p = planejar({ pendencias: pendSemDesconto, lojas: new Map(), tarefas: [], hoje: HOJE });
  assert.equal(p.criar.length, 0);
});

// ── Não duplicar / não gravar à toa ────────────────────────────────────

test("rodar de novo com tudo igual não grava nada", () => {
  const existente = { ...planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [], hoje: HOJE }).criar[0] };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [existente], hoje: HOJE });
  assert.deepEqual(p, { criar: [], atualizar: [], fechar: [], reabrir: [] });
});

test("trocar o responsável da loja reatribui a tarefa aberta", () => {
  const existente = { id: "auto__l1__semDesconto", auto: true, regra: "semDesconto", cli: "l1",
    emp: "ana", title: pendSemDesconto[0].titulo, desc: "texto", pri: "alta", date: HOJE, status: "todo" };
  const p = planejar({
    pendencias: pendSemDesconto, lojas: lojasCadastro({ respId: "bruno" }),
    tarefas: [existente], hoje: HOJE,
  });
  assert.equal(p.criar.length, 0);
  assert.deepEqual(p.atualizar, [{ id: "auto__l1__semDesconto", patch: { emp: "bruno" } }]);
});

test("tarefa em andamento não é reaberta nem recriada", () => {
  const existente = { id: "auto__l1__semDesconto", auto: true, regra: "semDesconto", cli: "l1",
    emp: "ana", title: pendSemDesconto[0].titulo, desc: "texto", pri: "alta", date: HOJE, status: "doing" };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [existente], hoje: HOJE });
  assert.deepEqual(p, { criar: [], atualizar: [], fechar: [], reabrir: [] });
});

// ── Fechar sozinha ─────────────────────────────────────────────────────

test("pendência que saiu do ar fecha a tarefa sozinha", () => {
  const existente = { id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "todo" };
  const p = planejar({ pendencias: [], lojas: lojasCadastro(), tarefas: [existente], hoje: HOJE });
  assert.equal(p.fechar.length, 1);
  assert.equal(p.fechar[0].patch.status, "done");
  assert.equal(p.fechar[0].patch.doneDate, HOJE);
  assert.equal(p.fechar[0].patch.fechadaAuto, true);
});

test("tarefa já concluída não é fechada de novo", () => {
  const existente = { id: "auto__l1__semDesconto", auto: true, cli: "l1", status: "done", doneDate: HOJE };
  const p = planejar({ pendencias: [], lojas: lojasCadastro(), tarefas: [existente], hoje: HOJE });
  assert.equal(p.fechar.length, 0);
});

test("loja apagada do cadastro tem a tarefa órfã fechada, não esquecida", () => {
  const existente = { id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "todo" };
  const p = planejar({ pendencias: pendSemDesconto, lojas: new Map(), tarefas: [existente], hoje: HOJE });
  assert.equal(p.fechar.length, 1);
});

// ── Tarefa de gente nunca é tocada ─────────────────────────────────────

test("tarefa digitada por uma pessoa é ignorada em tudo", () => {
  const manual = { id: "xyz123", title: "Subir 10 anúncios", emp: "ana", cli: "l1", status: "todo" };
  const p = planejar({ pendencias: [], lojas: lojasCadastro(), tarefas: [manual], hoje: HOJE });
  assert.deepEqual(p, { criar: [], atualizar: [], fechar: [], reabrir: [] });
});

test("auto:false também é de gente", () => {
  const manual = { id: "auto__l1__semDesconto", auto: false, status: "todo", cli: "l1" };
  const p = planejar({ pendencias: [], lojas: lojasCadastro(), tarefas: [manual], hoje: HOJE });
  assert.equal(p.fechar.length, 0);
});

// ── Reabertura: o coração da medida de retrabalho ──────────────────────

test("concluída e a Shopee JÁ foi consultada depois: reabre e conta", () => {
  const concluida = {
    id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "done",
    doneDate: HOJE, doneEm: "2026-09-11T10:00:00.000-03:00", reaberturas: 0,
  };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [concluida], hoje: HOJE });
  assert.equal(p.reabrir.length, 1);
  assert.equal(p.reabrir[0].patch.status, "todo");
  assert.equal(p.reabrir[0].patch.doneDate, null);
  assert.equal(p.reabrir[0].patch.doneEm, null);
  assert.equal(p.reabrir[0].patch.reaberturas, 1);
});

test("a contagem de reaberturas acumula", () => {
  const concluida = {
    id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "done",
    doneDate: HOJE, doneEm: "2026-09-11T10:00:00.000-03:00", reaberturas: 2,
  };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [concluida], hoje: HOJE });
  assert.equal(p.reabrir[0].patch.reaberturas, 3);
});

test("concluída DEPOIS da última consulta à Shopee: não reabre", () => {
  // Marcou às 11h30; a Shopee foi consultada às 11h. O dado é mais velho que
  // a conclusão — acusar aqui seria cobrar a pessoa pelo atraso do sync.
  const concluida = {
    id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "done",
    doneDate: HOJE, doneEm: "2026-09-11T11:30:00.000-03:00", reaberturas: 0,
  };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [concluida], hoje: HOJE });
  assert.deepEqual(p.reabrir, []);
});

test("tarefa antiga sem doneEm: vale o FIM do dia, então nunca reabre no mesmo dia", () => {
  const concluida = {
    id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "done",
    doneDate: HOJE, reaberturas: 0,
  };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [concluida], hoje: HOJE });
  assert.deepEqual(p.reabrir, [], "sync das 11h de hoje não vence o fim do dia de hoje");
});

test("tarefa antiga sem doneEm: reabre quando o sync é de um dia posterior", () => {
  const concluida = {
    id: "auto__l1__semDesconto", auto: true, cli: "l1", emp: "ana", status: "done",
    doneDate: "2026-09-10", reaberturas: 0,
  };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [concluida], hoje: HOJE });
  assert.equal(p.reabrir.length, 1);
});

test("sem carimbo de conclusão nenhum, não reabre", () => {
  const concluida = { id: "auto__l1__semDesconto", auto: true, cli: "l1", status: "done", reaberturas: 0 };
  const p = planejar({ pendencias: pendSemDesconto, lojas: lojasCadastro(), tarefas: [concluida], hoje: HOJE });
  assert.deepEqual(p.reabrir, []);
});

test("loja nunca sincronizada não reabre tarefa de ninguém", () => {
  const concluida = {
    id: "auto__l1__semDesconto", auto: true, cli: "l1", status: "done",
    doneDate: "2026-01-01", doneEm: "2026-01-01T10:00:00.000-03:00",
  };
  const p = planejar({
    pendencias: pendSemDesconto,
    lojas: new Map([["l1", { id: "l1", name: "X", respId: "ana", sincronizadoEm: 0 }]]),
    tarefas: [concluida], hoje: HOJE,
  });
  assert.deepEqual(p.reabrir, []);
});

test("marcoDaConclusao prefere o carimbo com hora ao dia", () => {
  const comHora = marcoDaConclusao({ doneDate: HOJE, doneEm: "2026-09-11T10:00:00.000-03:00" });
  const soDia = marcoDaConclusao({ doneDate: HOJE });
  assert.ok(comHora < soDia, "o dia vale até o fim dele; a hora é mais cedo");
  assert.equal(marcoDaConclusao({ doneDate: "não é data" }), null);
  assert.equal(marcoDaConclusao(null), null);
});

// ── montarPendencias, com as regras de verdade ─────────────────────────

const montar = (lojasTools, nomes = { l1: "Diamond Tricot" }) => montarPendencias({
  lojasTools, nomeDaLoja: (id) => nomes[id] || id,
  agoraSeg: AGORA, hoje: HOJE, semFerramenta, vencendo,
});

test("loja sem nenhum desconto ativo vira pendência crítica de hoje", () => {
  const pend = montar([{ cliente: "l1", promocoes: [{ tipo: "cupom", inicio: h(-10), fim: h(200) }] }]);
  const sd = pend.filter((p) => p.regra === "semDesconto");
  assert.equal(sd.length, 1);
  assert.equal(sd[0].pri, "alta");
  assert.equal(sd[0].prazo, HOJE);
  assert.match(sd[0].titulo, /Diamond Tricot/);
});

test("loja com desconto ativo não vira pendência", () => {
  const pend = montar([{ cliente: "l1", promocoes: [{ tipo: "desconto", inicio: h(-10), fim: h(200) }] }]);
  assert.deepEqual(pend.filter((p) => p.regra === "semDesconto"), []);
});

test("oferta relâmpago NÃO vira tarefa (parte das lojas é bloqueada da ferramenta)", () => {
  const pend = montar([{ cliente: "l1", promocoes: [{ tipo: "desconto", inicio: h(-10), fim: h(200) }] }]);
  assert.deepEqual(pend.filter((p) => p.regra === "flash_sale" || /relâmpago/i.test(p.titulo)), []);
});

test("cupons NÃO viram tarefa enquanto o cadastro de perfil não estiver preenchido", () => {
  const pend = montar([{ cliente: "l1", minCupons: 4, promocoes: [{ tipo: "desconto", inicio: h(-10), fim: h(200) }] }]);
  assert.deepEqual(pend.filter((p) => /cupom|cupons/i.test(p.titulo)), []);
});

test("três promoções vencendo na mesma loja viram UMA tarefa", () => {
  const pend = montar([{ cliente: "l1", promocoes: [
    { tipo: "desconto", nome: "A", inicio: h(-10), fim: h(30) },
    { tipo: "cupom", nome: "B", inicio: h(-10), fim: h(10) },
    { tipo: "cupom", nome: "C", inicio: h(-10), fim: h(20) },
  ] }]);
  const v = pend.filter((p) => p.regra === "vencendo");
  assert.equal(v.length, 1, "uma ida ao painel da Shopee, um cartão");
  assert.match(v[0].titulo, /3 promoções/);
  assert.match(v[0].desc, /A/);
  assert.match(v[0].desc, /B/);
  assert.match(v[0].desc, /C/);
});

test("o prazo do 'vencendo' é o dia do vencimento mais próximo, não dois dias úteis", () => {
  const pend = montar([{ cliente: "l1", promocoes: [
    { tipo: "desconto", nome: "amanhã", inicio: h(-10), fim: h(30) },
    { tipo: "cupom", nome: "hoje", inicio: h(-10), fim: h(6) },
  ] }]);
  const v = pend.find((p) => p.regra === "vencendo");
  assert.equal(v.prazo, HOJE, "promoção que vence hoje com prazo para depois já nasceria errada");
  assert.equal(v.pri, "alta", "menos de 24h é urgência de hoje");
});

test("vencimento a mais de 24h fica em prioridade média", () => {
  const pend = montar([{ cliente: "l1", promocoes: [
    { tipo: "desconto", nome: "daqui a 2 dias", inicio: h(-10), fim: h(40) },
  ] }]);
  const v = pend.find((p) => p.regra === "vencendo");
  assert.equal(v.pri, "media");
  assert.equal(v.prazo, "2026-09-13");
});

test("as duas regras podem coexistir na mesma loja, em tarefas separadas", () => {
  // Sem desconto ativo E com um cupom vencendo.
  const pend = montar([{ cliente: "l1", promocoes: [
    { tipo: "cupom", nome: "C", inicio: h(-10), fim: h(20) },
  ] }]);
  assert.deepEqual(pend.map((p) => p.regra).sort(), ["semDesconto", "vencendo"]);
  const p = planejar({ pendencias: pend, lojas: lojasCadastro(), tarefas: [], hoje: HOJE });
  assert.equal(p.criar.length, 2);
  assert.deepEqual(p.criar.map((t) => t.id).sort(),
    ["auto__l1__semDesconto", "auto__l1__vencendo"]);
});

test("o ciclo inteiro: nasce, some a pendência, fecha, volta a pendência, renasce", () => {
  const tools = [{ cliente: "l1", promocoes: [{ tipo: "cupom", inicio: h(-10), fim: h(200) }] }];
  const p1 = planejar({ pendencias: montar(tools), lojas: lojasCadastro(), tarefas: [], hoje: HOJE });
  assert.equal(p1.criar.length, 1);
  const viva = p1.criar[0];

  const comDesconto = [{ cliente: "l1", promocoes: [
    { tipo: "cupom", inicio: h(-10), fim: h(200) },
    { tipo: "desconto", inicio: h(-10), fim: h(200) },
  ] }];
  const p2 = planejar({ pendencias: montar(comDesconto), lojas: lojasCadastro(), tarefas: [viva], hoje: HOJE });
  assert.equal(p2.fechar.length, 1);
  const morta = { ...viva, status: "done", doneDate: HOJE, doneEm: "2026-09-11T11:30:00.000-03:00" };

  // O desconto cai de novo e a Shopee é consultada depois: a MESMA tarefa volta.
  const lojasDepois = new Map([["l1", { id: "l1", name: "Diamond Tricot", respId: "ana",
    sincronizadoEm: Date.parse("2026-09-11T17:00:00-03:00") }]]);
  const p3 = planejar({ pendencias: montar(tools), lojas: lojasDepois, tarefas: [morta], hoje: HOJE });
  assert.equal(p3.criar.length, 0, "não abre uma segunda; reabre a mesma");
  assert.equal(p3.reabrir.length, 1);
  assert.equal(p3.reabrir[0].id, viva.id);
});

test("REGRAS não inclui relâmpago nem cupom — é contrato, não acidente", () => {
  assert.deepEqual(Object.keys(REGRAS).sort(), ["semDesconto", "vencendo"]);
});
