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
 * Tipos de promoção que a Shopee renova sozinha todos os dias.
 *
 * A oferta relâmpago é curta por natureza: ela expira e volta no dia
 * seguinte sem ninguém mexer. Avisar "vence em 2h" todo santo dia é ruído,
 * e aviso que a equipe aprende a ignorar deixa de proteger os outros.
 * O que importa nesse tipo não é o fim de uma — é a AUSÊNCIA de qualquer uma.
 */
export const RENOVA_DIARIAMENTE = new Set(["flash_sale"]);

/**
 * Promoções que terminam dentro da janela.
 *
 * Inclui apenas as que JÁ COMEÇARAM ou começam dentro da janela — promoção
 * agendada para daqui a um mês não é urgência de hoje.
 *
 * Exclui as que já venceram: nada a fazer, e poluir o aviso com passado faz
 * a equipe parar de ler o aviso.
 *
 * Exclui também os tipos de RENOVA_DIARIAMENTE — eles têm alerta próprio
 * (semFerramentaNemAgendada), baseado em ausência e não em prazo.
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
      // Renova sozinha: o fim dela não é notícia.
      if (RENOVA_DIARIAMENTE.has(String(p?.tipo || ""))) continue;
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

/**
 * Lojas sem nenhuma promoção de um tipo RODANDO NEM AGENDADA.
 *
 * Feita para a oferta relâmpago. Como ela se renova sozinha, a pergunta útil
 * não é "quando acaba a de hoje?" e sim "existe alguma pela frente?". Uma
 * relâmpago agendada para amanhã já resolve o problema: a loja está coberta e
 * cobrar a equipe de novo só ensina a ignorar o painel.
 *
 * Por isso conta como coberta qualquer promoção do tipo com fim > agora —
 * em andamento ou ainda por começar, tanto faz. É a mesma regra que o
 * relatorio-cliente.html já usa; o painel era o único fora do padrão.
 *
 * Promoção sem data de fim também conta como coberta: a API só devolve as
 * vigentes, então falta de data é falta de dado, não falta de promoção —
 * e inventar um alerta em cima disso é o mesmo ruído por outro caminho.
 */
export function semFerramentaNemAgendada(lojas, tipo, agoraSeg) {
  const agora = Number(agoraSeg || 0);
  const out = [];
  for (const loja of lojas || []) {
    if (!loja) continue;
    const proms = Array.isArray(loja.promocoes) ? loja.promocoes : [];
    const coberta = proms.some((p) => {
      if (String(p?.tipo || "") !== tipo) return false;
      const fim = Number(p?.fim || 0);
      if (!fim) return true;   // sem data de fim: falta de dado, não de promoção
      return fim > agora;      // rodando OU agendada
    });
    if (!coberta) out.push({ cliente: loja.cliente || loja.id, total: proms.length });
  }
  return out;
}

/**
 * O mínimo de ferramentas que toda loja deve manter no ar.
 *
 * Não é meta de performance: é o arroz com feijão que a operação combinou de
 * deixar sempre ativo em toda loja. Ficar abaixo disso não quebra nada nem
 * aparece em relatório — a loja só rende menos, em silêncio, até alguém
 * reparar. É a mesma falha silenciosa do desconto, contada por outro lado.
 *
 * Não há mínimo de DESCONTOS de propósito. Contar campanhas de desconto não
 * mede nada: uma loja pode ter todos os anúncios dentro de uma campanha só e
 * estar perfeita, e outra pode ter cinco. Exigir três acusava quase toda a
 * base — alerta que dispara em todo mundo não separa nada e ensina a rolar a
 * tela. O que importa no desconto é o zero, e disso cuida semFerramenta().
 */
export const MINIMO_FERRAMENTAS = { cupom: 4 };

