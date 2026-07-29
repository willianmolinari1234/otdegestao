# OTDE — Backend (App 1: vendas + ferramentas)

Cloud Functions que conectam o sistema à Shopee (App 1, categoria "ERP System") e gravam os dados no Firestore. O relatório/dashboard só **lê** o Firestore — este backend é quem preenche.

> **Status:** código base pronto. Ainda **não** roda até: (1) habilitar o plano Blaze, (2) criar o App 1 na Shopee, (3) cadastrar os segredos abaixo.

## O que cada função faz

| Função | Tipo | O que faz |
|---|---|---|
| `shopeeAuthLink` | HTTP | Gera o link de autorização de uma loja. Abrir: `.../shopeeAuthLink?cliente=ID_DO_CLIENTE` |
| `shopeeCallback` | HTTP | Recebe o retorno da Shopee e salva os tokens em `shopee_auth/{cliente}` |
| `syncVendas` | Agendada (30 min) | Soma o faturamento do dia e grava em `sales/{cliente}_{data}` |
| `syncFerramentas` | Agendada (6 h) | Lista as promoções ativas e grava em `tools/{cliente}` |

## Pré-requisitos (uma vez)

1. **Plano Blaze** no Firebase (Console → Configurações de uso e faturamento → alterar para Blaze).
2. **Node 22** e **Firebase CLI**: `npm install -g firebase-tools` e `firebase login`.
3. **App 1 criado na Shopee** (categoria "ERP System"), com:
   - `partner_id` e a chave secreta (`partner_key`);
   - o domínio/URL de redirect apontando para a função `shopeeCallback` (a URL sai depois do primeiro deploy);
   - o IP de saída das Functions cadastrado na **IP Whitelist**.

## Passo a passo

```bash
cd functions
npm install

# 1) primeiro deploy (gera as URLs das funções HTTP)
firebase deploy --only functions

# 2) copie a URL de shopeeCallback que aparece no fim do deploy, ex.:
#    https://us-central1-otdegestao.cloudfunctions.net/shopeeCallback
#    -> cadastre-a como redirect no App 1 da Shopee

# 3) defina os segredos (a chave secreta nunca fica no código)
firebase functions:secrets:set SHOPEE_PARTNER_ID
firebase functions:secrets:set SHOPEE_PARTNER_KEY
firebase functions:secrets:set SHOPEE_CALLBACK_URL   # a URL do shopeeCallback

# 4) redeploy para aplicar os segredos
firebase deploy --only functions
```

## Conectar uma loja de cliente

Abra no navegador (uma vez por loja):

```
https://us-central1-otdegestao.cloudfunctions.net/shopeeAuthLink?cliente=ID_DO_CLIENTE
```

Faça o login/autorização na Shopee. Ao voltar, os tokens ficam salvos e os syncs passam a rodar sozinhos para aquela loja.

## Regras do Firestore (adicionar)

```
match /sales/{id}        { allow read: if request.auth != null; allow write: if false; }
match /tools/{id}         { allow read: if request.auth != null; allow write: if false; }
match /shopee_auth/{id}   { allow read, write: if false; }   // só o backend (Admin SDK)
```

As Functions usam o Admin SDK e ignoram essas regras; o `write: if false` impede escrita pelo navegador.

## Pontos a confirmar com a API real

Os nomes de alguns campos de resposta (ex.: `total_amount`, listas de promoção) seguem a doc v2, mas devem ser conferidos na **"API List"** do App 1 e nos retornos reais do Sandbox — estão marcados com comentários no código.
