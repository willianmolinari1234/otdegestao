# Fase 6 — fechar os buracos das fases 0 a 5

Plano executável da fase em andamento.

**Leia o `CLAUDE.md` da raiz antes.** O contexto do sistema, as decisões travadas e as
armadilhas estão lá e não se repetem aqui. Este arquivo tem só o plano.

Execute os itens na ordem. Não passe ao próximo com o anterior pela metade.

## Como trabalhar

Com autonomia. O Willian não é técnico e não vai revisar código — a forma de ele conferir
o seu trabalho é abrindo uma tela e olhando.

- **Decisão técnica é sua.** Não pergunte.
- **Teste quebrou: conserte ou reverta.** Se não conseguir, pule o item e diga no fim
  o que ficou de fora e por quê.
- **Um commit por item**, com `git commit -F arquivo`.
- **`node --test testes/*.test.js`** antes de começar e depois de cada item. Se já estava
  quebrado antes de você mexer, diga isso em vez de consertar de carona.
- **Ao fechar cada item:** o que mudou, qual tela abrir, o que deve aparecer lá.

## Os dois portões

Pare nestes dois momentos e espere resposta. São os únicos.

### Portão 1 — antes de gravar o backfill

Rode o backfill em dry-run e mostre o relatório. **Não grave até ter resposta.**
A pergunta é de negócio, não técnica: a aba "Laços de Lã" está cadastrada como Shein,
mas existe uma loja na Shopee chamada "LAÇOS DE LÃ MODA BEBÊ". Mostre a tabela de lojas
e pergunte qual é a certa.

### Portão 2 — depois de mexer nas regras

Terminado o item 4, pare. Peça ao Willian dois cliques: `TESTAR-REGRAS.command` e,
se passar, `PUBLICAR.command`. Os 18 testes de isolamento só rodam no Mac dele, com Java,
no emulador — a sessão não consegue rodar.

---

## Item 1 — texto do "Quero anunciar" ✅ feito e publicado

O pop-up já diz que o pedido é pelo grupo. Paliativo até o item 4 existir.

---

## Item 2 — backfill dos campos denormalizados

Produtos e anúncios importados antes da última versão estão sem `custNome`, `storeNome`,
`storeMkt` e `mkts[]`. Sem esses campos a tela do especialista aparece vazia — e vazia
parece bug, não parece dado faltando.

Os quatro campos derivam de `custId` e `storeId`. **Não precisam da planilha.**

**Construa um script no padrão dos outros `.command` do projeto:**

- **Dry-run é o padrão. Só grava com a flag `--gravar`.**
- Varre `products` e `listings`. Preenche só campo vazio ou ausente.
  **Nunca sobrescreve valor já gravado.**
- Não encosta em `margem`, `lucro`, `custo`, `preco`, `criadoPor` nem `criadoEm`.
  Backfill não é digitação e não pode virar autoria.
- `custId` sem cliente, ou `storeId` sem loja: não adivinhe. Conta como órfão e lista.
- Idempotente. Rodar duas vezes não muda o resultado. Grava em lotes.
- O script roda com Admin SDK e **passa por cima das regras do Firestore**.
  É por isso que o dry-run vem primeiro.

**O relatório precisa sair legível para quem não é técnico:** quantos produtos e anúncios
mudariam, por cliente e por loja, com nome por extenso; a lista de órfãos; e uma tabela de
todas as lojas com nome cadastrado e marketplace ao lado.

**Teste:** a função pura que decide o que preencher precisa de teste em `testes/`,
sem tocar no Firestore.

**Termina no portão 1.**

---

## Item 3 — aviso quando o link do Drive não está público

Foto cujo arquivo do Drive não está como "qualquer pessoa com o link" aparece quebrada,
sem explicação nenhuma.

**Antes de escrever, confira uma hipótese:** veja como o link chega ao `src` da imagem.
Se estiver indo a URL de compartilhamento crua (`/file/d/<id>/view`), a imagem quebra
*mesmo quando o arquivo é público* — e aí o problema é normalização de link, não permissão.
Diga o que encontrou antes de seguir.

- Normalize o link: extraia o id dos formatos que aparecem na prática
  (`/file/d/<id>/view`, `open?id=`, `uc?export=view&id=`, `thumbnail?id=`)
  e monte a URL de imagem a partir do id.
- No `onerror`, troque a imagem quebrada por um aviso com link para abrir o arquivo no Drive.
- **O aviso não afirma o que não sabe.** A falha pode ser permissão, link errado ou rede.
  Escreva "não foi possível carregar — confira se o arquivo está como 'qualquer pessoa com
  o link'", não "este arquivo está privado". Mesma disciplina da guarda do Prêmio de
  Seguidor, que não acusa cupom desligado quando a loja não sincronizou.
- Vale para foto e para vídeo.

**Pronto quando:** link cru e link normalizado ambos funcionam, e um id inventado mostra
o aviso em vez de imagem quebrada.

---

## Item 4 — registrar o pedido do "Quero anunciar"

Hoje o pop-up mostra a mensagem e não registra nada: o cliente acha que pediu e ninguém
recebeu. É o maior dos quatro e o único que mexe em `firestore.rules`.

**Primeiro, responda lendo o código, não chutando:** o "Quero anunciar" em `cliente.html`
é por produto ou é um pedido genérico da área do cliente? O desenho muda com a resposta.

**Coleção nova, id determinístico como todo o resto do projeto.** Se for por produto,
algo como `pedidos/{custId__produtoId}` — clicar duas vezes atualiza em vez de criar dois
pedidos. Campos: `custId`, `custNome` denormalizado, referência ao produto, `status`
(`"aberto"` / `"atendido"`), `criadoEm`, `atualizadoEm`, e a autoria dupla de sempre,
porque a equipe pode estar entrando como cliente na hora do pedido.

**Regras do Firestore:**

- Coleção nova em regra default-deny precisa de allow explícito. Nada funciona sem isso.
- Cliente: cria e lê **só os pedidos do próprio `custId`**, pela claim.
- Especialista: **não lê pedido nenhum.** Ele opera marketplace, não recebe pedido de cliente.
- Equipe: lê e atualiza tudo, via `employees/{uid}`.
- Use `request.auth.token.get(campo, "")`, como o resto do arquivo.
  Mantenha o comentário sobre `clients.access`.

**Testes de isolamento:** os 18 casos viram mais. No mínimo: cliente não lê pedido de outro
cliente; especialista não lê pedido nenhum; cliente não consegue criar pedido carimbando
`custId` alheio; equipe lê tudo.

**Tela:** lista dos pedidos abertos para a equipe, em 📦 Produtos.

**Depois que funcionar:** volte o texto do pop-up do item 1 a prometer o registro,
já que agora existe registro de verdade.

**Termina no portão 2.**

---

## Fora do escopo desta fase

- `margem` e `lucro` dos anúncios antigos: só reimportando as duas abas da Shopee, à mão.
  Não tente resolver por código.
- Fase 7 (APIs de Mercado Livre e TikTok).
- Remoção do `js/custos.js`: conversa à parte.
