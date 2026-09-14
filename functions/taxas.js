// GERADO por ferramentas/espelhar-taxas.js — NÃO EDITE. O original é js/taxas.js.
// O que cada marketplace desconta de uma venda.
//
// Existe porque a planilha do cliente faz DOIS trabalhos: traz a ficha do
// produto e traz margem e lucro já com comissão, frete e imposto descontados.
// O cliente sabe o custo dele; ele não sabe a taxa do marketplace. Quando a
// planilha sai de cena, esses números precisam nascer daqui.
//
// **A decisão travada continua valendo: margem que veio da planilha NUNCA é
// recalculada.** Preço menos custo dá 52% onde o real é 7,5%. O que este
// arquivo calcula só entra onde não há valor gravado, e sempre rotulado como
// estimativa — nunca por cima do número real.
//
// Por que os números moram num arquivo e não no Firestore: comissão de
// marketplace é informação pública, muda uma ou duas vezes por ano, e precisa
// valer igual no navegador do cliente, no do especialista e no backend. Em
// arquivo, não exige mexer nas regras de segurança (que é sempre risco), e o
// git guarda quando cada taxa mudou — o que nenhuma tela de cadastro daria.
//
// Este arquivo é o ORIGINAL. functions/taxas.js é cópia gerada por
// ferramentas/espelhar-taxas.js — não edite a cópia.

/**
 * Faixas de comissão: `abaixoDe` é o limite SUPERIOR EXCLUSIVO, em reais.
 * A última faixa tem `abaixoDe: null` e vale daí para cima.
 *
 * Cuidado com a diferença para o frete, logo abaixo, onde o limite é
 * INCLUSIVO — é assim nas tabelas dos dois marketplaces e inverter faz o
 * produto de exatamente 0,3 kg cair na faixa errada.
 *
 * Números conferidos com o Willian em 11/09/2026, das tabelas oficiais.
 *
 * `completa` diz que a tabela DO MARKETPLACE não tem lacuna. O que ela não
 * cobre — a comissão da OTDE e o imposto — não é tabela, é cadastro: vem de
 * `customers.fee` e `customers.imposto`, com exceção por loja em `clients`.
 * Esses dois chegam aqui como parâmetro, e sem eles a conta sai OTIMISTA (nos
 * exemplos conferidos, 52% onde o real é da ordem de 7,5%). Por isso o
 * resultado carrega a sua própria bandeira `completa`, lá embaixo.
 */
export const TAXAS = {
  shopee: {
    nome: "Shopee",
    // "Até R$79,99", "Acima de R$80 até R$99,99" e assim por diante. O valor
    // exato de R$80,00 cai no vão entre as duas linhas da tabela oficial;
    // aqui ele entra na faixa de cima, que é a leitura literal de "acima de".
    comissao: [
      { abaixoDe: 80, percentual: 20, fixo: 4, subsidioPix: 0 },
      { abaixoDe: 100, percentual: 14, fixo: 16, subsidioPix: 5 },
      { abaixoDe: 200, percentual: 14, fixo: 20, subsidioPix: 5 },
      { abaixoDe: 500, percentual: 14, fixo: 26, subsidioPix: 5 },
      { abaixoDe: null, percentual: 14, fixo: 26, subsidioPix: 8 },
    ],
    // A Shopee não cobra frete do lojista — confirmado pelo Willian em
    // 11/09/2026. `null` aqui não é lacuna: é a informação de que não há.
    frete: null,
    completa: true,
  },
  shein: {
    nome: "Shein",
    comissao: [{ abaixoDe: null, percentual: 20, fixo: 0, subsidioPix: 0 }],
    // Intermediação de frete, em reais por unidade. `ateKg` é o limite
    // superior INCLUSIVO: a linha "0 kg < p ≤ 0,3 kg" é `{ ateKg: 0.3 }`.
    frete: [
      { ateKg: 0.3, valor: 4 },
      { ateKg: 0.6, valor: 5 },
      { ateKg: 0.9, valor: 6 },
      { ateKg: 1.2, valor: 8 },
      { ateKg: 1.5, valor: 10 },
      { ateKg: 2, valor: 12 },
      { ateKg: 5, valor: 15 },
      { ateKg: 9, valor: 32 },
      { ateKg: 13, valor: 63 },
      { ateKg: 17, valor: 73 },
      { ateKg: 23, valor: 89 },
      { ateKg: 30, valor: 106 },
    ],
    completa: true,
  },
  // Números lidos por mim nas páginas oficiais do TikTok Shop Brasil em
  // 14/09/2026, não de blog:
  //
  //   Tarifa de Comissão da Plataforma (artigo de 12/06/2026) — vigente desde
  //   15/07/2026: item abaixo de R$50 paga 10% + R$4 por item; de R$50 para
  //   cima paga 6% + R$6. A base é o preço APÓS o desconto do vendedor.
  //
  //   Programa de Taxas de Envio (artigo de 31/08/2026): quem está no programa
  //   paga mais 6% do preço de venda de todo pedido entregue, limitado a R$50
  //   por produto. O vendedor entra automaticamente; sair custa o subsídio de
  //   frete ao comprador e o tráfego extra de anúncios.
  //
  // Por isso o frete aqui é PERCENTUAL, e não uma tabela por peso como a da
  // Shein: no TikTok o que o lojista paga não depende do peso.
  tiktok: {
    nome: "TikTok Shop",
    comissao: [
      { abaixoDe: 50, percentual: 10, fixo: 4, subsidioPix: 0 },
      { abaixoDe: null, percentual: 6, fixo: 6, subsidioPix: 0 },
    ],
    frete: null,
    fretePercentual: { percentual: 6, tetoPorProduto: 50 },
    completa: true,
  },
};
// "TikTok" e "TikTok Shop" são a mesma loja; a segunda forma aparece no
// cadastro de algumas lojas.
TAXAS.tiktokshop = TAXAS.tiktok;

