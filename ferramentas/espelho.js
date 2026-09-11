// A mecânica de espelhar um arquivo de js/ para functions/.
//
// Por que espelhos existem neste projeto: o Hosting não publica functions/** e
// o deploy de functions só empacota a pasta functions/. Quando a MESMA regra
// precisa valer no navegador e no backend, não dá para os dois lados lerem o
// mesmo arquivo — e escrever duas vezes é ter duas versões para manter em
// sincronia, que divergem sem erro nenhum aparecer.
//
// Então: o original mora em js/, a cópia em functions/ é gerada e nunca
// editada à mão, e um teste de guarda quebra se as duas divergirem.
//
// Este arquivo é só a mecânica. Cada espelho tem o seu próprio script em
// ferramentas/espelhar-*.js, que diz qual arquivo copia para onde.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Caminhos ancorados neste arquivo, não na pasta em que o comando foi chamado.
// O predeploy do Firebase roda da raiz do projeto, mas depender disso é uma
// suposição a mais — e um deploy que copia do lugar errado subiria backend com
// regra diferente da do painel, sem erro nenhum aparecer.
export const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** O aviso que abre todo espelho, dizendo quem o gerou e de onde. */
export function marcadorDe(script, origem) {
  return `// GERADO por ferramentas/${script} — NÃO EDITE. O original é ${origem}.`;
}

/** Conteúdo que o espelho deve ter, dado o conteúdo do original. */
export function conteudoEspelho(original, marcador) {
  return marcador + "\n" + original;
}

/** O original de dentro de um espelho (ou null se não tiver o marcador). */
export function originalDoEspelho(espelho, marcador) {
  const q = espelho.indexOf("\n");
  if (q < 0 || espelho.slice(0, q) !== marcador) return null;
  return espelho.slice(q + 1);
}

/** Reescreve o espelho a partir do original. */
export function espelhar({ origem, espelho, marcador }) {
  fs.writeFileSync(espelho, conteudoEspelho(fs.readFileSync(origem, "utf8"), marcador));
  return `${espelho} atualizado a partir de ${origem}`;
}
