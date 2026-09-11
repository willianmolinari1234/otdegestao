# Fase 8 — o cliente preenche a ficha do produto, e a margem para de vir da planilha

Plano executável da fase. **Leia o `CLAUDE.md` da raiz antes** — contexto, decisões
travadas e armadilhas estão lá e não se repetem aqui.

Decidido com o Willian em 11/09/2026:

- O cliente passa as informações do produto **na tela**, não em planilha.
- **Obrigatório para salvar:** SKU, peso, medidas do produto, medidas da embalagem,
  foto e observações. Mais o nome, que é o que identifica o produto na lista.
- **Bloco B (margem) vem antes** de encostar em Mercado Livre e TikTok.

Ordem: bloco A → bloco B → volta para a fase 7 (ML e TikTok).

**Estado em 11/09/2026: bloco A inteiro entregue e não publicado.** 304 testes passando
(eram 257). O bloco B está parado no portão 1, esperando os números das taxas.

## Como trabalhar

Com autonomia. O Willian não é técnico e confere abrindo tela.

- Decisão técnica é da sessão. Não pergunte.
- Teste quebrou: conserte ou reverta. Não leve erro para ele resolver.
- Um commit por item, com `git commit -F arquivo`.
- `node --test testes/*.test.js` antes de começar e depois de cada item.
  **Baseline em 11/09/2026: 257 testes passando.**
- Ao fechar cada item: o que mudou, qual tela abrir, o que deve aparecer lá.

## Os portões

### Portão 1 — antes do item 5

O cálculo da margem precisa dos números que a planilha desconta hoje, **por marketplace**:
comissão em %, taxa fixa por pedido em R$, e o imposto em %. Pergunta de negócio, só o
Willian responde. Peça cedo — ele precisa abrir a planilha para levantar.

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

## Item 4 — tabela de taxas por marketplace

`config/taxas`, mantida pela equipe. Por marketplace: comissão %, taxa fixa por pedido,
imposto %. A regra já deixa funcionário ler e escrever `config` — **não mexe em regra.**

**A tabela não sai para cliente nem para especialista.** O cálculo acontece no backend e
o que viaja é o resultado. Isolamento ganha de conveniência.

## Item 5 — margem calculada

Função pura, sem Firestore, no padrão do `tarefas-automaticas.js` e do
`backfill-denormalizados.js`. Preço, custo e a linha de taxas entram; lucro e margem saem.

- Só grava onde `margem`/`lucro` estão vazios. Nunca por cima da planilha.
- Sem custo ou sem linha de taxas: fica vazio e diz o porquê. **Não chuta.**
- Na tela, o número calculado é rotulado como estimativa, separado do que veio da
  planilha. Mesma disciplina do aviso do Drive: não afirmar o que não se sabe.

**Termina no portão 1** — sem os números do Willian, o item 5 não começa.

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
