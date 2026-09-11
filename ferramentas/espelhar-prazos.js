// Copia js/prazos.js para functions/prazos.js.
//
// Por que existe: as regras de "está vencendo" e "está sem desconto" são as
// MESMAS no painel e no gerador de tarefas. Escrever duas vezes é ter duas
// versões da mesma regra para manter em sincronia — e quando elas divergem, o
// painel mostra uma coisa e a tarefa cobra outra, sem erro nenhum aparecer.
//
// Não dá para os dois lados lerem o mesmo arquivo: o Hosting não publica
// functions/** e o deploy de functions só empacota a pasta functions/. Então
// o original é js/prazos.js e functions/prazos.js é cópia gerada, nunca
// editada à mão. O teste espelho-prazos.test.js quebra se as duas divergirem.
//
// Rodar:  node ferramentas/espelhar-prazos.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Caminhos ancorados neste arquivo, não na pasta em que o comando foi chamado.
// O predeploy do Firebase roda da raiz do projeto, mas depender disso é uma
// suposição a mais — e um deploy que copia do lugar errado subiria backend com
// regra diferente da do painel, sem erro nenhum aparecer.
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MARCADOR =
  "// GERADO por ferramentas/espelhar-prazos.js — NÃO EDITE. O original é js/prazos.js.";

export const ORIGEM = path.join(RAIZ, "js", "prazos.js");
export const ESPELHO = path.join(RAIZ, "functions", "prazos.js");

/** Conteúdo que o espelho deve ter, dado o conteúdo do original. */
export function conteudoEspelho(original) {
  return MARCADOR + "\n" + original;
}

/** O original de dentro de um espelho (ou null se não tiver o marcador). */
export function originalDoEspelho(espelho) {
  const q = espelho.indexOf("\n");
  if (q < 0 || espelho.slice(0, q) !== MARCADOR) return null;
  return espelho.slice(q + 1);
}

// Só copia quando chamado direto na linha de comando; importar não escreve nada.
if (process.argv[1] && process.argv[1].endsWith("espelhar-prazos.js")) {
  const original = fs.readFileSync(ORIGEM, "utf8");
  fs.writeFileSync(ESPELHO, conteudoEspelho(original));
  console.log(`${ESPELHO} atualizado a partir de ${ORIGEM}`);
}
