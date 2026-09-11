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

export class ErroProduto extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Os obrigatórios decididos com o Willian em 11/09/2026. É a ficha que o
// especialista precisa para conseguir anunciar — não é a precificação.
// `custo` de propósito NÃO está aqui: o cliente que ainda não sabe o custo
// precisa conseguir mandar o resto, e o custo tem tratamento próprio lá
// embaixo.
export const CAMPOS_DA_FICHA = [
  { campo: "nome",           rotulo: "Nome do produto",       obrigatorio: true },
  { campo: "sku",            rotulo: "SKU",                   obrigatorio: true },
  { campo: "peso",           rotulo: "Peso",                  obrigatorio: true },
  { campo: "medidasProduto", rotulo: "Medidas do produto",    obrigatorio: true },
  { campo: "medidas",        rotulo: "Medidas da embalagem",  obrigatorio: true },
  { campo: "fotos",          rotulo: "Foto",                  obrigatorio: true },
  { campo: "obs",            rotulo: "Observações",           obrigatorio: true },
  { campo: "tamanhos",       rotulo: "Tamanhos",              obrigatorio: false },
  { campo: "cores",          rotulo: "Cores",                 obrigatorio: false },
  { campo: "material",       rotulo: "Material",              obrigatorio: false },
  { campo: "video",          rotulo: "Vídeo",                 obrigatorio: false },
];

const texto = (v) => (v === null || v === undefined) ? "" : String(v).trim();

/**
 * O que falta na ficha, em português, para a tela dizer ao cliente.
 * Serve tanto para barrar o salvamento quanto para marcar na lista o produto
 * que veio da planilha e está incompleto.
 */
export function faltandoNaFicha(produto) {
  const p = produto || {};
  return CAMPOS_DA_FICHA
    .filter((c) => c.obrigatorio && !texto(Array.isArray(p[c.campo]) ? p[c.campo][0] : p[c.campo]))
    .map((c) => c.rotulo);
}

/**
 * Id determinístico, como todo o resto do projeto: `custId__chave`.
 * Mesma normalização da `idDoProduto()` do `js/planilha-produtos.js` — as duas
 * precisam produzir o MESMO id, senão o cliente cadastra um produto e a
 * reimportação da planilha cria um segundo com outro nome do mesmo item.
 */
export function chaveDoProduto(valor) {
  return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export function idDoProduto(custId, chave) {
  return `${custId}__${chaveDoProduto(chave) || "sem-nome"}`;
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

  const ficha = {};
  for (const { campo } of CAMPOS_DA_FICHA) ficha[campo] = texto(entrada[campo]);

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
