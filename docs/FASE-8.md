# Fase 8 — o cliente preenche a ficha do produto, e a margem para de vir da planilha

Plano executável da fase. **Leia o `CLAUDE.md` da raiz antes** — contexto, decisões
travadas e armadilhas estão lá e não se repetem aqui.

Decidido com o Willian em 11/09/2026:

- O cliente passa as informações do produto **na tela**, não em planilha.
- **Obrigatório para salvar:** SKU, peso, medidas do produto, medidas da embalagem,
  foto e observações. Mais o nome, que é o que identifica o produto na lista.
- **Bloco B (margem) vem antes** de encostar em Mercado Livre e TikTok.

Ordem: bloco A → bloco B → volta para a fase 7 (ML e TikTok).

**Estado em 11/09/2026: blocos A e B entregues.** 369 testes passando
(eram 257). O bloco B está funcional mas **travado**: a estimativa de margem só chega ao
cliente quando o imposto entrar na conta. Ver o portão 1.

Depois dos cinco itens, mais três entregas na mesma área — o item 6 abaixo.

## Como trabalhar

Com autonomia. O Willian não é técnico e confere abrindo tela.

- Decisão técnica é da sessão. Não pergunte.
- Teste quebrou: conserte ou reverta. Não leve erro para ele resolver.
- Um commit por item, com `git commit -F arquivo`.
- `node --test testes/*.test.js` antes de começar e depois de cada item.
  **Baseline em 11/09/2026: 257 testes passando.**
- Ao fechar cada item: o que mudou, qual tela abrir, o que deve aparecer lá.

## Os portões

### Portão 1 — ✅ respondido em 11/09/2026

- **A Shopee não cobra frete do lojista.** `frete: null` na tabela dela não é lacuna.
- **O imposto e a comissão da OTDE vêm do cadastro**, não de tabela: `customers.fee` e
  `customers.imposto`, com exceção por loja em `clients.comissao` / `clients.imposto`.
  Os campos JÁ existiam — o fechamento mensal usa os mesmos.

A trava saiu: a conta agora se declara completa quando recebe os dois percentuais.
**O que resta é validar contra a realidade** — ver o item 8.

### Portão 2 — antes do bloco C

Aplicativo de desenvolvedor aprovado no Mercado Livre e no TikTok Shop. Não depende de
código e demora dias ou semanas. **É o caminho crítico da fase 7** — peça no começo
desta fase, não no fim.

**Nenhum item do bloco A ou B mexe em `firestore.rules`.** Se algum precisar mexer,
para e abre portão de `TESTAR-REGRAS.command`, como manda o `CLAUDE.md`.

---

# Bloco A — o cliente cadastra

## Item 1 — a gravação do produto do cliente, pelo backend ✅ feito, falta publicar

**O achado que muda o desenho:** a regra do Firestore deixa o cliente criar produto,
mas **proíbe ele de escrever `mkts`** — e é de propósito, porque `mkts` é quem decide
qual especialista enxerga o produto. Se o cliente pudesse escrever, ele escolheria
quem vê o custo dele.

Consequência: produto cadastrado pelo cliente **nasce invisível para o especialista**,
que é justamente quem precisa dele para anunciar. Cadastrar e não aparecer para ninguém
é pior que não ter a tela.

**Endpoint novo em `functions/index.js`, no padrão do `gerenciarVinculosAnuncios`:**

- Grava com Admin SDK, depois de conferir no token que o `custId` é o do próprio
  cliente. Equipe entrando como cliente também passa, via `employees/{uid}`.
- Carimba `mkts` a partir do proprietário — o mesmo que a importação já faz.
- Id determinístico `custId__chave`, pela `idDoProduto()` que já existe.
  Salvar duas vezes atualiza, não duplica.
- Autoria dupla: `criadoPor { uid, emNomeDe }`. A equipe pode estar digitando pelo cliente.
- **Não encosta em `custo`, `preco`, `margem` nem `lucro` quando o campo não vem.**
  Campo vazio não apaga o que a planilha trouxe.

