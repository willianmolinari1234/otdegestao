# Fase 7 — contas compartilhadas e identificação de anúncios

## Decisões confirmadas por Willian em 09/09/2026

- Cada especialista usa uma conta no marketplace com anúncios de vários clientes.
- Cada cliente mantém acesso e dashboard próprios; o especialista acessa os clientes no marketplace que opera.
- SKUs podem coincidir entre clientes. Nunca deduzir o proprietário somente pelo SKU.
- Identidade externa: marketplace + ID da conta vendedora + ID do anúncio.
- O proprietário vem de um vínculo explícito com um produto de um cliente.

## Primeira entrega: cadastro de vínculos (implementado, não publicado)

Tela administrativa: **Produtos → Identificar anúncios**.

1. Informar marketplace e ID oficial da conta vendedora.
2. Consultar os anúncios registrados ou registrar o ID oficial de um anúncio.
3. Um anúncio novo fica pendente, sem cliente e fora das projeções dos clientes.
4. Escolher cliente e produto disponível naquele marketplace, conferir o resumo e confirmar.
5. A listagem passa a mostrar o proprietário e o produto. Confirmações repetidas preservam a autoria; outro proprietário/produto é recusado.

Cadastro manual preparatório: não consulta as APIs dos marketplaces, não importa vendas,
não cria anúncios em listings e não altera produtos, custos, margem ou lucro.
O especialista continua com o acesso existente; a confirmação deste cadastro é do admin.

### Arquivos e contrato para a continuação

- `functions/vinculos-anuncios.js`: identidade determinística, registro, paginação,
  confirmação transacional e resolução do proprietário.
- `functions/index.js`: endpoint POST `gerenciarVinculosAnuncios`, ações `listar`,
  `registrar`, `vincular`; exige token válido e `employees/{uid}.role == admin`.
- `vinculos_anuncios/{sha256([mkt, contaId, itemId])}`: coleção privada, coberta pela
  negação padrão existente. Nenhuma alteração em `firestore.rules`.
- `js/08-produtos.js`: modal com escolha explícita de cliente/produto, resumo,
  paginação e mensagens de falha. Identidade da conta é invalidada ao editar campos.
- `testes/vinculos-anuncios.test.js` e `testes/regras/vinculos.test.mjs`.

Os futuros adaptadores devem registrar anúncios descobertos e chamar `resolver` antes
 de distribuir dados aos clientes. `resolver` valida novamente produto, proprietário e
marketplace. Vínculo ausente, cliente/produto removido ou produto transferido devolvem
`pendente`; não há fallback por SKU. Fazer a futura gravação da projeção com revalidação
transacional do vínculo/produto para impedir mudanças entre a resolução e a escrita.

## Validação realizada

- 205 testes gerais passando.
- 45 testes de emulador passando (28 anteriores + 17 desta entrega).
- Cobertura: SKU repetido, contas distintas, idempotência, paginação, autoria,
  produto alheio, marketplace incompatível, concorrência e vínculo invalidado.
- Cliente, especialista, equipe/admin e deslogado não conseguem ler/gravar a coleção
  diretamente. O admin usa o endpoint protegido.
- Fluxo da tela conferido em navegador com dados fictícios e respostas simuladas:
  consulta → registro pendente → escolha de cliente/produto → confirmação visível.
  Endpoint publicado não foi exercitado.
- `TESTAR-REGRAS.command` inclui os dois arquivos de testes e força idioma inglês
  somente no Java, contornando a falha do emulador com mensagens pt_BR.

## O que falta para integração automática

- Aplicativos e credenciais oficiais de Mercado Livre e TikTok; autorização da conta
  vendedora, renovação de tokens e armazenamento privado de credenciais.
- Adaptadores para descobrir anúncios e alimentar as pendências automaticamente.
- Projeções de anúncios/vendas por cliente a partir dos vínculos confirmados, com
  proteção contra duplicar anúncios previamente importados de planilha.
- Fluxo explícito de correção de vínculo confirmado, incluindo auditoria e tratamento
  dos dados já distribuídos; a primeira entrega bloqueia a troca.
- Publicação continua sendo decisão de Willian. Não houve publicação nesta sessão.

A validação pendente da fase 6 foi concluída nesta sessão anterior: 201 testes gerais
 e 28 testes de isolamento passaram; a publicação daquela fase segue sem confirmação.
