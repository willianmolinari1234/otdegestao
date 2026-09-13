// Transforma alerta em tarefa com dono, prazo e prova de conclusão.
//
// O sistema já sabia detectar (prazos.js) e já sabia distribuir trabalho
// (o kanban). O que não existia era a ponte: toda pendência achada pela
// Shopee precisava passar pela cabeça do admin para virar tarefa de alguém.
// Este módulo é essa ponte.
//
// É uma função PURA de propósito — recebe listas prontas e devolve a lista de
// gravações a fazer. Sem Firestore e sem rede, do mesmo jeito que
// backfill-denormalizados.js. É o que permite testar "ninguém mexeu, então
// nada deve ser gravado" sem subir emulador.

/** Id determinístico da tarefa de uma regra numa loja.
 *
 * Mesmo padrão do resto do projeto (cust__chave, loja__anuncio): rodar de novo
 * ATUALIZA a mesma tarefa em vez de abrir uma segunda. Sem isso, um sync a
 * cada 6 horas encheria o kanban com quatro cópias por dia da mesma pendência,
 * que é a forma mais rápida de ensinar a equipe a ignorar o kanban.
 */
export function idDaTarefa(lojaId, regra) {
  return `auto__${lojaId}__${regra}`;
}

/**
 * As regras que viram tarefa.
 *
 * Nem todo alerta do painel entra aqui, e isso é decisão de negócio, não
 * esquecimento:
 *
 * · oferta relâmpago NÃO entra — parte das lojas está bloqueada da ferramenta
 *   por pontuação, e cobrar de alguém uma tarefa impossível é o jeito mais
 *   rápido de ensinar a ignorar o kanban inteiro.
 * · cupons entram, mas SÓ para a loja cujo perfil foi escolhido à mão. O
 *   mínimo deixou de ser 4 para todas (PERFIS_CUPOM em js/prazos.js), e cobrar
 *   4 de uma loja de ticket baixo que ninguém marcou seria repetir o erro da
 *   oferta relâmpago: tarefa impossível ensina a ignorar o kanban. Loja sem
 *   perfil escolhido continua só no painel do admin — e preencher o cadastro
 *   é o que liga a tarefa dela.
 */
export const REGRAS = {
  // A única falta que já está custando venda NESTE momento: anúncio sem
  // desconto perde posição na busca e some do "ofertas".
  semDesconto: {
    chave: "semDesconto",
    pri: "alta",
    titulo: (loja) => `Ativar desconto — ${loja}`,
    desc: () =>
      "A loja está sem NENHUM desconto ativo. Anúncio sem desconto perde posição na busca "
      + "e sai do 'ofertas': a loja continua no ar vendendo menos, sem nada quebrar.\n\n"
      + "Esta tarefa se fecha sozinha quando a Shopee mostrar um desconto ativo na loja.",
  },
  // Cupom abaixo do mínimo combinado com a loja. Prazo de dois dias: não é
  // urgência de hoje como o desconto zerado, mas também não espera a semana.
  cupons: {
    chave: "cupons",
    pri: "media",
    titulo: (loja) => `Repor cupons — ${loja}`,
    desc: (faltas, minimo) =>
      `Esta loja está com menos cupons ativos do que o combinado (mínimo ${minimo}).\n\n`
      + faltas.map((f) => `· ${f}`).join("\n")
      + "\n\nEsta tarefa se fecha sozinha quando a Shopee mostrar os cupons no ar.",
  },
  // Tem data e dono natural: alguém precisa renovar antes de vencer.
  vencendo: {
    chave: "vencendo",
    pri: "media",
    titulo: (loja, n) => `Renovar ${n === 1 ? "promoção" : `${n} promoções`} — ${loja}`,
    desc: (linhas) =>
      "Promoções desta loja terminando:\n\n" + linhas.map((l) => `· ${l}`).join("\n")
      + "\n\nEsta tarefa se fecha sozinha quando não houver mais nada vencendo na janela.",
  },
};

/** Segundos → "2026-09-11" no fuso de São Paulo. */
export function diaLocal(segundos) {
  if (!segundos) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Number(segundos) * 1000));
}

/**
 * Até quando vale o "concluído" que alguém marcou.
 *
 * Só dá para acusar retrabalho se a Shopee foi consultada DEPOIS que a pessoa
 * marcou. O ideal é o carimbo exato (`doneEm`), gravado pela tela desde esta
 * entrega. Tarefa antiga não tem esse campo: aí vale o FIM do dia da conclusão,
 * que é o limite conservador — nunca reabre no mesmo dia em que foi concluída,
 * e por isso nunca cobra alguém por atraso do sync de 6 em 6 horas.
 */
