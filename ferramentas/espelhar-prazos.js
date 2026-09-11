// Copia js/prazos.js para functions/prazos.js.
//
// Por que existe: as regras de "está vencendo" e "está sem desconto" são as
// MESMAS no painel e no gerador de tarefas. Escrever duas vezes é ter duas
// versões da mesma regra para manter em sincronia — e quando elas divergem, o
// painel mostra uma coisa e a tarefa cobra outra, sem erro nenhum aparecer.
//
// A mecânica do espelho mora em ferramentas/espelho.js; aqui fica só qual
// arquivo copia para onde. O teste espelho-prazos.test.js quebra se as duas
// divergirem.
//
// Rodar:  node ferramentas/espelhar-prazos.js

import path from "node:path";
import { RAIZ, marcadorDe, conteudoEspelho, originalDoEspelho, espelhar } from "./espelho.js";

export const ORIGEM = path.join(RAIZ, "js", "prazos.js");
export const ESPELHO = path.join(RAIZ, "functions", "prazos.js");
export const MARCADOR = marcadorDe("espelhar-prazos.js", "js/prazos.js");

export { conteudoEspelho, originalDoEspelho };

// Só copia quando chamado direto na linha de comando; importar não escreve nada.
if (process.argv[1] && process.argv[1].endsWith("espelhar-prazos.js")) {
  console.log(espelhar({ origem: ORIGEM, espelho: ESPELHO, marcador: MARCADOR }));
}
