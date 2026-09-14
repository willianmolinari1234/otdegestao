# OTDE Performance

Agência que administra ~41 lojas em marketplaces para ~48 proprietários.
O sistema vigia as lojas (API oficial da Shopee), fecha o mês com o cliente e dá
tela própria ao cliente e ao especialista.

Base deste documento: 13/09/2026, 11.416 linhas, 369 testes + 37 testes de regras.
Fases 0 a 7 entregues; a fase 8 (cadastro pelo cliente e margem) está pronta e aguardando
publicação.

**Este arquivo é só contexto permanente.** O plano do que está sendo feito agora vive em
`docs/`, num arquivo por fase. Não duplique contexto lá nem plano aqui.

## Documentos do projeto

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` (este) | Contexto permanente: mapa, modelo de dados, decisões travadas, armadilhas |
| `docs/FASE-9.md` | A fase em andamento: Mercado Livre e TikTok |
| `docs/FASE-8.md` | Entregue: cadastro pelo cliente e margem sem planilha |
| `FASE-7.md` (raiz) | O que já foi entregue de conta compartilhada, e o que falta para ML/TikTok |
| `TAREFAS-AUTOMATICAS.md` (raiz) | Como o alerta vira tarefa com dono, e o que continua aberto |
| `docs/arquivo/` | Histórico. Só consulta, não se mexe |

## Quem é o Willian

Dono do sistema, **não é técnico.** Não lê código e não revisa diff. Decisão técnica é da
sessão, não dele: arquitetura, biblioteca, formato de teste, estrutura de script.

- Não faça pergunta técnica. Se precisar escolher entre duas opções, escolha a mais
  conservadora e conte depois, em uma frase.
- Teste quebrou: conserte ou reverta. Não traga erro para ele resolver.
- Fale em linguagem de negócio. Nunca "o listener do `#content` não estava com o
  `rebind()`" — escreva "o botão não clicava; consertei".
- No fim de cada item, diga o que mudou, **qual tela ele deve abrir** e o que deve ver lá.
  Ele confere tela, não confere código.

## Regra de ouro

O erro caro aqui não é uma tela feia, é um cliente enxergando o custo do outro.
Na dúvida entre conveniência e isolamento, o isolamento ganha.

## Stack

Sem framework e sem build. JavaScript puro servido pelo Firebase Hosting.
`app.html` carrega os scripts numerados na ordem, mais três módulos ESM expostos em `window`.
Backend: Cloud Functions v2, região `us-central1`.

**Não reorganize os arquivos.** A numeração é a ordem de carregamento e o Hosting serve os
caminhos como estão. Mover, renomear ou agrupar em subpastas quebra o carregamento e a
publicação — e sem build não existe compilador para avisar.

**O menu lateral tem QUATRO entradas**: Dashboard, Tarefas, Clientes, Equipe. Tudo o mais
é sub-aba (`subAba` em `js/01-estado-e-dados.js`): Clientes agrupa lojas, integrações,
produtos, relatório, vendas, ferramentas e diagnóstico; Equipe agrupa pessoas e
produtividade. Eram onze entradas e ninguém lia até o fim. Tela nova entra como aba do
assunto a que pertence, não como item de menu.

