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

## Item 1 — a tabela de taxas dos dois, antes de qualquer API

**Este item não depende do portão 1** e entrega valor sozinho.

O especialista de Mercado Livre já registra anúncios à mão desde a fase 5. Hoje ele digita
o preço e o sistema diz "não tenho as taxas de Mercado Livre". Com a tabela de comissão
preenchida em `js/taxas.js`, a margem passa a funcionar lá **sem integração nenhuma** —
do mesmo jeito que já funciona para Shopee e Shein.

Precisa do Willian: a comissão do Mercado Livre (que varia por categoria e por tipo de
anúncio, clássico ou premium) e a do TikTok Shop. Frete, se houver.

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
