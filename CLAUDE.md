# OTDE Gestão

Agência que administra ~41 lojas em marketplaces para ~48 proprietários.
O sistema vigia as lojas (API oficial da Shopee), fecha o mês com o cliente e dá
tela própria ao cliente e ao especialista.

Base deste documento: commit `66ae1d6`, 9.753 linhas, 172 testes + 18 testes de regras.
Fases 0 a 5 entregues.

**Este arquivo é só contexto permanente.** O plano do que está sendo feito agora vive em
`docs/`, num arquivo por fase. Não duplique contexto lá nem plano aqui.

## Documentos do projeto

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` (este) | Contexto permanente: mapa, modelo de dados, decisões travadas, armadilhas |
| `docs/FASE-6.md` | A fase em andamento: como trabalhar, portões, itens |
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

| Arquivo | Linhas | O que faz |
|---|---|---|
| `functions/index.js` | 1.698 | Todo o backend: sincronização Shopee, criação/remoção de acessos, claims |
| `relatorio-cliente.html` | 1.663 | Fechamento mensal. Apesar do nome, é tela de funcionário |
| `js/04-telas.js` | 1.376 | Dashboard, lojas, clientes, produtos |
| `cliente.html` | 842 | Três modos: cliente, especialista, equipe vendo como cliente |
| `app.html` | 634 | Casca do app, CSS, carregamento dos scripts |
| `js/08-produtos.js` | 630 | Admin: importação da planilha, SKU, criação de acessos |
| `js/06-formularios.js` | 578 | Formulários e modais |
| `js/custos.js` | 430 | **Peso morto.** Ver abaixo |
| `js/05-clientes-e-acesso.js` | 409 | Cadastro de proprietários, marketplaces, credenciais |
| `js/planilha-produtos.js` | 305 | Leitor da planilha do cliente, aba por aba |
| `js/prazos.js` | 256 | Regras de alerta, inclusive Prêmio de Seguidor |
| `js/07-interacoes-e-boot.js` | 255 | Boot, roteamento, delegação de eventos |
| `js/01-estado-e-dados.js` | 227 | Estado global e listeners do Firestore |
| `js/02-utilitarios.js` | 171 | Formatação, `mktsDoCliente()`, crachá do proprietário |
| `firestore.rules` | 140 | Isolamento entre clientes |
| `js/03-acesso.js` | 139 | Login e checagem de funcionário |

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
                       peso · medidas{c,l,a} · fotos[] · video (links do Drive)
                       criadoEm · criadoPor{uid, emNomeDe}

listings/{loja__anuncio}  custId · sku · mkt · storeId · itemId · preco · status
                          custNome · storeNome · storeMkt · mkts[] (denormalizados)
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
| Autoria dupla em toda gravação | `criadoPor` (quem digitou) e `emNomeDe` (por quem) |

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

**O macOS tem um Java falso.** `command -v java` retorna verdadeiro mesmo sem Java instalado.
A checagem certa é `java -version >/dev/null 2>&1`, mais `/usr/libexec/java_home` e os
caminhos keg-only do Homebrew. Sem Java o emulador do Firestore não sobe.

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
| `node --test testes/*.test.js` | 172 testes em 7 arquivos. Rápido, sem emulador |
| `TESTAR-REGRAS.command` | 18 casos de isolamento no emulador. Precisa de Java, só roda no Mac |
| `PUBLICAR.command` | Testes → sintaxe → carimbo de versão → homolog → confirmação → produção |
| `CUPONS-DIAGNOSTICO.command` | Amostra de cupons de uma loja escolhida em lista |
| `REVERTER-se-quebrar.command` | Volta a publicação anterior |

**Mexeu em `firestore.rules`, o Willian roda `TESTAR-REGRAS.command` antes de `PUBLICAR`.**
Regra errada em produção ou derruba a tela de todo mundo, ou abre o custo de um cliente
para outro — e a segunda não dá aviso nenhum.

**Publicar é do Willian, nunca da sessão.** Nem sugira rodar.

## Pendências fora do plano da fase

- Redigitar e salvar o 7,21 em "Variação mês passado" da EVA HOME (gravado antes da bandeira
  `varAntManual` existir, então ainda é tratado como automático).
- Criar a conta do especialista de Mercado Livre em 📦 Produtos → 🤝 Especialistas.
- `margem` e `lucro` dos anúncios antigos: só reimportando as duas abas da Shopee, à mão.

## Pergunta em aberto que muda a fase 7

Cada especialista tem uma conta única no marketplace, com todos os clientes dentro?
Se for conta única, o dono do anúncio não sai da conta — sai do SKU, e a integração
precisa ser construída em cima do SKU desde o primeiro dia. Responder antes de começar a fase 7.
