// A marca: OTDE Performance.
//
// O rebranding de 13/09/2026 trocou 660 ocorrências de cor em 13 arquivos.
// Sem uma trava, a próxima tela nova nasce laranja — porque quem escreve
// copia o estilo da tela ao lado, e basta uma sobrar para a cor voltar.
//
// Duas coisas são guardadas aqui, e a segunda é a que importa de verdade:
// o laranja não volta, e OURO NUNCA RECEBE TEXTO BRANCO.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Todo arquivo que pinta alguma coisa. */
function arquivosComCor() {
  const fixos = ["app.html", "cliente.html", "relatorio-cliente.html",
                 "index.html", "404.html", "functions/index.js"];
  const js = fs.readdirSync(path.join(raiz, "js"))
    .filter((f) => f.endsWith(".js")).map((f) => "js/" + f);
  return [...fixos, ...js].filter((f) => fs.existsSync(path.join(raiz, f)));
}
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), "utf8");

// ─── O laranja foi embora ─────────────────────────────────────────────

test("nenhum arquivo ainda pinta com o laranja antigo", () => {
  const mortas = ["#ea580c", "#c2410c", "#9a3412", "#b45309", "#fed7aa",
                  "#ffedd5", "#fff7ed", "234,88,12"];
  const culpados = [];
  for (const f of arquivosComCor()) {
    const txt = ler(f).toLowerCase();
    for (const c of mortas) if (txt.includes(c)) culpados.push(`${f} → ${c}`);
  }
  assert.deepEqual(culpados, [], "cor da marca antiga ainda viva:\n  " + culpados.join("\n  "));
});

test("a rampa de cinza azulado também saiu", () => {
  // Ouro sobre cinza azulado fica esverdeado. Trocar só o acento teria
  // deixado o sistema com cara de sujo, não de novo.
  const frios = ["#0f172a", "#64748b", "#94a3b8", "#475569", "#e2e8f0",
                 "#f1f5f9", "#cbd5e1", "#1e293b", "#334155"];
  const culpados = [];
  for (const f of arquivosComCor()) {
    const txt = ler(f).toLowerCase();
    for (const c of frios) if (txt.includes(c)) culpados.push(`${f} → ${c}`);
  }
  assert.deepEqual(culpados, [], "neutro frio ainda vivo:\n  " + culpados.join("\n  "));
});

// ─── A regra de contraste ─────────────────────────────────────────────

test("ouro nunca recebe texto branco: não se lê", () => {
  // #B8872B com branco dá 2,3:1 — reprova em acessibilidade e é ilegível
  // numa tela de trabalho. A ação principal é PRETA; realce e seleção usam
  // bronze #8A6420 (5,2:1). Esta é a regra que mais escorrega.
  const culpados = [];
  for (const f of arquivosComCor()) {
    ler(f).split("\n").forEach((linha, i) => {
      if (/gradient/i.test(linha)) return;
      const pinta = /background:\s*(#B8872B|var\(--brand\))/i.test(linha);
      const branco = /color:\s*(#fff\b|#ffffff\b|white\b)/i.test(linha);
      if (pinta && branco) culpados.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(culpados, [],
    "fundo ouro com texto branco (use preto para ação, bronze para realce):\n  " + culpados.join("\n  "));
});

// ─── Os tokens ────────────────────────────────────────────────────────

test("os tokens do app são a família ouro, e o preto tem nome", () => {
  const app = ler("app.html");
  assert.match(app, /--brand:#B8872B;/);
  assert.match(app, /--brand-dark:#8A6420;/);
  assert.match(app, /--ink:#0B0B0C;/, "o preto do logo vira token, não número solto");
  assert.match(app, /--bg:#F7F6F3;/);
  assert.match(app, /--text:#14151A;/);
});

test("a barra lateral e o botão de ação usam o token do preto", () => {
  const app = ler("app.html");
  assert.match(app, /#sidebar\{width:210px;background:var\(--ink\)/);
  assert.match(app, /\.btn-primary\{background:var\(--ink\)/);
  assert.match(app, /\.auth-btn\{width:100%;background:var\(--ink\)/);
});

// ─── O símbolo ────────────────────────────────────────────────────────

test("o logo é vetor, não a foto antiga", () => {
  const app = ler("app.html");
  assert.match(app, /class="logo-img" src="data:image\/svg\+xml;base64,/);
  assert.doesNotMatch(app, /class="logo-img" src="data:image\/jpeg/);
});

test("a tela de entrada copia o logo da barra lateral — o laço continua de pé", () => {
  // showAuthScreen não tem logo próprio: ele lê o src do <img> da lateral.
  // Trocar aquele <img> por um <svg> em linha deixaria a entrada sem marca.
  const acesso = ler("js/03-acesso.js");
  assert.match(acesso, /querySelector\("#sidebar \.logo-img"\)/);
  assert.match(ler("app.html"), /<img class="logo-img"/);
});

// ─── O nome ───────────────────────────────────────────────────────────

test("não sobrou 'Gestão de Contas' em tela nenhuma", () => {
  const culpados = arquivosComCor().filter((f) => ler(f).includes("Gestão de Contas"));
  assert.deepEqual(culpados, [], "nome antigo ainda visível em: " + culpados.join(", "));
});

test("o nome novo aparece onde o usuário olha", () => {
  assert.match(ler("app.html"), /<title>OTDE Performance<\/title>/);
  assert.match(ler("app.html"), /<span>PERFORMANCE<\/span>/);
  assert.match(ler("app.html"), /OTDE Performance v2\.0/);
  assert.match(ler("js/03-acesso.js"), /<span>PERFORMANCE<\/span>/);
});

// ─── O que NÃO podia mudar ────────────────────────────────────────────

test("cor de estado continua sendo cor de estado", () => {
  // Verde, vermelho e âmbar dizem "em dia", "atrasado", "atenção". Se
  // virassem ouro junto com a marca, o sistema perderia o aviso.
  const app = ler("app.html") + ler("js/04-telas.js");
  assert.ok(app.includes("#16a34a") || app.includes("#dcfce7"), "o verde de 'em dia' sumiu");
  assert.ok(app.includes("#dc2626") || app.includes("#b91c1c"), "o vermelho de 'atrasado' sumiu");
  assert.ok(app.includes("#92400e") || app.includes("#fef3c7"), "o âmbar de 'atenção' sumiu");
});
