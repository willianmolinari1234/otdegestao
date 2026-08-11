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