export function marcoDaConclusao(tarefa) {
  if (!tarefa) return null;
  if (tarefa.doneEm) {
    const t = Date.parse(tarefa.doneEm);
    if (!Number.isNaN(t)) return t;
  }
  if (tarefa.doneDate && /^\d{4}-\d{2}-\d{2}$/.test(tarefa.doneDate)) {
    // 23:59:59.999 daquele dia no fuso de São Paulo.
    const t = Date.parse(`${tarefa.doneDate}T23:59:59.999-03:00`);
    if (!Number.isNaN(t)) return t;
  }
  return null;
}

/** Texto curto do prazo de uma promoção, para a descrição da tarefa. */
function linhaPromocao(p) {
  const h = Number(p.horas || 0);
  const quando = h < 1 ? "vence em menos de 1 hora" : h < 24 ? `vence em ${h}h`
    : (Math.floor(h / 24) === 1 ? "vence amanhã" : `vence em ${Math.floor(h / 24)} dias`);
  return `${p.nome || p.tipo || "promoção"} — ${quando}`;
}

/**
 * Decide o que gravar. Não grava nada.
 *
 * @param {object} e
 * @param {Array}  e.pendencias  [{loja, regra, prazo, pri, titulo, desc}] — o que ESTÁ pendente agora
 * @param {Map|object} e.lojas   id → {id, name, respId, sincronizadoEm}  (sincronizadoEm em ms)
 * @param {Array}  e.tarefas     tarefas JÁ existentes (todas; as que não têm auto:true são ignoradas)
 * @param {string} e.hoje        "YYYY-MM-DD" no fuso de São Paulo
 * @returns {{criar:Array, atualizar:Array, fechar:Array, reabrir:Array}}
 */
export function planejar({ pendencias = [], lojas, tarefas = [], hoje }) {
  const acheLoja = (id) => (lojas instanceof Map ? lojas.get(id) : (lojas || {})[id]) || null;

  // Só as tarefas deste módulo. Tarefa digitada por gente nunca é tocada:
  // fechar automaticamente algo que uma pessoa escreveu seria o sistema
  // decidindo que o trabalho dela acabou.
  const minhas = new Map();
  for (const t of tarefas) {
    if (t && t.auto === true && t.id) minhas.set(t.id, t);
  }

  const criar = [], atualizar = [], fechar = [], reabrir = [];
  const vistos = new Set();

  for (const p of pendencias) {
    const id = idDaTarefa(p.loja, p.regra);
    vistos.add(id);
    const loja = acheLoja(p.loja);
    // Loja que saiu do cadastro não gera tarefa nova. A que já existe é
    // fechada no laço de baixo, junto com as demais que pararam de valer.
    if (!loja) { vistos.delete(id); continue; }

    const emp = loja.respId || "";
    const existente = minhas.get(id);

    if (!existente) {
      criar.push({
        id, auto: true, regra: p.regra, cli: p.loja,
        emp, title: p.titulo, desc: p.desc,
        status: "todo", pri: p.pri, date: p.prazo,
        qty: null, doneDate: null, doneEm: null, reaberturas: 0,
      });
      continue;
    }

    if (existente.status === "done") {
      // Marcou concluído e o problema continua. Só acusa se a Shopee foi
      // consultada DEPOIS da conclusão — senão estaríamos cobrando a pessoa
      // por um dado velho de até 6 horas, que é culpa do sync e não dela.
      const marco = marcoDaConclusao(existente);
      const sync = Number(loja.sincronizadoEm || 0);
      if (marco && sync && sync > marco) {
        reabrir.push({
          id,
          patch: {
            status: "todo", doneDate: null, doneEm: null,
            emp, title: p.titulo, desc: p.desc, pri: p.pri, date: p.prazo,
            reaberturas: Number(existente.reaberturas || 0) + 1,
            reabertaEm: new Date(sync).toISOString(),
          },
        });
      }
      continue;
    }

    // Aberta e continua valendo: atualiza só o que mudou. Comparar antes de
    // gravar evita escrita à toa a cada 6 horas em 41 lojas — e evita que a
    // tarefa "pisque" no kanban de quem está olhando.
    const patch = {};
    if ((existente.emp || "") !== emp) patch.emp = emp;
    if (existente.title !== p.titulo) patch.title = p.titulo;
    if (existente.desc !== p.desc) patch.desc = p.desc;
    if (existente.date !== p.prazo) patch.date = p.prazo;
    if (existente.pri !== p.pri) patch.pri = p.pri;
    if (Object.keys(patch).length) atualizar.push({ id, patch });
  }

  // Parou de valer: fecha sozinha. É esta parte que dá a prova de conclusão
  // sem depender de ninguém marcar nada — e que impede alguém de fechar uma
  // pendência que a Shopee ainda mostra.
  for (const [id, t] of minhas) {
    if (vistos.has(id)) continue;
    if (t.status === "done") continue;
    fechar.push({
      id,
      patch: {
        status: "done", doneDate: hoje, doneEm: new Date().toISOString(),
        fechadaAuto: true,
      },
    });
  }

  return { criar, atualizar, fechar, reabrir };
}