| Arquivo | Linhas | O que faz |
|---|---|---|
| `functions/index.js` | 2.063 | Todo o backend: sincronização Shopee, acessos, claims, endpoints |
| `relatorio-cliente.html` | 1.663 | Fechamento mensal. Apesar do nome, é tela de funcionário |
| `js/04-telas.js` | 1.690 | Dashboard, tarefas (com modo TV), lojas, clientes, produtos |
| `cliente.html` | 1.191 | Três modos: cliente, especialista, equipe vendo como cliente |
| `js/08-produtos.js` | 850 | Admin: importação da planilha, SKU, acessos, conferir margens |
| `app.html` | 638 | Casca do app, CSS, carregamento dos scripts |
| `js/06-formularios.js` | 621 | Formulários e modais |
| `js/custos.js` | 430 | **Peso morto.** Ver abaixo |
| `js/05-clientes-e-acesso.js` | 409 | Cadastro de proprietários, marketplaces, credenciais |
| `js/planilha-produtos.js` | 305 | Leitor da planilha do cliente, aba por aba |
| `js/07-interacoes-e-boot.js` | 298 | Boot, roteamento, delegação de eventos |
| `js/prazos.js` | 280 | Regras de alerta, Prêmio de Seguidor, perfil de cupons. **Espelhado** |
| `js/taxas.js` | 262 | O que cada marketplace desconta, e a margem. **Espelhado** |
| `functions/tarefas-automaticas.js` | 241 | Decide quais alertas viram tarefa. Função pura |
| `js/01-estado-e-dados.js` | 239 | Estado global e listeners do Firestore |
| `js/02-utilitarios.js` | 211 | Formatação, `mktsDoCliente()`, crachá do proprietário |
| `firestore.rules` | 166 | Isolamento entre clientes |
| `js/03-acesso.js` | 139 | Login e checagem de funcionário |
| `functions/produto-do-cliente.js` | 110 | Monta a ficha que o cliente gravou. Função pura |
| `functions/vinculos-anuncios.js` | 95 | Identidade de anúncio em conta compartilhada |
| `functions/backfill-denormalizados.js` | 79 | Decide o que preencher no backfill. Função pura |
| `js/ficha-produto.js` | 70 | Campos da ficha e obrigatórios. **Espelhado** |
| `js/drive.js` | 50 | Link do Drive vira miniatura |

`js/custos.js` não tem nenhum consumidor. O `app.html` importa e expõe em `window.custos`,
mas nenhuma linha lê. O leitor de planilha em produção é o `js/planilha-produtos.js`,
escrito depois e desenhado contra uma planilha real. Antes de mexer em importação,
é o `planilha-produtos.js` que importa.

## Modelo de dados

```
accounts/{uid}         papel "cliente" | "especialista" | "equipe"
                       custId (só cliente) · mkt (só especialista)

products/{cust__chave} custId · sku · nome · custo · preco · margem · lucro
                       custNome · mkts[] (denormalizados)
                       peso · medidasProduto · medidas (embalagem) · obs
                       fotos · video (link do Drive, ou lista deles)
                       tamanhos · cores · material
                       origem "planilha" | "cliente"
                       criadoEm · criadoPor{uid, emNomeDe} · atualizadoPor

listings/{loja__anuncio}  custId · sku · mkt · storeId · itemId · preco · status
                          margem · lucro (da PLANILHA — nunca recalculados)
                          custNome · storeNome · storeMkt · mkts[] (denormalizados)

pedidos/{custId__produtoId__mkt}   "Quero anunciar". status "aberto" | "atendido"
pedidos/{custId__geral__mkt}       o genérico, sem produto

vinculos_anuncios/{sha256(...)}    de qual cliente é cada anúncio numa conta
                                   compartilhada. Coleção privada: só Admin SDK

customers/{id}   fee (nossa comissão %) · imposto % — a origem da margem
clients/{id}     comissao % · imposto % (exceção da loja) · respId · perfilCupons
                 relampagoNaoSeAplica
                 antes{prints[{url,legenda,em}],em,por} — como a loja estava
                 quando a OTDE pegou. Link do Drive, nunca arquivo
                 access{url,user,pass,notes} — o login da loja no marketplace.
                 FONTE ÚNICA: as duas telas que editam isso (cadastro da loja e
                 cadastro do cliente) leem e gravam AQUI. Já houve uma cópia em
                 customers.login.stores, e como nenhuma das duas lia a outra,
                 preencher numa deixava a outra vazia.
```

**Campos repetidos são de propósito.** Regra do Firestore não faz join. Para o especialista
ver "os produtos dos marketplaces que ele opera", o marketplace precisa estar dentro do
documento do produto. Sem isso, cada leitura vira um `get()` dentro da regra — leitura
cobrada e latência em cima de cada item da lista.

**Ids determinísticos, nunca aleatórios.** Produto é `cust__chave`, anúncio é `loja__anuncio`,
especialista é `esp_<mkt>__<produtoId>`. Reimportar a mesma planilha atualiza, não duplica.
O lado perigoso: dado errado não gera duplicata que denuncie o erro — sobrescreve em silêncio.

