// Cruzamento entre o que foi VENDIDO (Shopee) e o que CUSTA (planilha).
//
// Este arquivo é ESM e roda nos dois lados: o navegador carrega com
// <script type="module"> e o teste importa direto. Assim a regra de
// casamento existe UMA vez — se ela mudar, o teste acusa. As contas de
// dinheiro que foram copiadas em dois lugares já nos custaram caro antes.
//
// Regra de ouro deste módulo: quando não souber o custo, dizer que não
// sabe. Nunca assumir zero — custo zero vira lucro inflado, e lucro
// inflado numa tela que o cliente vê é pior do que não ter a tela.

/**
 * Deixa o código comparável dos dois lados.
 *
 * A Shopee devolve "08" onde a planilha tem "8"; devolve "  1759 " onde a
 * planilha tem "1759". Sem isso o sistema não acha o custo e mostra lucro
 * zero sem reclamar — falha silenciosa, a pior espécie.
 *
 * O zero à esquerda só cai quando o código é SÓ número: "0800" vira "800",
 * mas "0800-ABC" fica como está, porque aí o zero pode ser significativo.
 */
export function normalizarSku(valor) {
  const s = String(valor ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return "";
  return /^\d+$/.test(s) ? String(Number(s)) : s;
}

/** Lê número no formato brasileiro: "R$ 1.234,56" → 1234.56 */
export function numeroBR(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[R$\s%]/g, "").trim();
  if (!s) return null;
  // "1.234,56" (BR) vs "1234.56" (US): a vírgula decide.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const SINONIMOS = {
  sku: ["sku", "codigo", "código", "cod", "ref", "referencia", "referência"],
  nome: ["produto", "produtovendido", "descricao", "descrição", "nome", "item"],
  valor: ["valordavenda", "valorvenda", "preco", "preço", "precodevenda", "venda"],
  custo: ["custoproduto", "custodoproduto", "custo", "customercadoria"],
};
const limpaCabecalho = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

/**
 * Interpreta o texto colado da planilha do cliente (Google Sheets / Excel).
 *
 * Colar é o caminho realista: a planilha muda de cliente para cliente e
 * ninguém vai redigitar centenas de produtos. Aceita colunas em qualquer
 * ordem, achando pelo cabeçalho.
 *
 * A planilha do cliente é um REGISTRO DE VENDAS: o mesmo SKU aparece várias
 * vezes porque tem vários anúncios. Aqui isso é reduzido a uma linha por SKU.
 * Se o custo divergir entre as repetições, vira conflito e não é importado —
 * um custo desatualizado numa linha estragaria o lucro em silêncio.
 */
