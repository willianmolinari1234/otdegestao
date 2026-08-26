#!/bin/bash
# Testes de isolamento das regras do Firestore.
#
# Responde UMA pergunta: um cliente consegue ver o dado de outro cliente?
# Enquanto a resposta não for "não", com teste, não se constrói tela nenhuma
# da área do cliente.
#
# Roda no emulador do Firestore — nada toca a base de produção.

cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "  Regras do Firestore — testes de isolamento"
echo "=================================================="
echo

# ── Java ────────────────────────────────────────────────────────────────
# O emulador do Firestore é um programa Java, e o macOS não vem com Java.
# O Homebrew instala numa pasta que ele NÃO coloca no PATH ("keg-only"), o
# que faz o `java` continuar sumido mesmo depois de instalado. Por isso
# procuramos nos lugares conhecidos e ajustamos o PATH aqui dentro, em vez
# de pedir configuração de ambiente a quem só quer rodar um teste.
if ! command -v java >/dev/null 2>&1; then
  for P in /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk/bin \
           /Library/Java/JavaVirtualMachines/*/Contents/Home/bin; do
    [ -x "$P/java" ] && { export PATH="$P:$PATH"; break; }
  done
fi

if ! command -v java >/dev/null 2>&1; then
  echo "❌ Falta o Java — o emulador do Firestore é um programa Java."
  echo
  if command -v brew >/dev/null 2>&1; then
    echo "   Você tem Homebrew. Rode isto no Terminal e depois abra este"
    echo "   arquivo de novo:"
    echo
    echo "       brew install openjdk"
    echo
    echo "   Não precisa de senha nem de configurar nada: este script acha"
    echo "   sozinho onde o Homebrew instalou."
  else
    echo "   Caminho mais curto, sem Terminal: baixe o instalador da Adoptium,"
    echo "   abra o .pkg e siga o instalador."
    echo
    echo "       https://adoptium.net/temurin/releases/?os=mac"
    echo
    echo "   Escolha JDK 21, tipo de pacote .pkg, e a arquitetura do seu Mac"
    echo "   (aarch64 para M1/M2/M3, x64 para Intel)."
  fi
  echo
  echo "   É uma vez só. Depois disso este teste roda sempre que você quiser."
  echo
  read -r -p "Enter para fechar..." _
  exit 1
fi

echo "Java: $(java -version 2>&1 | head -1)"
echo

if [ ! -d testes/regras/node_modules ]; then
  echo "Instalando a biblioteca de teste (só na primeira vez)..."
  (cd testes/regras && npm install --silent) || {
    echo "❌ npm install falhou."; echo; read -r -p "Enter para fechar..." _; exit 1; }
  echo
fi

# --project demo-... roda isolado: o emulador recusa qualquer tentativa de
# falar com o Firebase de verdade.
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