**Não use gatilho do Firestore para carimbar o `mkts`.** Já foi tentado e removido:
dependia do Eventarc, quebrava o deploy e nascia na região errada. Está no `CLAUDE.md`.

**Decisão da sessão:** a tela chama o endpoint em vez de gravar direto. Se a gravação
falhasse pela metade, o produto ficaria sem `mkts` e sumiria do especialista **em
silêncio** — e silêncio é o modo de falha caro deste projeto.

**Teste:** a função pura que monta o documento, em `testes/`, sem Firestore.
Cobrir: obrigatório faltando, `custId` alheio recusado, campo vazio não apaga valor
gravado, salvar duas vezes dá o mesmo id.

## Item 2 — o formulário na área do cliente ✅ feito, falta publicar

Hoje existe "Editar produto" em `cliente.html`, mas só a equipe vê (`estado.souEquipe`).
O formulário já tem nome, SKU, custo, peso, medidas e link das fotos.

**Dois campos novos** — hoje só existe um campo de medidas, rotulado "embalagem":

- `medidasProduto` — medidas do produto
- `obs` — observações

- Botão **"+ Novo produto"** na lista, e **"Editar"** na ficha, para o cliente.
- Os sete obrigatórios barram o salvamento, com o campo faltando marcado.
  Custo **não** é obrigatório: é a ficha para anunciar, não a precificação.
  Sem custo não sai margem no bloco B, e a ficha diz isso.
- Produto com ficha incompleta aparece marcado na lista — "faltam 3 informações".
  É o que faz o cliente voltar e preencher.
- Foto: o campo aceita link do Drive e a miniatura já existe (`js/drive.js`, fase 6).

**Armadilha:** botão dentro de modal não clica sozinho neste projeto. Em `cliente.html`
o modal é o `#popConteudo` e os botões são ligados à mão depois do `innerHTML` —
siga o que o `abrirEdicao()` já faz.

## Item 3 — a equipe vê o que entrou ✅ feito, falta publicar

Em 📦 Produtos, painel com os produtos cadastrados ou editados pelo cliente nos últimos
dias, e os que estão com ficha incompleta. Sem isto, o cliente preenche e ninguém olha.

---

# Bloco B — a margem sai da planilha

**O problema:** a planilha faz dois trabalhos. Traz a ficha do produto **e** traz margem
e lucro de cada anúncio, já descontando comissão, frete e imposto. O cliente sabe o custo
dele; ele não sabe a taxa do marketplace. Tirar a planilha sem resolver isto apaga o
número que faz o painel do cliente valer alguma coisa.

**Decisão travada do `CLAUDE.md` que continua valendo:** margem que veio da planilha
**nunca é recalculada**. Preço menos custo dá 52% onde o real é 7,5%. O cálculo novo só
entra onde não há valor gravado.

## Item 4 — tabela de taxas por marketplace ✅ feito, falta publicar

**Mudou de desenho durante a execução, e o motivo importa:** o plano dizia `config/taxas`
no Firestore, com o cálculo só no backend para a tabela não sair. Mas comissão de
marketplace é **informação pública** — está no site da Shopee. O que seria sensível é o
imposto do cliente, que ainda não entrou.

Então as taxas moram em `js/taxas.js`, espelhado para `functions/`. Ganhos: não mexe nas
regras do Firestore (risco zero), o mesmo número vale na tela e no backend, e o git guarda
quando cada taxa mudou — o que nenhuma tela de cadastro daria. Custo: mudar taxa exige
publicar, o que acontece de qualquer jeito.

Números de 11/09/2026: Shopee com cinco faixas de comissão por valor do item; Shein com
20% fixo mais frete por faixa de peso.

## Item 5 — margem calculada ✅ feito, falta publicar

Função pura, sem Firestore, no padrão do `tarefas-automaticas.js` e do
`backfill-denormalizados.js`. Preço, custo e a linha de taxas entram; lucro e margem saem.

