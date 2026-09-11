// GERADO por ferramentas/espelhar-ficha-produto.js — NÃO EDITE. O original é js/ficha-produto.js.
// A ficha do produto: quais campos existem, quais são obrigatórios, e o id.
//
// Isto vale nos DOIS lados. A tela do cliente usa para desenhar o formulário,
// barrar o salvamento e marcar na lista o produto incompleto; o backend usa
// para recusar a gravação. Se as duas listas divergissem, o cliente
// preencheria o que a tela pede e levaria erro do servidor sem entender.
//
// Este arquivo é o ORIGINAL. functions/ficha-produto.js é cópia gerada por
// ferramentas/espelhar-ficha-produto.js — não edite a cópia.

// Os obrigatórios decididos com o Willian em 11/09/2026. É a ficha que o
// especialista precisa para conseguir anunciar — não é a precificação.
// `custo` de propósito NÃO está aqui: o cliente que ainda não sabe o custo
// precisa conseguir mandar o resto, e o custo tem tratamento próprio na
// gravação.
export const CAMPOS_DA_FICHA = [
  { campo: "nome",           rotulo: "Nome do produto",      obrigatorio: true,  dica: "Como o produto é chamado" },
  { campo: "sku",            rotulo: "SKU",                  obrigatorio: true,  dica: "O código do produto" },
  { campo: "peso",           rotulo: "Peso",                 obrigatorio: true,  dica: "Com a embalagem. Ex.: 180g" },
  { campo: "medidasProduto", rotulo: "Medidas do produto",   obrigatorio: true,  dica: "Ex.: 50x30cm" },
  { campo: "medidas",        rotulo: "Medidas da embalagem", obrigatorio: true,  dica: "Ex.: 22x16x6cm" },
  { campo: "fotos",          rotulo: "Foto",                 obrigatorio: true,  dica: "Link do Google Drive, como 'qualquer pessoa com o link'. Um por linha.", longo: true, linhas: 2 },
  { campo: "obs",            rotulo: "Observações",          obrigatorio: true,  dica: "O que quem for anunciar precisa saber", longo: true },
  { campo: "tamanhos",       rotulo: "Tamanhos",             obrigatorio: false, dica: "" },
  { campo: "cores",          rotulo: "Cores",                obrigatorio: false, dica: "" },
  { campo: "material",       rotulo: "Material",             obrigatorio: false, dica: "" },
  { campo: "video",          rotulo: "Vídeo",                obrigatorio: false, dica: "Link do Google Drive. Um por linha.", longo: true, linhas: 2 },
];

export const texto = (v) => (v === null || v === undefined) ? "" : String(v).trim();

/**
 * Campo de vários links (foto, vídeo) digitado um por linha.
 * Guarda lista quando há mais de um e texto simples quando há um só — é assim
 * que o dado já existe hoje, e converter tudo para lista quebraria a
 * miniatura, que distingue os dois casos.
 */
export function listaDeLinks(valor) {
  const itens = (Array.isArray(valor) ? valor : String(valor ?? "").split(/[\r\n]+/))
    .map((x) => texto(x)).filter(Boolean);
  if (!itens.length) return "";
  return itens.length === 1 ? itens[0] : itens;
}

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
 * Mesma normalização da `idDoProduto()` do js/planilha-produtos.js — as duas
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
