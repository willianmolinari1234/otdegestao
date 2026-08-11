// Conferência das vendas: regras puras de comparação.
//
// Por que este arquivo existe separado do index.js: aqui não há Firestore nem
// chamada à Shopee, só decisão. Isso permite testar as regras de verdade, sem
// subir nada. O index.js busca os dados e chama estas funções.
//
// O que estamos protegendo: a OTDE cobra % sobre o faturamento bruto. Um
// número errado no sistema vira fatura errada. Estas regras existem para que
// um erro apareça sozinho, em vez de esperar alguém reparar.

/** Diferença de até 1 centavo é arredondamento, não erro. */
export const TOLERANCIA_REAIS = 0.01;

/** Queda no total do mês só vira alerta se for relevante nos dois critérios. */
export const QUEDA_MINIMA_REAIS = 50;
export const QUEDA_MINIMA_FRACAO = 0.01; // 1%

const num = (v) => Number(v || 0);

/**
 * Compara um dia: o que a API da Shopee devolve agora × o que está salvo.
 *
 * @param {{gmv:number, pedidos:number}} api    recalculado na hora
 * @param {{gmv:number, pedidos:number}|null} salvo  o que está no Firestore
 * @returns {{confere:boolean, tipo:string|null, diferenca:number}}
 */
export function compararDia(api, salvo) {
  const gmvApi = num(api?.gmv);
  const pedidosApi = num(api?.pedidos);

  // Sem documento salvo. Só é problema se a Shopee diz que houve venda:
  // dia sem venda não vira documento, de propósito.
  if (!salvo) {
    return pedidosApi === 0
      ? { confere: true, tipo: null, diferenca: 0 }
      : { confere: false, tipo: "faltando", diferenca: gmvApi };
  }

  const diferenca = num(salvo.gmv) - gmvApi;

  if (Math.abs(diferenca) > TOLERANCIA_REAIS) {
    return { confere: false, tipo: "valor", diferenca };
  }
  // Valor bate mas a contagem não: pedido cancelado ou dobrado.
  if (num(salvo.pedidos) !== pedidosApi) {
    return { confere: false, tipo: "pedidos", diferenca: 0 };
  }
  return { confere: true, tipo: null, diferenca: 0 };
}

/**
 * Detecta lojas cujo total do mês ENCOLHEU de um dia para o outro.
 *
 * Venda que já aconteceu não desaparece. Se o total do mês cai, ou alguém
 * sobrescreveu o valor, ou a sincronização apagou dias por engano — foi
 * exatamente o que aconteceu com a Vic.Ti Tricot (R$ 64.484 → R$ 12.824)
 * e só foi percebido por acaso.
 *
 * Cancelamentos fazem o total oscilar para baixo alguns reais; por isso a
 * queda precisa ser relevante em valor E em proporção para virar alerta.
 *
 * @param {Record<string, number>} hoje   total do mês por loja, agora
 * @param {Record<string, number>} ontem  total do mês por loja, medição anterior
 */
export function detectarQuedas(hoje, ontem, opcoes = {}) {
  const minReais = opcoes.minReais ?? QUEDA_MINIMA_REAIS;
  const minFracao = opcoes.minFracao ?? QUEDA_MINIMA_FRACAO;
  const quedas = [];

  for (const [loja, anterior] of Object.entries(ontem || {})) {
    const antes = num(anterior);
    if (antes <= 0) continue; // sem base de comparação

    // Loja ausente hoje conta como zero: sumir é a pior queda possível.
    const agora = num(hoje?.[loja]);
    const caiu = antes - agora;
    if (caiu < minReais) continue;
    if (caiu / antes < minFracao) continue;

    quedas.push({
      loja,
      antes: Number(antes.toFixed(2)),
      agora: Number(agora.toFixed(2)),
      caiu: Number(caiu.toFixed(2)),
      fracao: Number((caiu / antes).toFixed(4)),
    });
  }
  return quedas.sort((a, b) => b.caiu - a.caiu);
}

/** Junta tudo num resumo do dia, pronto para gravar e para exibir. */
export function montarResumo({ dia, comparacoes = [], quedas = [] }) {
  const divergencias = comparacoes.filter((c) => !c.confere);
  return {
    data: dia,
    lojasConferidas: new Set(comparacoes.map((c) => c.cliente)).size,
    diasConferidos: comparacoes.length,
    divergencias: divergencias.length,
    quedas: quedas.length,
    // O painel usa isto para decidir se mostra alerta.
    tudoCerto: divergencias.length === 0 && quedas.length === 0,
    detalheDivergencias: divergencias.slice(0, 50),
    detalheQuedas: quedas.slice(0, 50),
  };
}
