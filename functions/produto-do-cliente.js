// A ficha do produto preenchida pelo PRÓPRIO cliente, na tela, sem planilha.
//
// Por que isto não é uma gravação direta do navegador: a regra do Firestore
// deixa o cliente criar produto, mas PROÍBE ele de escrever `mkts` — e é de
// propósito, porque `mkts` decide qual especialista enxerga o produto. Se o
// cliente escrevesse esse campo, ele escolheria quem vê o custo dele.
//
// A consequência é que um produto gravado pelo navegador do cliente nasce sem
// `mkts` e fica invisível para o especialista, que é justamente quem precisa
// dele para anunciar. Cadastrar e não aparecer para ninguém é pior do que não
// ter a tela. Por isso a gravação passa por aqui, com Admin SDK, e o `mkts` é
// carimbado a partir do proprietário — o mesmo que a importação de planilha
// já faz.
//
// Este arquivo não conhece Firestore nem rede. É só a decisão do que gravar,
// no padrão do `tarefas-automaticas.js` e do `backfill-denormalizados.js`.
//
// Quais campos a ficha tem e quais são obrigatórios vem de `ficha-produto.js`,
// que é cópia gerada de `js/ficha-produto.js` — a MESMA lista que a tela usa
// para desenhar o formulário. Sem isso, tela e backend divergiriam e o cliente
// preencheria o que a tela pede para levar erro do servidor.

import {
  CAMPOS_DA_FICHA, texto, listaDeLinks, faltandoNaFicha, chaveDoProduto, idDoProduto,
} from "./ficha-produto.js";

// Reexportados para quem importa só este módulo não precisar saber que a
// definição da ficha mora no espelho.
export { CAMPOS_DA_FICHA, faltandoNaFicha, chaveDoProduto, idDoProduto };

export class ErroProduto extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/**
 * Monta o documento a gravar. Devolve `{ id, doc, criando }`.
 *
 * `existente` é o documento que já está no Firestore, ou null.
 *
 * Regra de sobrescrita, e o porquê de ela ser diferente da importação:
 * na planilha, campo vazio NÃO apaga, porque numa planilha real o peso vem em
 * 3 de 25 linhas e reimportar apagaria o que outra aba trouxe. Aqui é o
 * contrário — o cliente está OLHANDO o campo preenchido na tela e decidiu
 * apagar. O que está na tela é o que fica.
 *
 * A exceção é `custo`: ele vem da planilha, alimenta a margem, e apagá-lo
 * zeraria o número do painel sem ninguém perceber. Custo vazio não apaga.
 * Nunca se toca em `preco`, `margem` e `lucro` — esses são do anúncio, e a
 * decisão travada do projeto é que margem de planilha jamais é recalculada.
 */
export function montarProdutoDoCliente({
  entrada = {}, custId, custNome = "", mkts = [], existente = null,
  autor = {}, agora = new Date().toISOString(),
}) {
  if (!custId) throw new ErroProduto("Não consegui identificar de quem é este produto.", 403);

  // Foto e vídeo aceitam vários links, um por linha: um link só continua
  // guardado como texto, porque é assim que o dado já existe e a miniatura
  // distingue os dois casos.
  const ficha = {};
  for (const { campo, longo, linhas } of CAMPOS_DA_FICHA) {
    ficha[campo] = (longo && linhas) ? listaDeLinks(entrada[campo]) : texto(entrada[campo]);
  }

  const faltando = faltandoNaFicha(ficha);
  if (faltando.length) {
    throw new ErroProduto(
      faltando.length === 1
        ? `Falta preencher: ${faltando[0]}.`
        : `Faltam preencher: ${faltando.join(", ")}.`,
    );
  }

  // Edição preserva o id e a chave originais. Se o id saísse do SKU a cada
  // salvamento, corrigir um SKU digitado errado deixaria o produto antigo
  // para trás como órfão — e órfão aqui não dá erro, só some da tela do dono.
  const chave = existente && existente.chave ? existente.chave : chaveDoProduto(ficha.sku);
  const id = existente && existente.id ? existente.id : idDoProduto(custId, chave);

  const doc = {
    id, custId, custNome, chave,
    // `mkts` vem do proprietário, nunca da entrada: é o campo que decide quem
    // enxerga o produto. Entrada do navegador não escreve isto.
    mkts: Array.isArray(mkts) ? mkts.filter(Boolean) : [],
    origem: existente ? (existente.origem || "cliente") : "cliente",
    atualizadoEm: agora,
    ...ficha,
  };

  // Custo é opcional e tem tratamento próprio: número válido grava, vazio
  // preserva o que havia, texto inválido reclama em vez de virar NaN.
  const custoBruto = texto(entrada.custo);
  if (custoBruto !== "") {
    const n = Number(custoBruto.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
    if (!isFinite(n) || n < 0) throw new ErroProduto("Custo inválido. Use apenas números, como 12,90.");
    doc.custo = n;
  }

  // Autoria dupla em toda gravação, como manda o projeto: quem digitou e por
  // quem. A equipe pode estar preenchendo a ficha entrando como o cliente.
  const autoria = { uid: autor.uid || "", emNomeDe: autor.emNomeDe || custId };
  if (existente) {
    doc.atualizadoPor = autoria;
  } else {
    doc.criadoEm = agora;
    doc.criadoPor = autoria;
  }

  return { id, doc, criando: !existente };
}
