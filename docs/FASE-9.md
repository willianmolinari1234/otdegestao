# Fase 9 — Mercado Livre e TikTok, espelhando o que a Shopee já faz

Plano da fase. **Leia o `CLAUDE.md` da raiz antes** — contexto, decisões travadas e
armadilhas estão lá e não se repetem aqui. O que já foi construído de conta compartilhada
está em `FASE-7.md` (raiz); o que a fase 8 entregou, em `docs/FASE-8.md`.

## O que a Shopee faz hoje, e que é o alvo a espelhar

1. Conecta a conta com um clique (OAuth) e guarda os tokens em `shopee_auth`.
2. Puxa vendas a cada 30 min, anúncios e histórico a cada 5 min.
3. Vigia promoções e cupons a cada 6 h.
4. Transforma o que achou em alerta no painel e em **tarefa com dono** no kanban.
5. Reconfere as vendas de madrugada e acusa divergência.

Nada disso existe para Mercado Livre e TikTok. O que existe é a fundação: o cadastro de
vínculos que diz **de qual cliente é cada anúncio** numa conta compartilhada por vários
clientes, entregue na fase 7.

## Os portões

### Portão 1 — o único bloqueio real, e não depende de código

**Aplicativo de desenvolvedor aprovado no Mercado Livre e no TikTok Shop.** Os dois passam
por aprovação e levam dias ou semanas. Enquanto não houver `client_id`, `client_secret` e
a URL de retorno autorizada, não há o que integrar — e nenhuma linha escrita antes disso
é confiável, porque o formato real da resposta só se conhece chamando.

**Peça no primeiro dia da fase, não no meio.**

### Portão 2 — antes de distribuir dado de venda ao cliente

Um anúncio sem vínculo confirmado **não entra em projeção nenhuma**. Sem essa trava, uma
venda do cliente A aparece no painel do cliente B — que é o erro mais caro deste sistema,
e o único que não dá aviso. A regra já está escrita em `functions/vinculos-anuncios.js`:
`resolver` devolve `pendente` quando o vínculo não existe, e **não há fallback por SKU**.

---

## Item 0 — a tabela da Shopee conferida contra o que ela cobrou ✅ 13/09/2026

A conferência mais forte não é contra a planilha: é contra a própria Shopee. A
sincronização já guardava em `sales` o que ela **cobrou de verdade** (`comissao` +
`taxaServico`, da API financeira), e ninguém tinha olhado para esse número.

📦 Produtos → **Conferir margens** agora abre com essa comparação: quanto a Shopee cobrou,
quanto a tabela previa, e a diferença em pontos. A conta é por **item**, não por pedido —
três peças de R$ 40 num pedido de R$ 120 caem na primeira faixa da tabela, não na terceira.

É isso que diz se a tabela está certa, sem depender da planilha de ninguém. E o mesmo
método serve para Mercado Livre e TikTok assim que houver venda sincronizada de lá.

## Item 1 — as taxas dos dois ✅ TikTok em 14/09/2026 · ML virou item 2b

**TikTok Shop: feito, e não depende do portão 1.** Números lidos nas páginas oficiais
(Tarifa de Comissão da Plataforma, 12/06/2026; Programa de Taxas de Envio, 31/08/2026) e
gravados em `js/taxas.js`:

- item **abaixo de R$50**: 10% + R$4 por item
- item **de R$50 para cima**: 6% + R$6 por item
- mais **6% do preço** do Programa de Taxas de Envio, teto de R$50 por produto — o
  vendedor entra nele automaticamente

A base é o preço **após o desconto do vendedor**. O frete do TikTok é percentual e não
depende de peso, por isso a tabela dele não pede peso do produto.

**Mercado Livre NÃO vira tabela.** Foi a decisão do Willian em 14/09/2026, e ela está
certa: a comissão do ML varia de 10% a 14% (Clássico) e 15% a 19% (Premium) **por
categoria**, mais custo fixo por faixa abaixo de R$79, mais um frete que desde a regra
Flat Fee depende de peso, região e reputação. Qualquer número escolhido no meio da faixa
seria margem inventada.

O certo é **puxar a categoria do próprio anúncio e perguntar a taxa à API**:

```
GET /items/{MLB…}                    → category_id, listing_type_id
GET /sites/MLB/listing_prices        → sale_fee_amount por preço+categoria+tipo
    ?price=&category_id=&listing_type_id=
```

Assim a taxa nunca fica velha e ninguém mantém tabela.

**Mas isso passou a depender do portão 1.** Conferido em 14/09/2026: a API do Mercado
Livre fechou o acesso público — `/items`, `/sites/MLB/listing_types` e
`/sites/MLB/listing_prices` devolvem **403 sem token**. Antes davam para consultar sem
credencial.

Consequência prática: **a margem do Mercado Livre é hoje o maior motivo para pedir as
credenciais**, e não a sincronização de vendas. O especialista de ML já registra anúncios
à mão desde a fase 5 e continua sem margem até o aplicativo ser aprovado.

Até lá o sistema diz "não tenho as taxas de Mercado Livre" — que é a resposta honesta, e
tem teste garantindo que continue assim em vez de estimar.

## Item 2 — conectar a conta (depende do portão 1)

Espelhar `linkAutorizacao` + `shopeeCallback`: link assinado, retorno valida, tokens
guardados numa coleção privada com a mesma regra do `shopee_auth` (`allow read, write: if
false` — nem o navegador do admin lê).

Renovação de token é parte do item, não detalhe: token que expira em silêncio faz a
sincronização parar sem nada quebrar na tela.

## Item 3 — descobrir anúncios e alimentar as pendências

O adaptador lista os anúncios da conta e registra cada um como **pendente** no cadastro de
vínculos que já existe. A equipe abre 📦 Produtos → Identificar anúncios e diz de quem é
cada um. Nada aparece para cliente nenhum antes disso.

## Item 4 — vendas por cliente

Só dos anúncios com vínculo confirmado, e com **revalidação transacional** do vínculo no
momento da gravação: entre resolver e escrever, o vínculo pode ter mudado.

Cuidado com o anúncio que veio de planilha e também vem da API: id determinístico
`loja__anuncio` evita duplicata, mas o `storeId` do ML não é o da planilha. Resolver antes
de gravar, não depois de duplicar.

## Item 5 — alerta e tarefa

Quando as promoções do ML estiverem chegando, a regra entra em `REGRAS`
(`functions/tarefas-automaticas.js`) como as três que já existem. **A pergunta antes de
ligar qualquer regra nova é sempre a mesma:** a pessoa que vai receber esta tarefa
consegue resolvê-la? Se parte das lojas está bloqueada da ferramenta, a regra precisa da
marca de "não se aplica", como a oferta relâmpago ganhou em 13/09/2026.

## Item 6 — TikTok, na mesma estrutura

Depois que o Mercado Livre estiver de pé. Repetir o desenho, não inventar um segundo.

---

## Fora do escopo desta fase

- Reescrever a sincronização da Shopee para "unificar os adaptadores". O que funciona em
  produção há meses não vira cobaia de refatoração.
- Os 198 `products` sem `custId`. Limpeza à parte.
- `js/custos.js`, que continua sem consumidor.
