// Copia js/taxas.js para functions/taxas.js.
//
// Por que existe: o que cada marketplace desconta precisa valer igual no
// navegador do cliente, no do especialista e no backend. Escrever duas vezes
// é ter duas versões da mesma conta — e quando divergem, a tela mostra uma
// margem e o dado gravado é outro, sem erro nenhum aparecer.
//
// A mecânica do espelho mora em ferramentas/espelho.js; aqui fica só qual
// arquivo copia para onde. O teste espelho-taxas.test.js quebra se as duas
// divergirem.
//
// Rodar:  node ferramentas/espelhar-taxas.js

import path from "node:path";
import { RAIZ, marcadorDe, conteudoEspelho, originalDoEspelho, espelhar } from "./espelho.js";

export const ORIGEM = path.join(RAIZ, "js", "taxas.js");
export const ESPELHO = path.join(RAIZ, "functions", "taxas.js");
export const MARCADOR = marcadorDe("espelhar-taxas.js", "js/taxas.js");

export { conteudoEspelho, originalDoEspelho };

// Só copia quando chamado direto na linha de comando; importar não escreve nada.
if (process.argv[1] && process.argv[1].endsWith("espelhar-taxas.js")) {
  console.log(espelhar({ origem: ORIGEM, espelho: ESPELHO, marcador: MARCADOR }));
}
