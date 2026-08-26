# Plano — Área do cliente e dos especialistas

Levantado do código em 25/08/2026. Decisões fechadas com o Willian na mesma data.
Protótipo das telas: https://claude.ai/code/artifact/4803f61b-c5e5-4fac-9f6d-71e9debab29b
Este plano em página: https://claude.ai/code/artifact/ee64a14c-626a-4d99-b007-bff3ae375470

---

## Decisões fechadas

| Decisão | O que muda |
|---|---|
| **Foto e vídeo no Google Drive** | Some a necessidade de Firebase Storage e o custo recorrente. O sistema guarda **link**, não arquivo. Pendente: o arquivo precisa estar como "qualquer pessoa com o link", senão a imagem quebra para quem não é o dono. |
| **ML e TikTok por API de cada marketplace** | Vira fase própria e grande (fase 7). Não bloqueia nada antes dela. Pendente: **é uma conta por especialista com todos os clientes dentro?** Se for, o dono do anúncio não sai da conta — sai do SKU. |
| **Especialista vê só os clientes que ele opera** | Regra do Firestore mais estreita; o custo não circula além de quem precisa dele para precificar. |
| **Produtos importados das planilhas** | A maior mudança. A integração de catálogo da Shopee **sai do caminho crítico**, e o `interpretarPlanilha()` do `custos.js` vira a porta de entrada do sistema. |

---

## O achado: o importador já existe, pronto e testado

`js/custos.js` (430 linhas, com testes) **não tinha nenhum consumidor** — o `app.html`
importa e expõe em `window.custos`, mas nenhuma linha lê isso. Eu tinha dito que a
conferência diária usava; não usa. Era peso morto baixado em todo boot.

Com "os produtos vêm das planilhas", ele vira a fundação da fase 2. O que já sabe fazer:

- **Colunas em qualquer ordem**, achadas pelo cabeçalho com sinônimos (`codigo`, `ref`,
  `produto`, `valor da venda`, `custo do produto`). Nenhuma planilha de cliente precisa
  ser padronizada.
- **Link vira anúncio**: de `shopee.com.br/…-i.1441293057.58253222559` extrai o id do
  anúncio. *Isso é a fase 3 saindo de graça* — a planilha já diz onde o produto está
  anunciado na Shopee, sem chamar a API.
- **Tab, ponto-e-vírgula ou vírgula**, colado do Sheets ou baixado como CSV, com aspas
  protegendo `R$ 1.234,56`. Colar o *endereço* da planilha por engano tem aviso próprio.
- **Custo divergente não passa**: o mesmo SKU repete (vários anúncios); ele reduz a uma
  linha por SKU e marca conflito se o custo divergir, em vez de importar em silêncio.

O que a planilha **não** traz: peso, medidas, descrição, foto e vídeo — isso vem do
cadastro do cliente. E as planilhas são **registro de vendas**: produto que nunca vendeu
pode não estar lá. Conferir numa planilha real antes de construir a tela.

---

## O terreno, conferido no código

| | |
|---|---|
| **quem entra hoje** | Firebase Auth + `employees/{uid}`. As regras inteiras se apoiam em `ehFuncionario()` / `ehAdmin()`. **Cliente e especialista não existem como conta.** |
| **`customers.login`** | Senha **do marketplace**, não acesso ao sistema. |
| **`relatorio-cliente.html`** | Apesar do nome, é tela de funcionário. |
| **`products`** | 1 documento órfão. Livre para redefinir sem migração. |
| **marketplaces do cliente** | `customers` não tem o campo. |
| **catálogo da Shopee** | O backend lê pedidos, não produtos. Com a importação por planilha, deixa de ser urgente — vira melhoria depois, para pegar o que nunca vendeu. |

---

## Fases

### 0. Contas e papéis — bloqueia todo o resto

`accounts/{uid}` + Cloud Function que espelha o papel nas *custom claims*. As regras leem
a claim em vez de fazer `get()`: cada `get()` numa regra é leitura cobrada e latência.

```
accounts/{uid}
  papel   "cliente" | "especialista" | "equipe"
  custId  id do proprietário          (só cliente)
  mkt     "Mercado Livre" | "TikTok"  (só especialista)
```

O especialista só vê quem ele opera, então a regra dele cruza `mkt` com o campo da fase 1.
Única fase onde um erro vaza dado de um cliente para outro.

### 1. Marketplaces de cada cliente — pequena

Campo `marketplaces` em `customers` + caixinhas no cadastro. Sustenta duas regras ao mesmo
tempo: o cliente não vê o que não tem, o especialista não vê quem não é dele.

### 2. Importar as planilhas — menor do que era

Tela só do admin: escolhe o cliente, cola a planilha, vê o que entrou / em conflito /
ignorado, confirma. O motor (`interpretarPlanilha`) já existe testado; o trabalho é tela
e gravação.

```
products/{id}
  custId · sku · nome · custo
  peso · medidas {c,l,a}        (do cadastro)
  fotos[] · video               (links do Drive)
  criadoEm · criadoPor {uid, emNomeDe}
```

O produto é do proprietário, não da loja — é o que faz as 3 lojas da mesma pessoa
aparecerem juntas. Chave = `custId` + SKU normalizado.

### 3. Anúncios por marketplace

```
listings/{id}
  custId · sku · mkt · storeId · itemId · preco · status
```

Shopee sai pronta da importação (link → id do anúncio). ML e TikTok entram na fase 7.

### 4. A área do cliente

Página própria (`cliente.html`), não aba do `app.html` — o app abre listeners em tempo
real de 41 lojas no boot. No cadastro o cliente cola links do Drive e preenche peso,
medidas, descrição e custo.

### 5. A área do especialista

Mesma página, filtrada duas vezes: pelo `mkt` da conta e pelos clientes que operam nele.

### 6. Entrar como cliente, com autoria dupla

Não precisa de token de personificação: muda a TELA, não a sessão. Toda gravação carimba
`criadoPor` (admin) e `emNomeDe` (cliente).

### 7. APIs do Mercado Livre e do TikTok — agora a maior

Duas integrações independentes, cada uma com cadastro de aplicativo, autorização e
renovação de token. Última de propósito: é a única que depende de aprovação de terceiro.

---

## Por onde começar

1. `accounts` + claims + regras, com **testes de isolamento**: cliente lendo outro
   cliente, e especialista lendo cliente que não é dele, têm que falhar no teste.
2. Campo de marketplaces em `customers`.
3. Criar uma conta de cliente real e entrar por ela pelo celular.
4. **Uma planilha real de cliente** para rodar o importador antes de construir a tela.

Fundação primeiro não rende tela bonita no fim do dia. Mas o erro caro deste projeto não
é uma tela feia: é um cliente enxergando o custo do outro, e esse erro nasce inteiro na
fase 0.