/**
 * Monta a lista de pendências a partir do que prazos.js já sabe responder.
 *
 * Recebe as funções de regra por parâmetro em vez de importar `js/prazos.js`:
 * aquele arquivo é servido ao navegador e o backend não deve depender da pasta
 * do front. Quem chama passa as duas funções — e o teste passa versões falsas.
 */
export function montarPendencias({
  lojasTools, nomeDaLoja, agoraSeg, hoje, semFerramenta, vencendo,
  abaixoDoMinimo = null, emDias = null,
}) {
  const pend = [];

  for (const x of semFerramenta(lojasTools, "desconto", agoraSeg)) {
    const nome = nomeDaLoja(x.cliente);
    pend.push({
      loja: x.cliente, regra: REGRAS.semDesconto.chave,
      titulo: REGRAS.semDesconto.titulo(nome),
      desc: REGRAS.semDesconto.desc(),
      pri: REGRAS.semDesconto.pri,
      // Hoje: é a única falta que já está custando venda agora.
      prazo: hoje,
    });
  }

  // Uma tarefa por loja, não uma por promoção. Três promoções vencendo na
  // mesma loja são uma ida só ao painel da Shopee; virar três cartões seria
  // inflar o kanban sem criar trabalho novo.
  const porLoja = new Map();
  for (const p of vencendo(lojasTools, agoraSeg, 2)) {
    if (!porLoja.has(p.cliente)) porLoja.set(p.cliente, []);
    porLoja.get(p.cliente).push(p);
  }
  for (const [lojaId, lista] of porLoja) {
    lista.sort((a, b) => a.fim - b.fim);
    const nome = nomeDaLoja(lojaId);
    const maisCedo = lista[0];
    pend.push({
      loja: lojaId, regra: REGRAS.vencendo.chave,
      titulo: REGRAS.vencendo.titulo(nome, lista.length),
      desc: REGRAS.vencendo.desc(lista.map(linhaPromocao)),
      // Prazo é o DIA DO VENCIMENTO, não "dois dias úteis": promoção que
      // termina amanhã com prazo para depois de amanhã já nasceria errada.
      prazo: diaLocal(maisCedo.fim) || hoje,
      // Menos de 24h para vencer é urgência de hoje.
      pri: Number(maisCedo.horas || 0) < 24 ? "alta" : REGRAS.vencendo.pri,
    });
  }

  // Cupons: só para a loja cujo perfil foi escolhido à mão no cadastro.
  //
  // `abaixoDoMinimo` chega opcional para quem já chamava este módulo sem ela
  // continuar funcionando sem cobrar ninguém de surpresa.
  if (abaixoDoMinimo) {
    const comPerfil = new Set(
      lojasTools.filter((l) => l && l.perfilEscolhido).map((l) => l.cliente));
    for (const x of abaixoDoMinimo(lojasTools, agoraSeg)) {
      if (!comPerfil.has(x.cliente)) continue;
      const faltas = (x.faltas || []).map((f) => f.texto).filter(Boolean);
      if (!faltas.length) continue;
      const loja = lojasTools.find((l) => l.cliente === x.cliente) || {};
      pend.push({
        loja: x.cliente, regra: REGRAS.cupons.chave,
        titulo: REGRAS.cupons.titulo(nomeDaLoja(x.cliente)),
        desc: REGRAS.cupons.desc(faltas, loja.minCupons || "combinado"),
        pri: REGRAS.cupons.pri,
        prazo: emDias ? emDias(2) : hoje,
      });
    }
  }

  return pend;
}
