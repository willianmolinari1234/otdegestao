# Alerta vira tarefa

Entrega de 11/09/2026. **Não publicada** — publicar é decisão do Willian.

## O problema que isto resolve

O sistema detectava bem e parava. `syncFerramentas` achava a loja sem desconto
a cada 6 horas, o painel mostrava, e o painel era **só do admin** — a equipe não
via pendência nenhuma. Nenhuma linha do sistema criava tarefa: toda tarefa nascia
do formulário, digitada à mão. E `clients` não tinha campo de responsável, então
o sistema nem saberia para quem mandar.

Resultado: o trajeto detecção → ação passava inteiro pela cabeça de uma pessoa,
41 lojas, recarregado a cada 6 horas. O que não vira tarefa com dono não tem
prazo nem prova de conclusão — e é por aí que o retrabalho volta.

## As três peças

### 1. Responsável por loja

`clients.respId` — o funcionário que responde pela loja no dia a dia.

Preenche-se **na linha da tabela** em Clientes / Contas, num `<select>` que salva
ao escolher. São 41 lojas: um modal por loja transformaria cinco minutos numa
tarde. O filtro `⚠ Sem responsável (n)` isola exatamente as que faltam.

Loja sem responsável **não deixa de gerar tarefa** — gera tarefa sem dono, que
aparece só no painel do admin, com a contagem escrita no aviso do dashboard. O
custo de não preencher o campo fica visível em número, em vez de virar silêncio.

### 2. Perfil de cupons

O mínimo de 4 cupons deixou de valer para todas. Loja de ticket baixo trabalha
com dois: o de 3% e o Prêmio de Seguidor.

`clients.perfilCupons` = `"padrao"` (4) ou `"ticketbaixo"` (2). Os números moram
em `PERFIS_CUPOM`, em `js/prazos.js` — se o combinado mudar, muda num lugar só e
vale para todas as lojas do perfil. `abaixoDoMinimo()` passou a ler `minCupons`
da própria loja, caindo no mínimo geral quando não vem.

Isto conserta um alerta que **acusava loja certa** — o mesmo erro do "3
descontos", que disparava em 35 de 40 lojas e ensinava a equipe a rolar a tela.

### 3. Alerta vira tarefa

`functions/tarefas-automaticas.js` decide; `functions/index.js` grava. A decisão
é função pura, sem Firestore e sem rede, como o `backfill-denormalizados.js`.

Roda logo depois de `syncFerramentas` (a cada 6 h), com o dado fresco. Também sob
demanda: `/gerarTarefasAgora?token=...`, e dentro do `/syncAgora`.

**Id determinístico**, como todo o resto: `tasks/auto__<loja>__<regra>`. Rodar de
novo atualiza a mesma tarefa. Sem isso, quatro syncs por dia encheriam o kanban
de cópias da mesma pendência, que é a forma mais rápida de ensinar a equipe a
ignorar o kanban.

| Situação | O que acontece |
|---|---|
| Pendência nova | Cria tarefa para o responsável da loja (ou sem dono) |
| Pendência continua | Atualiza só o que mudou; não grava à toa |
| Responsável trocou | Reatribui a tarefa aberta |
| Pendência saiu do ar | **Fecha sozinha.** É a prova de conclusão sem ninguém marcar nada |
| Concluída e o problema continua | **Reabre e conta** em `reaberturas` |
| Tarefa digitada por gente | Nunca é lida nem tocada |

### Quais alertas entram — e por quê os outros não

| Regra | Vira tarefa | Prazo | Motivo |
|---|---|---|---|
| Loja sem NENHUM desconto ativo | ✅ | hoje | É a única falta que já está custando venda agora |
| Promoção vencendo em até 2 dias | ✅ | dia do vencimento | Tem data e dono natural |
| Sem oferta relâmpago | ❌ | — | Parte das lojas está bloqueada da ferramenta por pontuação. Cobrar tarefa impossível ensina a ignorar o kanban |
| Cupons / Prêmio de Seguidor | ❌ ainda | — | A regra acabou de mudar (perfil). Só depois do cadastro preenchido |

As duas que ficaram de fora **continuam no painel do admin**. Sair do painel não
estava em discussão; o que mudou foi quem vira tarefa de alguém.

O prazo do "vencendo" é o **dia do vencimento**, não dois dias úteis: promoção que
termina amanhã com prazo para depois de amanhã já nasceria errada.

