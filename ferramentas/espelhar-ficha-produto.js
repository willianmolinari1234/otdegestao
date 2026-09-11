// Copia js/ficha-produto.js para functions/ficha-produto.js.
//
// Por que existe: quais campos a ficha tem e quais são obrigatórios vale nos
// DOIS lados — a tela desenha o formulário a partir disso e o backend recusa a
// gravação a partir disso. Se as duas listas divergissem, o cliente
// preencheria o que a tela pede e levaria erro do servidor sem entender.
//
// A mecânica do espelho mora em ferramentas/espelho.js; aqui fica só qual
// arquivo copia para onde. O teste espelho-ficha-produto.test.js quebra se as
// duas divergirem.
//
// Rodar:  node ferramentas/espelhar-ficha-produto.js

import path from "node:path";
import { RAIZ, marcadorDe, conteudoEspelho, originalDoEspelho, espelhar } from "./espelho.js";

export const ORIGEM = path.join(RAIZ, "js", "ficha-produto.js");
export const ESPELHO = path.join(RAIZ, "functions", "ficha-produto.js");
export const MARCADOR = marcadorDe("espelhar-ficha-produto.js", "js/ficha-produto.js");

export { conteudoEspelho, originalDoEspelho };

// Só copia quando chamado direto na linha de comando; importar não escreve nada.
if (process.argv[1] && process.argv[1].endsWith("espelhar-ficha-produto.js")) {
  console.log(espelhar({ origem: ORIGEM, espelho: ESPELHO, marcador: MARCADOR }));
}