- Só grava onde `margem`/`lucro` estão vazios. Nunca por cima da planilha.
- Sem custo ou sem linha de taxas: fica vazio e diz o porquê. **Não chuta.**
- Na tela, o número calculado é rotulado como estimativa, separado do que veio da
  planilha. Mesma disciplina do aviso do Drive: não afirmar o que não se sabe.

**A bandeira `completa`** ficou, mas mudou de dono: ela agora fala do RESULTADO, não da
tabela. Só é `true` quando a conta recebeu a comissão da OTDE e o imposto. Sem eles sai a
conta do marketplace, que é o que o especialista precisa para precificar e é tudo que ele
pode ver — quanto a OTDE cobra de cada cliente não é assunto dele.

**Como os percentuais chegam à tela sem abrir o cadastro:** `customers` e `clients` não
são lidos por nenhum papel externo (`clients.access` guarda a senha da loja, e regra do
Firestore não esconde campo). Denormalizar nos produtos resolveria para o cliente e
criaria outro vazamento, porque o especialista lê produtos pelo marketplace. Então quem lê
o cadastro é o servidor, pelo endpoint `percentuaisDoCliente`, e sai de lá só o que aquele
lojista já sabe do próprio contrato.

## Item 6 — o login dentro do painel, e achar o que falta preencher ✅ feito, falta publicar

Três coisas, depois de o Willian abrir a tela e ver um formulário de login cortado
aparecendo na aba Produtos.

**O bug, que tinha uma causa séria:** o `cliente.html` embutido fazia `signOut` quando não
reconhecia a conta. A sessão do Firebase é a MESMA do painel (mesma origem, mesmo app), e
uma falha de rede lendo `employees` bastava para o iframe **derrubar o funcionário do
sistema inteiro**. Embutido, agora nunca desloga: mostra o recado e para. O formulário
também passou a nascer escondido, em vez de piscar a cada abertura da aba.

**Achar o que falta:** a lista conta as fichas incompletas no topo e tem um botão que
reduz a lista exatamente a elas. Antes, "faltam 3 informações" ficava espalhado em
duzentos produtos e preencher virava uma caça.

**O celular:** a tabela de cinco colunas estourava, e a última — onde moram os selos e o
botão de editar — saía da tela. O cliente não conseguia abrir a ficha do próprio produto
no aparelho em que vai preenchê-la. No celular cada linha virou um cartão.

## Item 7 — os percentuais do contrato entram na conta ✅ feito, falta publicar

Ver acima. O endpoint, a herança loja → cliente compartilhada com o fechamento mensal, e
a conta completa chegando à tela do cliente.

## Item 8 — conferir a conta contra a planilha ✅ feito, falta publicar

📦 Produtos → **Conferir margens**. Põe lado a lado, com os dados REAIS de produção, a
margem que veio da planilha e a que o sistema calcula, ordenado pela maior divergência.

É a única prova que vale: nenhum teste sabe quanto a planilha descontou de verdade. Se as
duas baterem, o cálculo pode ser usado onde não há margem gravada. Se a estimativa sobrar
sempre mais, há um desconto que o sistema ainda não conhece — e a tela diz isso.

**É por aqui que se descobre o que falta**, em vez de adivinhar.

---

# Bloco C — Mercado Livre e TikTok (volta para a fase 7)

O `FASE-7.md` da raiz já tem a fundação entregue: o cadastro de vínculos que diz de qual
cliente é cada anúncio numa conta compartilhada. O que falta é espelhar o que a Shopee já
faz: conectar a conta, puxar vendas, puxar anúncios, vigiar promoções e transformar isso
em alerta e tarefa com dono.

**Depende do portão 2 e de mais nada que esteja neste repositório.**

---

## Fora do escopo desta fase

- `margem` e `lucro` dos anúncios antigos da Shopee: só reimportando as duas abas à mão.
- Os 198 `products` sem `custId`, sobra da tela de Planilhas de Margem. Limpeza à parte.
- Remoção do `js/custos.js`.
- Tirar a importação de planilha do ar. Ela continua funcionando por cima do cadastro
  novo — enquanto houver cliente que prefere mandar planilha, os dois caminhos convivem.