export function interpretarPlanilha(texto) {
  const bruto = String(texto || "").trim();

  // Colar o endereço da planilha é o reflexo natural. Como o link não traz
  // dado nenhum, devolvemos um aviso próprio em vez do genérico "não achei
  // as colunas", que não ensina o que fazer.
  if (/^https?:\/\/\S+$/i.test(bruto)) {
    return { produtos: [], conflitos: [], ignoradas: 0, colunas: null, ehLink: true };
  }

  const linhas = bruto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!linhas.length) return { produtos: [], conflitos: [], ignoradas: 0, colunas: null };

  // Separador: tab (colado do Sheets) > ponto e vírgula > vírgula (CSV baixado).
  // A vírgula fica por último porque também é o separador decimal daqui.
  const amostra = linhas.slice(0, 3).join("\n");
  const sep = amostra.includes("\t") ? "\t" : amostra.includes(";") ? ";" : ",";

  // Divisão respeitando aspas: o CSV do Google Sheets protege com aspas os
  // campos que contêm o separador — inclusive "R$ 1.234,56".
  const separa = (linha) => {
    const out = []; let atual = "", dentro = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') {
        if (dentro && linha[i + 1] === '"') { atual += '"'; i++; }
        else dentro = !dentro;
      } else if (c === sep && !dentro) { out.push(atual); atual = ""; }
      else atual += c;
    }
    out.push(atual);
    return out;
  };

  // Cabeçalho: primeira linha que contenha pelo menos SKU e CUSTO.
  let idxCab = -1, mapa = null;
  for (let i = 0; i < Math.min(linhas.length, 5); i++) {
    const cels = separa(linhas[i]).map(limpaCabecalho);
    const m = {};
    for (const [campo, nomes] of Object.entries(SINONIMOS)) {
      const pos = cels.findIndex((c) => c && nomes.includes(c));
      if (pos >= 0) m[campo] = pos;
    }
    if (m.sku !== undefined && m.custo !== undefined) { idxCab = i; mapa = m; break; }
  }
  if (!mapa) return { produtos: [], conflitos: [], ignoradas: linhas.length, colunas: null };

  const porSku = new Map();
  const conflitos = [];
  let ignoradas = 0;

  for (let i = idxCab + 1; i < linhas.length; i++) {
    const c = separa(linhas[i]);
    const sku = normalizarSku(c[mapa.sku]);
    const custo = numeroBR(c[mapa.custo]);
    if (!sku || custo === null) { ignoradas++; continue; }

    const novo = {
      sku,
      nome: mapa.nome !== undefined ? String(c[mapa.nome] || "").trim() : "",
      valor: mapa.valor !== undefined ? numeroBR(c[mapa.valor]) : null,
      custo,
    };
    const antigo = porSku.get(sku);
    if (!antigo) { porSku.set(sku, novo); continue; }
    if (Number(antigo.custo) !== Number(custo)) {
      conflitos.push({ sku, custos: [antigo.custo, custo], nome: antigo.nome || novo.nome });
      porSku.delete(sku); // não importa nenhum dos dois: o humano decide
    }
  }
  // Conflito remove o SKU; se ele reaparecer depois, não deve voltar sozinho.
  for (const cf of conflitos) porSku.delete(cf.sku);

  return {
    produtos: [...porSku.values()],
    conflitos,
    ignoradas,
    colunas: Object.keys(mapa),
  };
}

/**
 * Monta o índice de custo de uma loja a partir dos produtos da planilha.
 *
 * Aceita SKU no produto e, opcionalmente, SKU por variação — na Shopee o
 * código do anúncio costuma ser igual para todas as variações e só o código
 * da variação distingue tamanho, que é onde o custo muda.
 *
 * @param {Array} produtos  documentos da coleção products
 * @param {string} cli      id da loja
 * @returns {{indice: Map<string,object>, conflitos: Array}}
 */
export function indexarCustos(produtos, cli) {
  const indice = new Map();
  const conflitos = [];

  const por = (sku, dado) => {
    const k = normalizarSku(sku);
    if (!k) return;
    const jaTem = indice.get(k);
    // Mesmo SKU com custo diferente: pode ser planilha desatualizada numa das
    // linhas. Avisamos em vez de escolher um em silêncio.
    if (jaTem && Number(jaTem.custo) !== Number(dado.custo)) {
      conflitos.push({ sku: k, custos: [jaTem.custo, dado.custo], nomes: [jaTem.nome, dado.nome] });
      return; // mantém o primeiro; o aviso é que resolve
    }
    if (!jaTem) indice.set(k, dado);
  };

  for (const p of produtos || []) {
    if (cli && p.cli !== cli) continue;
    const temVars = Array.isArray(p.vars) && p.vars.length > 0;

    if (temVars) {
      for (const v of p.vars) {
        // A variação pode ter código próprio; se não tiver, herda o do produto.
        por(v.sku || p.sku, { custo: Number(v.custo || 0), nome: `${p.nome || ""} ${v.nome || ""}`.trim(), nivel: v.sku ? "variacao" : "produto" });
      }
    } else {
      por(p.sku, { custo: Number(p.custo || 0), nome: p.nome || "", nivel: "produto" });
    }
  }
  return { indice, conflitos };
}

/**
 * Custo de um item vendido.
 *
 * Tenta o código da VARIAÇÃO primeiro: é o mais específico, e é onde o custo
 * realmente muda (P, M, G custam diferente). Só cai para o código do anúncio
 * quando a variação não resolve.
 */
