# Estado atual — onde a fase 6 parou

Handoff para quem assumir o projeto. Base: commit `a737089`, 9 de setembro de 2026.

**Leia antes destas duas coisas, nesta ordem:** o `CLAUDE.md` da raiz (mapa dos
arquivos, decisões travadas, armadilhas) e o `FASE-6.md` (o plano dos quatro itens).
Este arquivo só diz **o que já foi feito, o que falta e o que mudou** — não repete
nenhum dos dois.

---

## 1. Como o Willian trabalha — leia isto primeiro

Ele é o dono do sistema e **não é técnico.** Não lê código e não revisa diff.

- **Decida sozinho tudo que for técnico.** Arquitetura, nome de variável, formato de
  teste, estrutura de script. Não pergunte qual biblioteca usar nem se o teste deve
  ser unitário — ele não tem como responder e você trava a sessão à toa.
- **Não ofereça duas opções técnicas.** Escolha a mais conservadora e conte depois,
  em uma frase.
- **Teste quebrou: conserte ou desfaça.** Não leve erro para ele resolver. Se não
  conseguir, reverta, siga para o próximo item e diga no fim o que ficou de fora.
- **Fale em linguagem de negócio.** Nunca "o listener do `#content` não estava no
  `rebind()`". Escreva "o botão não clicava; consertei".
- **No fim de cada item diga três coisas:** o que mudou, qual tela abrir para
  conferir, e o que ele deveria ver lá.
- **Commit por item**, sempre `git commit -F arquivo` — aspas e crases dentro de
  `-m` viram execução de comando neste projeto.

**Só fale com ele em duas situações:** pergunta de negócio que só ele responde (de
qual loja é aquela aba, que texto vai para o proprietário), e os portões abaixo.

**Não publique.** `PUBLICAR.command` é dele. Nem sugira rodar por conta própria.

---

## 2. Os quatro itens

| Item | Estado | Commit |
|---|---|---|
| 1 — texto do "Quero anunciar" | ✅ feito, depois substituído pelo item 4 | `b57160a` |
| 2 — backfill dos campos denormalizados | ✅ **feito e já gravado em produção** | `0358cb6` |
| 3 — aviso de link do Drive | ✅ feito, **falta publicar** | `76a6453` |
| 4 — registrar o pedido do "Quero anunciar" | ✅ feito, **falta publicar** | `2df739f` |

Testes: **201** no `node --test testes/*.test.js` (eram 172), todos passando.
Testes de isolamento das regras: **28 casos** (eram 18), só rodam no emulador.

---

## 3. O único bloqueio: portão 2

O item 4 mexeu em `firestore.rules` (coleção `pedidos` nova). O plano manda **parar
aqui**. O que falta é do Willian, nesta ordem:

1. Dois cliques em **`TESTAR-REGRAS.command`** — os 28 casos de isolamento. Precisa
   de Java e só roda no Mac dele. Você não consegue rodar.
2. Se passar, dois cliques em **`PUBLICAR.command`**.

**Enquanto as regras não forem publicadas, o item 4 não funciona de verdade** — a
coleção `pedidos` está em regra default-deny. O painel na tela 📦 Produtos aparece
vazio e o pop-up do cliente cai no estado de erro. Isso é esperado, não é bug.

Regra errada em produção ou derruba a tela de todo mundo, ou abre o custo de um
cliente para outro — e a segunda não dá aviso nenhum.

---

## 4. O que foi construído

### Item 2 — backfill (já rodou, não precisa mexer)

| Arquivo | O que é |
|---|---|
| `functions/backfill-denormalizados.js` | Função pura que decide o que preencher. Sem Firestore, sem rede |
| `functions/index.js` → `backfillDenormalizados` | Endpoint protegido por `SYNC_TOKEN`. Dry-run padrão, grava só com `gravar=1` |
| `BACKFILL-DENORMALIZADOS.command` | Entrada de dois cliques. `--gravar` pede confirmação |
| `testes/backfill-denormalizados.test.js` | 19 casos |

Rodou com `--gravar` em 09/09/2026. Preencheu 19 produtos (`custNome`) e 45 anúncios
(`custNome`, `mkts`, `storeNome`, `storeMkt`), todos da proprietária Poliane.
A conferência seguinte deu **0 de 217 e 0 de 45** — é idempotente. Rodar de novo é
inofensivo e inútil.

### Item 3 — link do Drive