// Padrões do sistema quando nem a loja nem o cliente dizem nada. Os mesmos do
// fechamento mensal em relatorio-cliente.html — se divergissem, a margem da
// tela do cliente brigaria com o relatório que ele recebe no fim do mês.
export const PCT_OTDE_PADRAO = 2;
export const PCT_IMPOSTO_PADRAO = 0;

/** Aceita "8%", "7,5%" ou 8 e devolve número. Os campos do cadastro são texto. */
export function pct(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace("%", "").replace(",", ".").trim());
  return isFinite(n) ? n : null;
}

/**
 * Percentual efetivo de uma loja, com herança:
 *   1. o que está na própria loja (exceção)
 *   2. o que está no cliente proprietário (regra)
 *   3. o padrão do sistema
 *
 * `loja` e `dono` são os documentos de `clients` e `customers`. Quem chama é
 * que os busca — este arquivo não conhece Firestore.
 */
export function percentuaisDaLoja(loja, dono) {
  const daLoja = (campoLoja, campoDono, padrao) => {
    const proprio = pct(loja ? loja[campoLoja] : null);
    if (proprio !== null) return proprio;
    const herdado = pct(dono ? dono[campoDono] : null);
    return herdado !== null ? herdado : padrao;
  };
  return {
    pctOtde: daLoja("comissao", "fee", PCT_OTDE_PADRAO),
    pctImposto: daLoja("imposto", "imposto", PCT_IMPOSTO_PADRAO),
  };
}