export function custoDoItem(indice, item) {
  const porModelo = indice.get(normalizarSku(item?.model_sku));
  if (porModelo) return { custo: porModelo.custo, achadoPor: "model_sku", nome: porModelo.nome };
  const porAnuncio = indice.get(normalizarSku(item?.item_sku));
  if (porAnuncio) return { custo: porAnuncio.custo, achadoPor: "item_sku", nome: porAnuncio.nome };
  return { custo: null, achadoPor: null, nome: null };
}

/**
 * Preço realmente praticado por código, a partir das vendas.
 *
 * Melhor que o preço digitado à mão: é o que o comprador pagou de fato,
 * e acompanha promoção e mudança de preço sem ninguém precisar atualizar.
 *
 * Devolve dois índices porque o código da variação é mais específico que o
 * do anúncio. O do anúncio soma todas as variações — o que serve para
 * produto sem variação cadastrada, e por isso é só a reserva.
 *
 * O preço é a MÉDIA ponderada pela quantidade: o mesmo produto costuma ter
 * vários anúncios com preços diferentes, e vendas com desconto puxam o
 * valor para baixo. É o preço médio praticado, não o de tabela.
 */
export function precosPraticados(itens) {
  const somar = (mapa, chave, it) => {
    const k = normalizarSku(chave);
    if (!k) return;
    const r = mapa.get(k) || { valor: 0, qtd: 0 };
    r.valor += Number(it?.valor || 0);
    r.qtd += Number(it?.qtd || 0);
    mapa.set(k, r);
  };
  const porVariacao = new Map(), porAnuncio = new Map();
  for (const it of itens || []) {
    somar(porVariacao, it?.model_sku, it);
    somar(porAnuncio, it?.item_sku, it);
  }
  const fechar = (m) => {
    const out = new Map();
    for (const [k, r] of m) {
      if (r.qtd > 0) out.set(k, { preco: Number((r.valor / r.qtd).toFixed(2)), qtd: r.qtd });
    }
    return out;
  };
  return { porVariacao: fechar(porVariacao), porAnuncio: fechar(porAnuncio) };
}

/** Preço praticado de um SKU, variação na frente do anúncio. */
export function precoDoSku(precos, sku) {
  const k = normalizarSku(sku);
  if (!k || !precos) return null;
  return precos.porVariacao.get(k) || precos.porAnuncio.get(k) || null;
}

/**
 * Custo total de um período e, sobretudo, QUANTO dele nós realmente sabemos.
 *
 * `cobertura` é a fração da receita cujo custo é conhecido. A tela deve
 * mostrar esse número junto do lucro: um lucro calculado sobre 40% dos itens
 * não é um lucro, é um palpite — e precisa estar claro que é.
 *
 * @param {Array} itens  [{item_sku, model_sku, qtd, valor, nome}]
 */
export function apurarCustos(itens, indice) {
  let receita = 0, receitaComCusto = 0, custoTotal = 0, itensSemCusto = 0;
  const semCusto = new Map();

  for (const it of itens || []) {
    const qtd = Number(it?.qtd || 0);
    const valor = Number(it?.valor || 0);
    receita += valor;

    const { custo } = custoDoItem(indice, it);
    if (custo === null || !isFinite(custo)) {
      itensSemCusto += qtd;
      const chave = normalizarSku(it?.model_sku) || normalizarSku(it?.item_sku) || "(sem código)";
      const reg = semCusto.get(chave) || { sku: chave, nome: it?.nome || "", qtd: 0, valor: 0 };
      reg.qtd += qtd; reg.valor += valor;
      semCusto.set(chave, reg);
      continue;
    }
    receitaComCusto += valor;
    custoTotal += custo * qtd;
  }

  const r2 = (v) => Number(v.toFixed(2));
  return {
    receita: r2(receita),
    receitaComCusto: r2(receitaComCusto),
    custoTotal: r2(custoTotal),
    // Margem bruta só sobre a parte conhecida — misturar com o desconhecido
    // daria um número que parece completo e não é.
    margemBruta: r2(receitaComCusto - custoTotal),
    cobertura: receita > 0 ? Number((receitaComCusto / receita).toFixed(4)) : 0,
    itensSemCusto,
    semCusto: [...semCusto.values()].sort((a, b) => b.valor - a.valor).slice(0, 30),
  };
}