/**
 * Como reconhecer o cupom de Prêmio de Seguidor.
 *
 * Pelo NOME não dá. "Cupom de prêmio do seguidor" é um tipo de cupom da
 * Shopee, mas o nome quem digita é a loja — e há uma chamando o dela de
 * "consultoria". Procurar "seguidor" no texto acusa de falta um cupom que
 * existe, e alerta errado ensina a equipe a ignorar o painel inteiro; era
 * assim que a oferta relâmpago afogava o aviso.
 *
 * O campo da API que marca esse tipo ainda não foi identificado — a
 * documentação pública não descreve. O backend tem amostraCupons() para
 * responder isso com os dados reais, e desde já guarda os campos crus de cada
 * cupom em `bruto`, para a regra passar a olhar o parâmetro certo sem precisar
 * de outro deploy do backend.
 *
 * Enquanto não sabemos, a checagem fica SUSPENSA: não acusar é melhor do que
 * acusar errado. Preencher aqui a devolve ao ar, e os testes já cobrem o
 * mecanismo:
 *
 *   export const PREMIO_SEGUIDOR = { campo: "voucher_type", valor: 3 };
 */
export const PREMIO_SEGUIDOR = null;

/** Um cupom é o Prêmio de Seguidor? Só responde sim com a regra configurada. */
export function ehPremioSeguidor(p, regra = PREMIO_SEGUIDOR) {
  if (!regra || !regra.campo) return false;
  const v = (p && p.bruto) ? p.bruto[regra.campo] : undefined;
  if (v === undefined) return false;
  return Array.isArray(regra.valor) ? regra.valor.includes(v) : v === regra.valor;
}

/**
 * Uma promoção conta como ativa se já começou e ainda não terminou.
 *
 * Sem data conta como ativa: a Shopee só devolve as vigentes, então falta de
 * data é falta de dado, não falta de promoção. É a mesma regra de semFerramenta.
 */
function estaAtiva(p, agora) {
  const fim = Number(p?.fim || 0);
  const inicio = Number(p?.inicio || 0);
  if (fim && fim <= agora) return false;
  if (inicio && inicio > agora) return false;
  return true;
}

/**
 * Lojas que estão abaixo do mínimo combinado.
 *
 * Devolve só quem falha, e já com o que falta escrito — a tela não precisa
 * refazer a conta para montar o texto, e a regra fica num lugar só.
 *
 * O Prêmio de Seguidor é um cupom como outro qualquer para a Shopee: ele conta
 * dentro dos 4 e ainda é exigido à parte. Uma loja com 4 cupons sem o Prêmio
 * está incompleta do mesmo jeito — quando a regra de reconhecê-lo estiver
 * configurada (ver PREMIO_SEGUIDOR).
 *
 * @param {Array} lojas [{cliente, promocoes:[{tipo,nome,inicio,fim}]}]
 * @param {number} agoraSeg momento de referência, em segundos
 * @param {{cupom:number,desconto:number}} minimos
 */
export function abaixoDoMinimo(lojas, agoraSeg, minimos = MINIMO_FERRAMENTAS, premio = PREMIO_SEGUIDOR) {
  const agora = Number(agoraSeg || 0);
  const out = [];
  for (const loja of lojas || []) {
    if (!loja) continue;
    const proms = Array.isArray(loja.promocoes) ? loja.promocoes : [];
    const ativas = proms.filter((p) => estaAtiva(p, agora));
    const doTipo = (tipo) => ativas.filter((p) => String(p?.tipo || "") === tipo);
    const cupons = doTipo("cupom");
    const temSeguidor = cupons.some((p) => ehPremioSeguidor(p, premio));

    const faltas = [];
    if (cupons.length < minimos.cupom) faltas.push({ chave: "cupom", texto: `${cupons.length}/${minimos.cupom} cupons` });
    // Sem regra configurada não se cobra o Prêmio: acusar toda loja de não ter
    // um cupom que talvez ela tenha é pior do que não checar.
    if (premio && !temSeguidor) faltas.push({ chave: "seguidor", texto: "sem Prêmio de Seguidor" });

    if (faltas.length) {
      out.push({
        cliente: loja.cliente || loja.id,
        cupons: cupons.length, descontos: doTipo("desconto").length, temSeguidor, faltas,
      });
    }
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
