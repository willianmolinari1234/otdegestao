// Carimba os <script src="js/...js"> do app.html com ?v=<hash do conteúdo>.
//
// Por que: os arquivos js só podem ficar guardados no navegador por muito
// tempo se o endereço mudar quando o conteúdo muda. Com o carimbo, publicar
// uma correção troca a URL e o navegador busca a nova na hora — sem depender
// de o usuário limpar cache.
//
// O hash é do CONTEÚDO, não da data: republicar sem alterar nada mantém a
// mesma URL e o navegador continua usando o que já tem.
//
// Rodar:  node ferramentas/carimbar-versao.js

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..");
const ARQUIVO = path.join(RAIZ, "app.html");

const hashDe = (arquivoJs) => {
  const caminho = path.join(RAIZ, arquivoJs);
  if (!fs.existsSync(caminho)) return null;
  return crypto.createHash("sha256")
    .update(fs.readFileSync(caminho)).digest("hex").slice(0, 8);
};

let html = fs.readFileSync(ARQUIVO, "utf8");
let trocados = 0;
let faltando = [];

// O carimbo anterior faz parte do casamento (grupo opcional ANTES da aspa de
// fechamento). Se ficasse depois, a segunda execução não encontraria nada e o
// hash nunca seria atualizado — o navegador continuaria com o js antigo, que é
// exatamente o problema que este script existe para evitar.
html = html.replace(
  /<script src="(js\/[^"?]+\.js)(\?v=[a-f0-9]+)?"/g,
  (todo, arquivo) => {
    const h = hashDe(arquivo);
    if (!h) { faltando.push(arquivo); return todo; }
    trocados++;
    return `<script src="${arquivo}?v=${h}"`;
  }
);

// Import de módulo — import ... from "./js/custos.js".
// Ficou de fora na primeira versão e deu erro em produção: o navegador
// serviu o custos.js antigo por causa do cache de 7 dias e a tela de
// importação quebrou com "interpretarPlanilha is not a function".
// Cache longo só é seguro se TODA forma de carregar arquivo for carimbada.
html = html.replace(
  /(from\s+["'])(\.\/)?(js\/[^"'?]+\.js)(\?v=[a-f0-9]+)?(["'])/g,
  (todo, ini, ponto, arquivo, _v, fim) => {
    const h = hashDe(arquivo);
    if (!h) { faltando.push(arquivo); return todo; }
    trocados++;
    return `${ini}${ponto || ""}${arquivo}?v=${h}${fim}`;
  }
);

if (faltando.length) {
  console.error("  !! arquivos não encontrados: " + faltando.join(", "));
  process.exit(1);
}

// Trava: qualquer referência a js/ sem carimbo é erro de publicação.
// O import de módulo escapou uma vez e, com o cache de 7 dias, o navegador
// serviu código velho até quebrar em produção. Uma referência sem carimbo
// vale por um bug que só aparece na máquina de quem já visitou o site.
const semCarimbo = [...html.matchAll(/(js\/[A-Za-z0-9._-]+\.js)(\?v=[a-f0-9]+)?/g)]
  .filter((m) => !m[2]).map((m) => m[1]);
if (semCarimbo.length) {
  console.error("  !! sem carimbo: " + [...new Set(semCarimbo)].join(", "));
  console.error("     Com cache longo, isso serve versão antiga ao usuário.");
  process.exit(1);
}

fs.writeFileSync(ARQUIVO, html);
console.log(`   ${trocados} script(s) carimbado(s), nenhum sem carimbo`);