## Quem enxerga o quê

O papel vive em `accounts/{uid}` e é espelhado nas custom claims. As regras leem a claim:

```
request.auth.token.get("papel", "")
request.auth.token.get("custId", "")
request.auth.token.get("mkt", "")
```

O `.get(campo, "")` não é estilo: token sem a claim nega em vez de dar erro,
e erro em regra some com a tela inteira.

| Papel | Lê | Não lê |
|---|---|---|
| cliente | seus `products` e `listings` | qualquer coisa de outro proprietário |
| especialista | `products`/`listings` cujo `mkts[]` contém o `mkt` dele | marketplace que não opera |
| equipe/admin | tudo, via `employees/{uid}` | — |

**Nenhum papel externo lê `clients` ou `customers`.** Não é esquecimento e não deve ser
relaxado para facilitar uma tela. `clients.access` guarda a senha do marketplace da loja,
e regra do Firestore não esconde campo: ou libera o documento inteiro, ou não libera.
O nome do proprietário chega às telas por `custNome` denormalizado. Está escrito em
comentário dentro do `firestore.rules` — mantenha o comentário.

## Decisões travadas — não reabrir

| Decisão | Consequência |
|---|---|
| Foto e vídeo no Google Drive | Sem Firebase Storage. Guarda link, não arquivo. O arquivo precisa estar como "qualquer pessoa com o link" |
| ML e TikTok pela API de cada marketplace | Vira a fase 7. Não bloqueia nada antes dela |
| Especialista vê só o que opera | Regra mais estreita; o custo não circula além de quem precisa precificar |
| Produtos vêm das planilhas | Integração de catálogo da Shopee sai do caminho crítico |
| Claim em vez de `get()` na regra | Cada `get()` é leitura cobrada e latência por item |
| Ids determinísticos | Reimportar atualiza em vez de duplicar |
| Margem e lucro vêm da planilha | **Nunca recalcular.** Preço menos custo dá 52% onde o real é 7,5%, porque a planilha já desconta comissão, frete e imposto |
| Taxa de marketplace em `js/taxas.js`, não no Firestore | Comissão de marketplace é pública; em arquivo, não mexe em regra e o git guarda quando cada taxa mudou |
| Comissão da OTDE e imposto vêm do CADASTRO | `customers.fee` e `customers.imposto`, com exceção por loja em `clients`. Não são tabela; chegam ao cálculo como parâmetro |
| A conta só se declara `completa` com os dois percentuais | Sem eles sai a conta do MARKETPLACE, que é tudo que o especialista pode ver. Quanto a OTDE cobra de cada cliente não circula por ele |
| Herança de percentual: loja → cliente → padrão (2% e 0%) | A mesma do fechamento mensal. Se divergissem, a tela brigaria com o relatório que o cliente recebe todo mês |
| Autoria dupla em toda gravação | `criadoPor` (quem digitou) e `emNomeDe` (por quem) |
| A ficha do produto é gravada pelo backend | O cliente não pode escrever `mkts`; gravar pelo navegador faria o produto nascer invisível para o especialista |
| Obrigatórios da ficha: SKU, peso, medidas do produto, medidas da embalagem, foto, observações | Mais o nome. Custo fica de fora: a ficha é para anunciar, não para precificar |
| Marca: **OTDE Performance**, ouro sobre preto | Desde 13/09/2026. Antes era OTDE Gestão de Contas, laranja sobre slate |
| Os neutros são QUENTES, não azulados | Ouro sobre cinza azulado fica esverdeado. Trocar só o acento deixaria o sistema com cara de sujo |
| A barra de progresso mostra o NÚMERO, não a pessoa | Pintada com a cor do funcionário, 94% e 96% saíam em cores diferentes. Agora é verde/âmbar/vermelho pela própria porcentagem |
| Crachá de quem foi cadastrado antes é traduzido, não migrado | `corDoFuncionario()` reparte a paleta nova sem repetir. Mexer no banco de 6 pessoas seria mais risco que valor |
| A área do cliente NUNCA lê `sales` | O faturamento da aba "Minha loja" é somado pelo servidor (`faturamentoDoCliente`) e volta só com as lojas daquele proprietário. A regra do Firestore continua fechada |
| Preço é conferência da EQUIPE, não do lojista | A aba do cliente mostra loja, anúncios e faturamento. Alerta de precificação ali pede uma decisão que não é dele |
| O logo não usa moldura | Sem círculo e sem quadrado: a marca é larga e cortá-la num redondo come as barras do E. Ícone da aba é a marca em fundo transparente |

