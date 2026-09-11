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
 * `completa: false` diz que a tabela ainda NÃO tem tudo que a planilha
 * desconta — falta o imposto, e na Shopee também o frete. Com ela em false a
 * conta sai OTIMISTA: nos exemplos conferidos deu 52%, que é exatamente o
 * número errado que a decisão travada do projeto manda nunca mostrar. Por isso
 * a tela do cliente esconde a estimativa enquanto isto for false; quem
 * precifica (especialista e equipe) continua vendo, com o aviso do que falta.
 * Vire para true quando comissão, frete e imposto estiverem todos aqui.
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
    // A Shopee não entrou com tabela de frete por peso nesta rodada. Enquanto
    // for null, o cálculo não inventa frete nenhum e diz que não desconta.
    frete: null,
    imposto: 0,
    completa: false,
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
    imposto: 0,
    completa: false,
  },
};

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
 */
export function calcularMargem({ preco, custo, peso, mkt }) {
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

  const completa = Boolean(taxas && taxas.completa);
  if (falta.length) return { lucro: null, margem: null, descontos, falta, avisos, completa };

  const comissao = arredondar(p * faixa.percentual / 100 + faixa.fixo);
  descontos.push({ rotulo: `Comissão ${taxas.nome} (${faixa.percentual}% + R$ ${faixa.fixo})`, valor: comissao });
  if (Array.isArray(taxas.frete)) descontos.push({ rotulo: "Intermediação de frete", valor: frete });

  const imposto = arredondar(p * (taxas.imposto || 0) / 100);
  if (taxas.imposto) descontos.push({ rotulo: `Imposto (${taxas.imposto}%)`, valor: imposto });
  else avisos.push("Esta conta ainda não desconta imposto.");

  if (faixa.subsidioPix) {
    avisos.push(`Se o comprador pagar com Pix, saem mais ${faixa.subsidioPix}% (R$ ${arredondar(p * faixa.subsidioPix / 100).toFixed(2).replace(".", ",")}).`);
  }

  const lucro = arredondar(p - c - comissao - frete - imposto);
  return {
    lucro,
    margem: arredondar(lucro / p * 100),
    descontos: [{ rotulo: "Custo do produto", valor: c }, ...descontos],
    falta: [],
    avisos,
    // false = a conta está incompleta e sai otimista. Quem desenha decide o
    // que fazer com isso; este módulo não esconde nada de quem pergunta.
    completa,
  };
}