## A reabertura, que é o ponto

Só reabre se a Shopee foi consultada **depois** que a pessoa marcou concluído.
Sem essa guarda, o sistema cobraria alguém por um dado de até 6 horas atrás —
culpa do sync, não dela.

Para isso, `setDoneDate()` passou a gravar `doneEm` (carimbo com hora) além do
`doneDate` (dia). Tarefa concluída antes desta entrega não tem `doneEm`: aí vale
o **fim do dia** da conclusão, que é o limite conservador — nunca reabre no mesmo
dia em que foi concluída.

`reaberturas` aparece no cartão do kanban (`↻ reaberta 2×`) e somado por pessoa na
tela de Equipe (`↻ n retrabalho`). É a métrica que o sistema não tinha.

## Nada mudou em `firestore.rules`

`tasks`, `clients` e `tools` já eram liberadas para qualquer funcionário. Não há
coleção nova. **Não há portão de `TESTAR-REGRAS`** nesta entrega — o que não
dispensa rodá-lo se alguém mexer nas regras por outro motivo.

## A cópia de prazos.js

As regras de "sem desconto" e "vencendo" são as MESMAS no painel e no gerador.
Escrever duas vezes é ter duas versões para manter em sincronia — e quando
divergem, o painel mostra uma coisa e a tarefa cobra outra, sem erro nenhum.

Não dá para os dois lados lerem o mesmo arquivo: o Hosting não publica
`functions/**` e o deploy de functions só empacota `functions/`. Então:

- **original:** `js/prazos.js`
- **cópia gerada:** `functions/prazos.js` — nunca editar à mão
- **gerador:** `node ferramentas/espelhar-prazos.js`, também no `predeploy` do
  `firebase.json`
- **guarda:** `testes/espelho-prazos.test.js` quebra se as duas divergirem

## Testes

De 205 para 257 no `node --test testes/*.test.js`.

| Arquivo | Casos | O que cobre |
|---|---|---|
| `tarefas-automaticas.test.js` | 30 | Criar, não duplicar, fechar sozinha, reabrir com e sem carimbo, nunca tocar tarefa de gente, ciclo completo |
| `telas.test.js` | 11 | **Novo tipo de teste:** monta os `js/*.js` na ordem do `app.html` com um DOM mínimo e chama as funções de desenho |
| `prazos-perfil-cupom.test.js` | 8 | Mínimo por perfil, perfil inválido caindo no padrão |
| `espelho-prazos.test.js` | 3 | Cópia em dia |

`telas.test.js` existe porque é ali que este projeto se machuca: o botão que não
clicava, o automático passando por cima do que foi digitado, o alerta acusando
loja certa. Nada disso quebra teste de regra — quebra na tela, calado.

## Para conferir depois de publicar

1. **Clientes / Contas** — coluna Responsável com o select. Filtre por
   `⚠ Sem responsável` e preencha as 41.
2. Nas lojas de ticket baixo, marque o perfil. O painel deve parar de cobrar
   4 cupons delas.
3. **Dashboard** — aviso cinza no topo com as lojas sem dono, some quando
   acabarem.
4. Rode `/gerarTarefasAgora?token=...` e volte ao **Kanban**: as tarefas com selo
   `⚠ Automática` já atribuídas.
5. **Equipe** — `↻ n retrabalho` aparece só depois que alguém marcar concluído
   com a pendência ainda no ar.

## O que continua aberto

- Cupons ainda não viram tarefa. Ligar é acrescentar uma regra em
  `REGRAS` + o trecho correspondente em `montarPendencias`, depois que os perfis
  estiverem preenchidos.
- A oferta relâmpago segue alertando no painel lojas que estão **bloqueadas** da
  ferramenta. O alerta está errado para elas, não só inconveniente — pede um
  campo de "não se aplica" por loja.
- **A meta de anúncios/dia mede texto, não trabalho.** `isAdTask()` procura a
  palavra "anúncio" no título e `adQtyOf()` cai num `\b(\d+)\b` genérico:
  "Revisar 3 fotos do anúncio" conta como 3 anúncios. A porcentagem ao lado do
  nome de cada funcionário no dashboard mede como a pessoa digita. Conserto:
  tornar `qty` obrigatório na tarefa de anúncio e parar de adivinhar pelo título.
