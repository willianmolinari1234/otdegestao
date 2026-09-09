// Lógica pura do backfill dos campos denormalizados de `products` e `listings`.
//
// Decide, para UM documento, quais campos entrariam na gravação — sem tocar no
// Firestore, sem rede, sem emulador. Fica separada para o teste em testes/
// provar a regra sozinho.
//
// Regras (as mesmas do enunciado da fase 6):
//   · Preenche só o que está vazio ou ausente. Valor já gravado nunca é tocado.
//   · Campo cuja ORIGEM também está vazia não entra — não grava "" nem [].
//   · custId sem proprietário, ou storeId sem loja: é órfão. Não adivinha.
//     Um documento órfão não recebe NENHUM campo, mesmo os que dariam para
//     resolver — dono desconhecido não se remenda em silêncio.
//   · Idempotente: rodar de novo não acha nada para preencher.
//
// Nunca decide nada sobre margem, lucro, custo, preco, criadoPor ou criadoEm.
// Backfill não é digitação e não pode virar autoria.

export const vazioTexto = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export const vazioLista = (v) => !Array.isArray(v) || v.length === 0;

// Marketplaces do proprietário. Espelha `mktsDoCliente()` do front
// (js/02-utilitarios.js): lista própria quando preenchida; senão, deduz das
// lojas dele. Vazio continua vazio — quem não tem loja nem lista não recebe [].
export function mktsDoProprietario(proprietario, lojasDoProprietario) {
  const propria = Array.isArray(proprietario && proprietario.marketplaces)
    ? proprietario.marketplaces.filter(Boolean)
    : [];
  if (propria.length) return [...new Set(propria)];
  const daslojas = (lojasDoProprietario || []).map((l) => l && l.mkt).filter(Boolean);
  return [...new Set(daslojas)];
}

// origem: os valores já resolvidos ({ custNome, storeNome, storeMkt, mkts }),
// cada um podendo chegar vazio ("" ou []) quando não deu para resolver.
// Devolve só os campos que ENTRARIAM na gravação.
export function planejar(tipo, doc, origem) {
  const campos = {};
  if (vazioTexto(doc.custNome) && !vazioTexto(origem.custNome)) {
    campos.custNome = origem.custNome;
  }
  if (vazioLista(doc.mkts) && !vazioLista(origem.mkts)) {
    campos.mkts = origem.mkts;
  }
  if (tipo === "listing") {
    if (vazioTexto(doc.storeNome) && !vazioTexto(origem.storeNome)) {
      campos.storeNome = origem.storeNome;
    }
    if (vazioTexto(doc.storeMkt) && !vazioTexto(origem.storeMkt)) {
      campos.storeMkt = origem.storeMkt;
    }
  }
  return campos;
}

// Decisão completa para um documento.
//   tipo: "product" | "listing"
//   doc:  os dados atuais do documento
//   ctx:  { proprietario, loja, lojasDoProprietario }
//         proprietario/loja = objeto do cadastro, ou null quando não achou.
//
// Retorna { campos, orfao } — `campos` vazio quando não há nada a fazer ou
// quando o documento é órfão; `orfao` lista as referências que não resolveram.
export function decidir(tipo, doc, ctx) {
  const { proprietario = null, loja = null, lojasDoProprietario = [] } = ctx || {};
  const orfao = [];
  if (!proprietario) orfao.push({ campo: "custId", valor: doc.custId || null });
  if (tipo === "listing" && !loja) orfao.push({ campo: "storeId", valor: doc.storeId || null });
  if (orfao.length) return { campos: {}, orfao };

  const origem = {
    custNome: proprietario.name || "",
    mkts: mktsDoProprietario(proprietario, lojasDoProprietario),
    storeNome: loja ? (loja.name || "") : "",
    storeMkt: loja ? (loja.mkt || "") : "",
  };
  return { campos: planejar(tipo, doc, origem), orfao: [] };
}