/** A linha de taxas de um marketplace, achada sem depender de caixa ou acento. */
export function taxasDoMarketplace(mkt) {
  const chave = String(mkt || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  return TAXAS[chave] || null;
}

/**
 * Peso em quilos, a partir do texto que o cliente digitou na ficha.
 *
 * Aceita "180g", "1,2 kg", "0.9kg", "1200 g". Número sem unidade é lido como
 * QUILO, que é a unidade das duas tabelas — e não como uma adivinhação pelo
 * tamanho do número. Quem digitar "180" querendo gramas vai ver o aviso de
 * peso fora da tabela em vez de um frete errado, e corrige.
 *
 * Devolve null quando não dá para entender. Null aqui vira "não calculei e
 * digo por quê", nunca um frete chutado.
 */
export function pesoEmKg(texto) {
  if (typeof texto === "number") return isFinite(texto) && texto > 0 ? texto : null;
  const s = String(texto || "").trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*(kg|quilos?|g|gramas?)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  const unidade = m[2] || "kg";
  return (unidade === "g" || unidade.startsWith("grama")) ? n / 1000 : n;
}

/** A faixa de comissão de um preço, ou null se o preço não servir. */
export function faixaDeComissao(taxas, preco) {
  if (!taxas || !Array.isArray(taxas.comissao)) return null;
  if (typeof preco !== "number" || !isFinite(preco) || preco < 0) return null;
  return taxas.comissao.find((f) => f.abaixoDe === null || preco < f.abaixoDe) || null;
}

/**
 * O frete daquele peso, ou null quando o marketplace não tem tabela ou o peso
 * está fora dela. Fora da tabela NÃO vira o valor da última faixa: um produto
 * de 40 kg custa mais que um de 30 kg, e repetir o último número seria
 * inventar um frete barato demais.
 */
export function freteDoPeso(taxas, kg) {
  if (!taxas || !Array.isArray(taxas.frete)) return null;
  if (typeof kg !== "number" || !isFinite(kg) || kg <= 0) return null;
  const faixa = taxas.frete.find((f) => kg <= f.ateKg);
  return faixa ? faixa.valor : null;
}

const arredondar = (n) => Math.round(n * 100) / 100;

/**
 * A comissão que a TABELA prevê para os itens vendidos num dia.
 *
 * Existe para conferir a tabela contra a realidade. A sincronização já guarda,
 * em `sales`, o que a Shopee COBROU de verdade (`comissao` + `taxaServico`,
 * vindos da API financeira dela). Comparar os dois números responde, com dado
 * de produção, a única pergunta que nenhum teste responde: a tabela está certa?
 *
 * A conta é por ITEM porque é assim que a tabela funciona — a faixa sai do
 * valor de UM item, e a parte fixa é cobrada uma vez por unidade. Usar o
 * ticket médio do pedido colocaria um pedido de três peças de R$ 40 na faixa
 * de R$ 120, que é outra linha da tabela.
 *
 * `itens` é o que `sales` guarda: `{ q: quantidade, v: valor total daquele SKU }`.
 */
export function comissaoEstimadaDosItens(itens, taxas) {
  let total = 0, semFaixa = 0, unidades = 0;
  for (const it of (Array.isArray(itens) ? itens : [])) {
    const q = Number(it && it.q) || 0;
    const v = Number(it && it.v) || 0;
    if (q <= 0 || v <= 0) continue;
    const faixa = faixaDeComissao(taxas, v / q);
    if (!faixa) { semFaixa += q; continue; }
    total += v * faixa.percentual / 100 + q * faixa.fixo;
    unidades += q;
  }
  return { total: arredondar(total), unidades, semFaixa };
}

/**
 * O que a Shopee cobrou de verdade, em % do faturamento.
 * `comissao` + `taxaServico` é o que sai do vendedor; `gmv` é a base.
 */
export function taxaEfetivaReal({ gmv, comissao, taxaServico }) {
  const g = Number(gmv) || 0;
  if (g <= 0) return null;
  return arredondar(((Number(comissao) || 0) + (Number(taxaServico) || 0)) / g * 100);
}

/**
 * Junta os dois lados. Devolve o real, o estimado e a diferença em pontos.
 * `diferenca` positiva = a tabela cobra MAIS do que a Shopee cobrou.
 */
export function conferirTabelaShopee(dias, taxas = TAXAS.shopee) {
  let gmv = 0, real = 0, estimado = 0, unidades = 0, semFaixa = 0, comItens = 0;
  for (const d of (Array.isArray(dias) ? dias : [])) {
    if (!d) continue;
    gmv += Number(d.gmv) || 0;
    real += (Number(d.comissao) || 0) + (Number(d.taxaServico) || 0);
    const e = comissaoEstimadaDosItens(d.itens, taxas);
    estimado += e.total;
    unidades += e.unidades;
    semFaixa += e.semFaixa;
    if (Array.isArray(d.itens) && d.itens.length) comItens += 1;
  }
  if (gmv <= 0 || !comItens) return null;
  const pctReal = arredondar(real / gmv * 100);
  const pctEstimado = arredondar(estimado / gmv * 100);
  return {
    gmv: arredondar(gmv), dias: comItens, unidades, semFaixa,
    real: arredondar(real), estimado: arredondar(estimado),
    pctReal, pctEstimado, diferenca: arredondar(pctEstimado - pctReal),
  };
}


/**
 * Lucro e margem de um anúncio. Devolve sempre a mesma forma:
 *
 *   { lucro, margem, descontos: [{ rotulo, valor }], falta: [], avisos: [] }
 *
 * `lucro` e `margem` vêm null quando falta alguma peça — e `falta` diz o quê,
 * em português, para a tela poder explicar em vez de mostrar um traço mudo.
 *
 * O subsídio Pix NÃO é descontado: ele só incide quando o comprador escolhe
 * Pix, e aplicar sempre inventaria um custo em toda venda. Ele sai em `avisos`
 * para a tela poder dizer quanto sairia a mais naquele caso.
 *
 * `pctOtde` e `pctImposto` vêm do CADASTRO, não de tabela: a comissão da OTDE
 * e o imposto do lojista, já resolvida a herança loja → cliente. Sem os dois,
 * sai a conta do MARKETPLACE — que é o que o especialista precisa para
 * precificar e é tudo que ele pode ver. Com os dois, sai a margem final do
 * dono do produto, e só aí o resultado se declara `completa`.
 *
 * Os dois incidem sobre o preço de venda, a mesma base do fechamento mensal
 * em relatorio-cliente.html. Mudar a base aqui faria a tela do cliente brigar
 * com o relatório que ele recebe todo mês.
 */
export function calcularMargem({ preco, custo, peso, mkt, pctOtde = null, pctImposto = null }) {
  const taxas = taxasDoMarketplace(mkt);
  const falta = [];
  const descontos = [];
  const avisos = [];

  if (!taxas) falta.push(`não tenho as taxas ${mkt ? `de ${mkt}` : "deste marketplace"}`);
  const p = typeof preco === "number" && isFinite(preco) && preco > 0 ? preco : null;
  if (p === null) falta.push("o preço do anúncio");
  const c = typeof custo === "number" && isFinite(custo) && custo >= 0 ? custo : null;
  if (c === null) falta.push("o custo do produto");

  const faixa = taxas && p !== null ? faixaDeComissao(taxas, p) : null;
  if (taxas && p !== null && !faixa) falta.push("uma faixa de comissão para este preço");

  // Frete só é exigido de quem tem tabela de frete. Marketplace sem tabela
  // não trava o cálculo — ele só não desconta frete, e diz isso.
  let frete = 0;
  // Frete cobrado como PERCENTUAL do preço, com teto por produto — é a forma
  // do TikTok. Não depende do peso, então não trava o cálculo pedindo peso.
  if (taxas && taxas.fretePercentual && p !== null) {
    const fp = taxas.fretePercentual;
    frete = arredondar(Math.min(p * fp.percentual / 100, fp.tetoPorProduto));
  }
  if (taxas && Array.isArray(taxas.frete)) {
    const kg = pesoEmKg(peso);
    if (kg === null) {
      falta.push("o peso do produto (ex.: 180g ou 1,2kg)");
    } else {
      const f = freteDoPeso(taxas, kg);
      if (f === null) falta.push(`uma faixa de frete para ${kg} kg`);
      else frete = f;
    }
  }

  // Conta que não fecha nunca se declara completa: `completa` é uma promessa
  // sobre o número, e aqui não há número nenhum.
  const completa = Boolean(taxas && taxas.completa);
  if (falta.length) return { lucro: null, margem: null, descontos, falta, avisos, completa: false };

  const comissao = arredondar(p * faixa.percentual / 100 + faixa.fixo);
  descontos.push({ rotulo: `Comissão ${taxas.nome} (${faixa.percentual}% + R$ ${faixa.fixo})`, valor: comissao });
  if (Array.isArray(taxas.frete)) descontos.push({ rotulo: "Intermediação de frete", valor: frete });
  if (taxas.fretePercentual) {
    descontos.push({
      rotulo: `Programa de taxas de envio (${taxas.fretePercentual.percentual}%)`,
      valor: frete,
    });
  }

  // Comissão da OTDE e imposto, do cadastro do cliente. Ausentes, a conta é a
  // do marketplace e se declara incompleta — nunca se chuta um percentual que
  // mexe em margem.
  const otde = typeof pctOtde === "number" && isFinite(pctOtde) && pctOtde >= 0 ? pctOtde : null;
  const imp = typeof pctImposto === "number" && isFinite(pctImposto) && pctImposto >= 0 ? pctImposto : null;

  const vOtde = otde === null ? 0 : arredondar(p * otde / 100);
  if (otde !== null && otde > 0) descontos.push({ rotulo: `Gestão OTDE (${String(otde).replace(".", ",")}%)`, valor: vOtde });

  const vImposto = imp === null ? 0 : arredondar(p * imp / 100);
  if (imp !== null && imp > 0) descontos.push({ rotulo: `Imposto (${String(imp).replace(".", ",")}%)`, valor: vImposto });

  const completaAgora = completa && otde !== null && imp !== null;
  if (!completaAgora) {
    avisos.push(otde === null && imp === null
      ? "Esta conta ainda não desconta a gestão da OTDE nem o imposto."
      : otde === null ? "Esta conta ainda não desconta a gestão da OTDE."
      : "Esta conta ainda não desconta o imposto.");
  }

  if (faixa.subsidioPix) {
    avisos.push(`Se o comprador pagar com Pix, saem mais ${faixa.subsidioPix}% (R$ ${arredondar(p * faixa.subsidioPix / 100).toFixed(2).replace(".", ",")}).`);
  }

  const lucro = arredondar(p - c - comissao - frete - vOtde - vImposto);
  return {
    lucro,
    margem: arredondar(lucro / p * 100),
    descontos: [{ rotulo: "Custo do produto", valor: c }, ...descontos],
    falta: [],
    avisos,
    // false = a conta está incompleta e sai otimista. Quem desenha decide o
    // que fazer com isso; este módulo não esconde nada de quem pergunta.
    completa: completaAgora,
  };
}
