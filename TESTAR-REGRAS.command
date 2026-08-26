#!/bin/bash
# Testes de isolamento das regras do Firestore.
#
# Responde UMA pergunta: um cliente consegue ver o dado de outro cliente?
# Enquanto a resposta não for "não", com teste, não se constrói tela nenhuma
# da área do cliente.
#
# Roda no emulador do Firestore — nada toca a base de produção. Precisa de
# Java (o emulador é um .jar) e de internet na primeira vez, para baixá-lo.

cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "  Regras do Firestore — testes de isolamento"
echo "=================================================="
echo

if ! command -v java >/dev/null 2>&1; then
  echo "❌ Java não encontrado, e o emulador do Firestore é um programa Java."
  echo "   Instale com:  brew install openjdk"
  echo; read -r -p "Enter para fechar..." _; exit 1
fi

if [ ! -d testes/regras/node_modules ]; then
  echo "Instalando a biblioteca de teste (só na primeira vez)..."
  (cd testes/regras && npm install --silent) || {
    echo "❌ npm install falhou."; echo; read -r -p "Enter para fechar..." _; exit 1; }
  echo
fi

# --project demo-... faz o emulador rodar isolado: ele recusa qualquer
# tentativa de falar com o Firebase de verdade.
npx --yes firebase-tools@latest emulators:exec \
  --only firestore --project demo-otde \
  "node --test testes/regras/regras.test.mjs"
CODIGO=$?

echo
if [ $CODIGO -eq 0 ]; then
  echo "✅ Isolamento confirmado. Pode construir a tela."
else
  echo "❌ Algum teste falhou — NÃO publique as regras assim."
fi
echo
read -r -p "Enter para fechar..." _
