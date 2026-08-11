# Esquema de dados — OTDE Gestão de Contas

Mapa de todas as coleções do Firestore: o que guardam, quem escreve e quem lê.
Levantado a partir dos dados reais em produção (05/08/2026).

> **Regra de ouro:** o que vem da **API da Shopee** nunca é escrito pelo
> navegador. O backend (Cloud Functions) escreve; o site apenas lê.

---

## Visão geral

| Coleção | Docs | Origem | Quem escreve |
|---|---:|---|---|
| `clients` | 61 | manual | site |
| `customers` | 48 | manual | site |
| `employees` | 5 | manual | backend (só admin) |
| `tasks` | 327 | manual | site |
| `promos` | 112 | manual | site |
| `products` | 1 | manual | site |
| `config` | 1 | manual | site |
| `sales` | 1.538 | **API Shopee** | backend |
| `tools` | 26 | **API Shopee** | backend |
| `integracoes` | 26 | **API Shopee** | backend |
| `performance` | 22 | misto | site |
| `financeiro` | 0 | **API Shopee** | backend |
| `shopee_auth` | 17 | **API Shopee** | backend (ninguém lê pelo site) |

---

## Coleções

### `clients` — lojas dos clientes
ID: gerado pelo sistema. **É a chave que liga tudo** (vendas, integrações, relatórios).

| Campo | Tipo | O que é |
|---|---|---|
| `name` | texto | Nome da loja |
| `mkt` | texto | Marketplace (Shopee, Shein…) |
| `custId` | ref | Dono da loja → `customers` |
| `comissao` | número | % da OTDE sobre o faturamento (vazio = 2%) |
| `imposto` | número | % de imposto (vazio = não deduz) |
| `baseCobranca` | texto | `mes` ou `ultimos30` |
| `shopeeUsername` | texto | Usuário na Shopee |
| `access` | objeto | Credenciais de acesso (url, user, pass, notes) |

### `customers` — proprietários (podem ter várias lojas)
`name`, `fee`, `imposto`, `login`

### `employees` — equipe
ID = UID do Firebase Auth. **Sem documento aqui, o login não acessa nada.**
`name`, `email`, `role` (`admin` \| `emp`), `color`, `ini`

### `tasks` — tarefas da operação
`title`, `desc`, `cli` (→ clients), `emp` (→ employees), `date`, `status`
(`todo`/`doing`/`done`), `pri`, `qty`, `order`, `doneDate`

### `promos` — promoções acompanhadas manualmente
`name`, `type`, `cli`, `emp`, `end`, `status`, `taskId`

### `products` / `config` — planilha de margem e metas
`products`: `nome`, `sku`, `custo`, `valor`, `peso`, `medidas…`
`config`: `adsPerDay`, `conclusao` (metas da equipe)

---

## Vindas da API da Shopee

### `sales` — vendas por dia e por loja
ID: `{clienteId}_{AAAA-MM-DD}`. **Base do faturamento e da cobrança.**

| Campo | O que é |
|---|---|
| `cliente` | → `clients` |
| `data` | dia (AAAA-MM-DD, fuso de Brasília) |
| `gmv` | **faturamento** — preço de venda − cupom do vendedor (idêntico ao Seller Centre) |
| `totalPago` | total pago pelo comprador (inclui frete) |
| `frete` | frete pago pelos compradores |
| `cupons` / `cashback` | descontos custeados pelo lojista |
| `comissao` | comissão cobrada pela Shopee |
| `taxaServico` | taxa de serviço da Shopee |
| `liquido` | **o que cai na conta** (escrow) |
| `pedidos` | pedidos válidos (exclui não pagos e cancelados) |
| `ticketMedio` | gmv ÷ pedidos |

> Dias sem venda **não viram documento** — evita encher a coleção de zeros.

### `tools` — promoções ativas por loja
ID = clienteId. `promocoes[]` com `tipo`, `nome`, `inicio`, `fim`.

### `integracoes` — status da conexão (sem tokens)
ID = clienteId. `conectado`, `shopId`, `conectadoEm`,
`historicoDe`, `historicoProximo`, `historicoCompleto` (recuperação do histórico).

### `shopee_auth` — tokens de acesso ⚠️
ID = clienteId. Guarda `accessToken` e `refreshToken`.
**Bloqueado para leitura e escrita pelo navegador.** Só o backend acessa.

---

## `performance` — dados do relatório mensal
ID: `{clienteId}_{AAAA-MM}`. Mistura o que vem da API com o que é preenchido à mão.

| Campo | Origem | O que é |
|---|---|---|
| `faturamento` | **API** (quando integrada) | mês fechado |
| `custoAds`, `receitaAds` | manual | investimento e retorno de Ads |
| `percentFatura` | manual | % de comissão do mês |
| `roas`, `tacos`, `valorPercent` | calculado | derivados |
| `anunciosNovos`, `solicitacoes` | manual | acompanhamento |
| `variacaoMesAtual/Passado` | calculado | comparativos |
| `faturamentoOrigem` | controle | `api-shopee` ou `manual` |
| `faturamentoAnteriorManual` | controle | valor antes de ser substituído pela API |

---

## Inconsistências conhecidas (a resolver na etapa 3)

1. **Idiomas misturados**: coleções em inglês (`clients`, `sales`) e português
   (`financeiro`, `integracoes`, `performance`).
2. **Campos misturados** no mesmo documento: `name` ao lado de `comissao`,
   `data` ao lado de `gmv`.
3. **Apelidos diferentes no código**: `emps`, `clis`, `tsks`, `proms` para
   `employees`, `clients`, `tasks`, `promos`.
4. **`financeiro` está vazia** — foi criada mas os dados acabaram indo para
   `sales`. Candidata a ser removida.
5. **Comissão em dois lugares**: `clients.comissao` (cadastro) e
   `performance.percentFatura` (por mês). Precisam de uma fonte única.