As claims são aplicadas por `aplicarClaims()`, chamada por quem grava — **não por gatilho
do Firestore**. O gatilho existia e foi removido: dependia do Eventarc, quebrava o deploy
com erro de propagação de permissão e insistia em nascer em `southamerica-east1`.
Não recoloque achando que é mais elegante.

"Entrar como cliente" não usa token de personificação: muda a tela, não a sessão.
O funcionário abre `cliente.html?cliente=…` e só passa depois de checar `employees/{uid}`.

## Armadilhas — cada uma já custou tempo uma vez

**O automático passa por cima de quem digitou.** Aconteceu três vezes no
`relatorio-cliente.html`. A forma de correção, para o quarto caso:
campo vazio vira `null`, não `0`; uma bandeira explícita por campo (`varAtuManual`,
`varAntManual`) gravada junto; no desenho o manual vence e o automático só entra quando a
bandeira é falsa; registro antigo sem bandeira continua automático; o `fillForm` devolve
ao campo só o que foi digitado, nunca o calculado. Se aparecer um quarto campo,
varra a tela inteira de uma vez em vez de consertar um só.

**Botão em modal não clica.** A delegação de eventos está presa a um listener no `#content`,
e modal vive fora do `#content`. Botão novo dentro de modal precisa ser registrado no
`rebind()` daquele modal — senão o clique não acontece, sem erro no console.

**A classe de modal do projeto é `.form-panel`.** Não existe `form-modal-header`,
`form-modal-body` nem `modal-close`. Antes de escrever CSS novo, procure a classe que já existe.

**O `app.html` tem TRÊS blocos `<style>`**, e o do diagnóstico é `<style id="diag-css">`.
Quem varrer só o primeiro (uma ferramenta, uma amostra) monta uma tela sem metade do CSS
e vai caçar um bug que não existe.

**A casca do app é por ID, não por classe:** `#sidebar`, `#topbar`, `#content`. Não existe
`.topbar` nem `.corpo`. Regra escrita para a classe errada não dá erro — ela simplesmente
não pinta, e só aparece quando alguém abre a tela. Aconteceu no painel de parede.

**`width:100%` dentro de um container sem largura própria é zero.** O gráfico de
produtividade ficou meses em branco por isso: as barras estavam num flex com
`align-items:center`, que encolhe o filho ao conteúdo — e o conteúdo eram barras de 100%
de nada. Barra de gráfico leva largura explícita ou um trilho com `flex:1`.

**`const` lido acima da própria declaração derruba a função inteira.** Não é aviso, é erro
de execução, e `node --check` aprova. Derrubou o `render()` em produção: nenhuma tela
desenhava e nada clicava. Os testes de `render()` em `telas.test.js` existem por causa
disso — antes só se testavam as telas uma a uma, que é testar o desenho sem testar o
caminho que o sistema usa.

