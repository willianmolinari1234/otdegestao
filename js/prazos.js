// Quais ferramentas (promoções) da Shopee estão perto de vencer.
//
// Módulo ESM: o navegador carrega e os testes importam o mesmo arquivo.
// A regra de "está vencendo" define o que a equipe vê no painel — se ela
// errar, uma promoção acaba sem ninguém renovar e a loja perde venda no
// dia seguinte sem explicação.

/** Segundos → "2026-08-13" no fuso de São Paulo. */
export function diaLocal(segundos) {
  if (!segundos) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Number(segundos) * 1000));
}

/**
 * Promoções que terminam dentro da janela.
 *
 * Inclui apenas as que JÁ COMEÇARAM ou começam dentro da janela — promoção
 * agendada para daqui a um mês não é urgência de hoje.
 *
 * Exclui as que já venceram: nada a fazer, e poluir o aviso com passado faz
 * a equipe parar de ler o aviso.
 *
 * @param {Array} lojas  [{cliente, promocoes:[{tipo,nome,inicio,fim}]}]
 * @param {number} agoraSeg  momento de referência, em segundos
 * @param {number} dias  tamanho da janela
 */
export function vencendo(lojas, agoraSeg, dias = 2) {
  const agora = Number(agoraSeg || 0);
  const limite = agora + dias * 86400;
  const fora = [];

  for (const loja of lojas || []) {
    for (const p of (loja?.promocoes || [])) {
      const fim = Number(p?.fim || 0);
      if (!fim) continue;              // sem data de fim: não dá para avisar
      if (fim <= agora) continue;      // já venceu
      if (fim > limite) continue;      // ainda longe
      const inicio = Number(p?.inicio || 0);
      if (inicio > limite) continue;   // nem começou dentro da janela
      fora.push({
        cliente: loja.cliente || loja.id,
        tipo: p.tipo || "",
        nome: p.nome || p.tipo || "promoção",
        fim,
        // Horas inteiras restantes, para o texto do aviso.
        horas: Math.max(0, Math.floor((fim - agora) / 3600)),
        emAndamento: inicio > 0 && inicio <= agora,
      });
    }
  }
  // Mais urgente primeiro: é a ordem em que a equipe deve agir.
  return fora.sort((a, b) => a.fim - b.fim);
}

/** Texto curto do prazo, para caber na linha do aviso. */
export function comoFalta(horas) {
  if (horas < 1) return "vence em menos de 1 hora";
  if (horas < 24) return `vence em ${horas}h`;
  const d = Math.floor(horas / 24);
  return d === 1 ? "vence amanhã" : `vence em ${d} dias`;
}
