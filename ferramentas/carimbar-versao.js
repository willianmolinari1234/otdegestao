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

if (faltando.length) {
  console.error("  !! arquivos não encontrados: " + faltando.join(", "));
  process.exit(1);
}

fs.writeFileSync(ARQUIVO, html);
console.log(`   ${trocados} script(s) carimbado(s)`);