**Ouro com texto branco não se lê.** `--brand` (#B8872B) sobre branco dá contraste de
2,3:1 — reprova em acessibilidade e some numa tela de trabalho. A regra do sistema:
**ação principal é PRETA** (`var(--ink)`), **realce e seleção são BRONZE** (#8A6420, 5,2:1),
e o ouro entra em aba ativa, número de destaque, foco de campo, barra de gráfico e tudo
que vive sobre preto. `marca.test.js` quebra se alguém escrever ouro com texto branco.

**O logo da tela de entrada não existe.** O `showAuthScreen` lê o `src` do `<img>` da barra
lateral e reusa. Trocar aquele `<img>` por um `<svg>` em linha deixa a entrada sem marca,
e sem erro nenhum. O símbolo é um SVG em data URI, quadrado e centrado — o `.logo-img` é um
círculo com `object-fit:cover`.

**O macOS tem um Java falso.** `command -v java` retorna verdadeiro mesmo sem Java instalado.
A checagem certa é `java -version >/dev/null 2>&1`, mais `/usr/libexec/java_home` e os
caminhos keg-only do Homebrew. Sem Java o emulador do Firestore não sobe.

**Citar `js/algo.js` em comentário barra a publicação.** O `carimbar-versao.js` varre o
arquivo inteiro e trata qualquer ocorrência de `js/*.js` sem `?v=` como referência sem
carimbo — inclusive dentro de comentário. Em `app.html` e `cliente.html`, escreva o nome
do arquivo sem a pasta.

**Mensagem de commit quebra o shell.** Aspas e crases dentro de `git commit -m` viram
execução de comando. Use sempre `git commit -F arquivo`.

**Arquivos de trava do git.** Quando sobra `index.lock` ou `HEAD.lock`, mova para
`.git/_to_delete/` — imediatamente antes de cada comando git, não no começo da sessão.

**O `SYNC_TOKEN` nunca entra em URL de navegador.** Os diagnósticos rodam pelos `.command`,
que leem o token do ambiente.

**Id da loja não é o número da URL.** O `amostraCupons` devolveu `porLoja: []` por receber
o número de `shopee.com.br/shop/1386095840/` em vez do id do documento no Firestore.

**Prêmio de Seguidor:** `{ campo: "voucher_purpose", valor: 3 }`, descoberto em dados reais.
Tem guarda para não acusar loja que ainda não sincronizou.

## Testar e publicar

| Comando | O que faz |
|---|---|
| `node --test testes/*.test.js` | 495 testes em 21 arquivos. Rápido, sem emulador |
| `TESTAR-REGRAS.command` | 37 casos de isolamento no emulador. Precisa de Java, só roda no Mac |
| `PUBLICAR.command` | Testes → sintaxe → carimbo de versão → homolog → confirmação → produção |
| `CUPONS-DIAGNOSTICO.command` | Amostra de cupons de uma loja escolhida em lista |
| `REVERTER-se-quebrar.command` | Volta a publicação anterior |

**Três arquivos de `js/` são espelhados para `functions/`**: `prazos.js` (regras de alerta),
`ficha-produto.js` (campos da ficha e obrigatórios) e `taxas.js` (o que cada marketplace
desconta). O original é o de
`js/`; a cópia é gerada por `ferramentas/espelhar-*.js`, refeita no predeploy, e um teste
quebra se divergirem. Nunca edite a cópia.

**Mexeu em `firestore.rules`, o Willian roda `TESTAR-REGRAS.command` antes de `PUBLICAR`.**
Regra errada em produção ou derruba a tela de todo mundo, ou abre o custo de um cliente
para outro — e a segunda não dá aviso nenhum.

**Publicar é do Willian, nunca da sessão.** Nem sugira rodar.

## Pendências fora do plano da fase

- Redigitar e salvar o 7,21 em "Variação mês passado" da EVA HOME (gravado antes da bandeira
  `varAntManual` existir, então ainda é tratado como automático).
- Criar a conta do especialista de Mercado Livre em 📦 Produtos → 🤝 Especialistas.
- `margem` e `lucro` dos anúncios antigos: só reimportando as duas abas da Shopee, à mão.
  Com a fase 8 isso ficou menos urgente — onde não há margem gravada, o sistema estima.
- Os 198 `products` sem `custId`, sobra da tela de Planilhas de Margem que saiu do sistema.
  Aparecem como órfãos em todo relatório do backfill. Limpeza é conversa à parte.

## Respondido: conta compartilhada por especialista

Willian confirmou em 09/09/2026 que cada especialista usa UMA conta no marketplace com
anúncios de vários clientes, e que SKU pode se repetir entre clientes. O dono do anúncio
nunca sai do SKU — sai de um vínculo explícito (marketplace + conta + anúncio), que já está
construído. Ver `FASE-7.md`.
