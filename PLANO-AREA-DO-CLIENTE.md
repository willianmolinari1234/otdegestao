# Plano — Área do cliente e dos especialistas

Levantado do código em 25/08/2026 (commit c22b134), não de memória.
Protótipo das telas: https://claude.ai/code/artifact/4803f61b-c5e5-4fac-9f6d-71e9debab29b
Este plano em página: https://claude.ai/code/artifact/ee64a14c-626a-4d99-b007-bff3ae375470

---

## O terreno, conferido no código

| | |
|---|---|
| **quem entra hoje** | Firebase Auth + documento em `employees/{uid}`. Sem ele a conta não vê nada, e as regras inteiras se apoiam em `ehFuncionario()` / `ehAdmin()`. **Cliente e especialista não existem como conta.** |
| **`customers.login`** | Não é acesso ao sistema: é a senha **do marketplace**, guardada para a equipe operar a loja. |
| **`relatorio-cliente.html`** | Apesar do nome, é tela de funcionário — exige login de `employees`. Nenhum cliente nunca abriu. |
| **catálogo da Shopee** | **Não existe.** O backend lê *pedidos*; produtos só aparecem como `item_list` dentro do pedido. Trazer catálogo é integração nova (`product/get_item_list` + `get_item_base_info`). |
| **foto e vídeo** | O projeto **não tem Firebase Storage**. Nenhum arquivo é guardado hoje, só documentos. |
| **`products`** | 1 documento órfão, sobra da planilha removida. Livre para redefinir sem migração. |
| **marketplaces do cliente** | `customers` não tem esse campo. É o pré-requisito de "não mostra o que ele não tem". |

### Correção do que eu disse antes

`js/custos.js` (430 linhas, com testes) **não tem nenhum consumidor**. O `app.html`
importa o módulo e o expõe em `window.custos`, mas nenhuma linha do sistema lê
`window.custos` — o arquivo é baixado em todo boot e nunca usado. Eu tinha afirmado
que a conferência diária e o relatório de cliente usavam; não usam, e foi por isso que
ele sobreviveu à remoção das Planilhas sem ninguém notar.

A conclusão prática não muda, muda de motivo: é um motor de custo e margem pronto e
testado esperando consumidor, e o consumidor é a margem de contribuição por
marketplace (fase 7). Quando a fase 7 chegar, o import passa a se pagar. Até lá, se
quiser, dá para tirar o import do `app.html` sem mexer no arquivo.

---

## Fases, na ordem em que uma destrava a outra

### 0. Contas e papéis — bloqueia todo o resto

`accounts/{uid}` + Cloud Function que espelha o papel nas *custom claims* do token.
As regras leem a claim em vez de fazer `get()`: cada `get()` dentro de uma regra é uma
leitura cobrada e um atraso em toda consulta da tela.

```
accounts/{uid}
  papel   "cliente" | "especialista" | "equipe"
  custId  id do proprietário          (só cliente)
  mkt     "Mercado Livre" | "TikTok"  (só especialista)
```

É a única fase onde um erro vaza dado de um cliente para outro. Regras escritas e
testadas ANTES de existir qualquer tela nova.

### 1. Em quais marketplaces cada cliente opera — pequena

Campo `marketplaces` em `customers` + caixinhas no cadastro que já existe.

### 2. Produto, a espinha — a maior

O produto é do proprietário, não da loja: é o que faz as 3 lojas da mesma pessoa
aparecerem juntas. Chave = `custId` + SKU normalizado (`normalizarSku()` já existe).

```
products/{id}
  custId · sku · nome · descricao
  custo · peso · medidas {c,l,a}
  fotos[] · video
  criadoEm · criadoPor {uid, emNomeDe}
```

Dentro desta fase mora a integração nova com a Shopee. Ela sozinha é maior que as
fases 3, 4 e 5 somadas.

### 3. Anúncios por marketplace

```
listings/{id}
  custId · sku · mkt · storeId · itemId · preco · status
```

### 4. A área do cliente

Página própria (`cliente.html`), não uma aba do `app.html`. O app abre listeners em
tempo real de 41 lojas, tarefas e promoções no boot — um cliente não pode nem baixar
isso. Página separada também encolhe a superfície: o que não está lá não vaza.

### 5. A área do especialista

Mesma página da fase 4, filtrada pelo `mkt` da conta. A fila de pedidos é um filtro
da lista, não uma tela à parte.

### 6. Entrar como cliente, com autoria dupla

Não precisa de token de personificação: você já lê tudo, o que muda é a TELA e não a
sessão. O que importa é a gravação — `criadoPor` (você) e `emNomeDe` (o cliente).
Sem os dois, daqui a seis meses um produto errado é indistinguível entre "o cliente
mandou assim" e "a OTDE digitou errado".

### 7. Margem de contribuição por marketplace

Na Shopee sai inteira (venda + preço praticado + custo). Em ML e TikTok não existe
integração de vendas — ver decisão 2.

---

## Decisões pendentes (nenhuma depende de código)

1. **Onde ficam foto e vídeo** — Storage próprio (custo por GB e por download) ·
   foto no Storage e vídeo por link · tudo por link.
2. **De onde vêm as vendas de ML e TikTok** — especialista lança · só custo e preço,
   sem margem realizada · integrar depois e reservar o espaço.
3. **O especialista vê o custo de todos os clientes?** — de todos · só dos que operam
   no marketplace dele (recomendado).
4. **Primeira carga do catálogo da Shopee** — uma loja por vez com botão · tudo
   agendado de madrugada · só as lojas do cliente quando ele entra.

---

## Por onde começar

1. Responder as 4 decisões.
2. `accounts` + claims + regras novas, com **testes de isolamento**: um cliente lendo
   outro cliente tem que falhar no teste antes de existir tela.
3. Campo de marketplaces em `customers`.
4. Criar uma conta de cliente real e entrar nela pelo celular, antes de qualquer produto.

Fundação primeiro não rende tela bonita no fim do dia. Mas o erro caro deste projeto
não é uma tela feia: é um cliente enxergando o custo do outro, e esse erro nasce
inteiro na fase 0.
