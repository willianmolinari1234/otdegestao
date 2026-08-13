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

/**
 * Lojas SEM nenhuma promoção ativa de um tipo.
 *
 * O caso que importa: loja sem desconto ativo. Na Shopee, anúncio sem
 * desconto perde posição na busca e some do "ofertas" — a loja continua
 * vendendo menos sem nada quebrar, então ninguém percebe olhando o painel.
 * É a falha silenciosa da operação, equivalente à que perseguimos nos dados.
 *
 * Considera ativa a promoção que já começou e ainda não terminou. A Shopee
 * é consultada a cada 6 horas, então uma que acabou nesse meio-tempo ainda
 * viria na lista — checar o fim evita dizer que está tudo certo quando não está.
 *
 * Só avalia lojas que TÊM registro de ferramentas. Loja sem registro é loja
 * não sincronizada; acusá-la de estar sem desconto seria inventar problema.
 */
export function semFerramenta(lojas, tipo, agoraSeg) {
  const agora = Number(agoraSeg || 0);
  const out = [];
  for (const loja of lojas || []) {
    if (!loja) continue;
    const proms = Array.isArray(loja.promocoes) ? loja.promocoes : [];
    const temAtiva = proms.some((p) => {
      if (String(p?.tipo || "") !== tipo) return false;
      const fim = Number(p?.fim || 0);
      const inicio = Number(p?.inicio || 0);
      if (fim && fim <= agora) return false;      // já acabou
      if (inicio && inicio > agora) return false; // ainda não começou
      return true;
    });
    if (!temAtiva) out.push({ cliente: loja.cliente || loja.id, total: proms.length });
  }
  return out;
}

/** Texto curto do prazo, para caber na linha do aviso. */
export function comoFalta(horas) {
  if (horas < 1) return "vence em menos de 1 hora";
  if (horas < 24) return `vence em ${horas}h`;
  const d = Math.floor(horas / 24);
  return d === 1 ? "vence amanhã" : `vence em ${d} dias`;
}