A hipótese que o `FASE-6.md` mandava conferir **se confirmou pelo avesso**: não
existia `<img>` nenhuma recebendo link do Drive. A foto só aparecia como link, e o
campo guarda link de **pasta**. Então o item virou: construir a exibição de
miniaturas e, quando uma não carregar, trocar por aviso.

| Arquivo | O que é |
|---|---|
| `js/drive.js` | Extrai o id do arquivo dos formatos que aparecem colados e monta `/thumbnail?id=`. Pasta devolve `null` de propósito |
| `testes/drive.test.js` | 10 casos |
| `cliente.html` | Grade de miniaturas na tela do produto; `onerror` troca por aviso que **não afirma a causa** |

Com o dado de hoje (link de pasta) a tela não muda em nada — a miniatura só aparece
quando houver link de arquivo.

### Item 4 — pedidos

O "Quero anunciar" é chamado de **dois lugares**: da página de um produto (produto +
marketplace) e do painel quando um marketplace inteiro está zerado (genérico, sem
produto). A coleção atende os dois.

```
pedidos/{custId__produtoId__mkt}     por produto
pedidos/{custId__geral__mkt}         genérico
```

Id determinístico como todo o resto: clicar duas vezes atualiza, não duplica.
Campos: `custId`, `custNome` denormalizado, `produtoId` (ou `null`), `produtoNome`,
`mkt`, `status` (`"aberto"`/`"atendido"`), `criadoEm`, `atualizadoEm`, e a autoria
dupla `criadoPor { uid, emNomeDe }`.

Regras: cliente cria e lê só os do próprio `custId`, sempre `"aberto"`, não se marca
atendido nem carimba `custId` alheio. **Especialista não aparece em cláusula
nenhuma** — não lê nem cria pedido. Equipe lê e atualiza tudo via `employees/{uid}`.

Tela: `js/04-telas.js` → `rProdutos()` ganhou o painel de pedidos abertos no topo.
Listener em `js/01-estado-e-dados.js` (só admin, porque a tela é só do admin).
Botões tratados na delegação do `#content` em `js/07-interacoes-e-boot.js`.

---

## 5. Armadilhas novas — não estão no CLAUDE.md

**Todo comando `firebase` precisa de `--project`.** O projeto ativo desta pasta está
gravado como `otdegestao-homolog`. Comando sem `--project` vai para homologação, que
**não tem backend de propósito** e falha no Secret Manager. O erro sugere habilitar a
API — **não habilite**, é resolver o sintoma na direção errada. Todos os `.command`
do repositório já fixam o projeto; o `redeploy.command` documenta isso em comentário.
Publicar só o backend:

```
npx --yes firebase-tools@latest deploy --project otdegestao --only functions
```

**`cliente.html` deixou de ser autossuficiente.** Ele agora importa `./js/drive.js`.
Como `**/*.js` tem cache de 7 dias, o `ferramentas/carimbar-versao.js` passou a
carimbar o `cliente.html` também. Se adicionar outro import lá, ele já é coberto.

**198 dos 217 documentos de `products` não têm `custId`.** Ids aleatórios em vez do
formato `cust__chave` — são sobra da tela de Planilhas de Margem, que saiu do
sistema. O backfill os reporta como órfãos e não encosta neles. Aparecem em todo
relatório; **não são erro novo.** Limpeza é conversa à parte.

---

## 6. O que continua aberto

- **Pendência dos "Laços de Lã": resolvida.** São duas lojas distintas — `Laços de Lã`
  (Shein, `mjwnD9fSH2LqRUagn5ng`) e `LAÇOS DE LÃ MODA BEBÊ` (Shopee, `blnx6lwuf`). O
  Willian confirmou em 09/09/2026 que os anúncios daquela aba são da **Shopee**, que é
  onde já estavam. Se o `CLAUDE.md` ainda listar o item, está desatualizado.
- Redigitar e salvar o 7,21 em "Variação mês passado" da EVA HOME (gravado antes da
  bandeira `varAntManual` existir).
- Criar a conta do especialista de Mercado Livre em 📦 Produtos → 🤝 Especialistas.
- Limpar os 198 `products` sem dono.
- `js/custos.js` continua peso morto. Remoção é conversa à parte.

**Fora do escopo, não tente resolver por código:** `margem` e `lucro` dos anúncios
antigos só saem reimportando as duas abas da Shopee, à mão.

**Pergunta que trava a fase 7:** cada especialista tem uma conta única no marketplace,
com todos os clientes dentro? Se for conta única, o dono do anúncio não sai da conta —
sai do SKU, e a integração precisa nascer em cima do SKU desde o primeiro dia.
Responder **antes** de começar a fase 7.
