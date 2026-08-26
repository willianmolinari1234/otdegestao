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
# O emulador do Firestore e um programa Java, e o macOS nao vem com Java.
#
# A pegadinha: o macOS TEM um /usr/bin/java falso. Ele existe, e executavel e
# esta no PATH — so que a unica coisa que ele faz e dizer "instale o Java".
# Entao perguntar "existe o comando java?" responde SIM numa maquina sem Java
# nenhum. A pergunta certa e se ele RODA.
temjava() { java -version >/dev/null 2>&1; }

if ! temjava; then
  # O resolvedor oficial da Apple sabe de JDKs que nao estao no PATH.
  JH=$(/usr/libexec/java_home 2>/dev/null)
  [ -n "$JH" ] && [ -x "$JH/bin/java" ] && export PATH="$JH/bin:$PATH"
fi

if ! temjava; then
  # O Homebrew instala o openjdk "keg-only": fora do PATH de proposito. Por
  # isso muita gente instala e continua vendo "Unable to locate a Java
  # Runtime" — esta instalado, so nao esta visivel.
  for P in /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk/bin \
           /Library/Java/JavaVirtualMachines/*/Contents/Home/bin; do
    if [ -x "$P/java" ]; then
      export PATH="$P:$PATH"
      temjava && break
    fi
  done
fi

if ! temjava; then
  echo "X  Falta o Java — o emulador do Firestore e um programa Java."
  echo "   (o /usr/bin/java que o macOS tem e so um aviso, nao roda nada)"
  echo
  if command -v brew >/dev/null 2>&1; then
    echo "   Voce tem Homebrew. Rode isto no Terminal e depois abra este"
    echo "   arquivo de novo:"
    echo
    echo "       brew install openjdk"
    echo
    echo "   Nao precisa de senha nem de configurar nada: este script acha"
    echo "   sozinho onde o Homebrew instalou."
  else
    echo "   Caminho mais curto, sem Terminal: baixe o instalador da Adoptium,"
    echo "   abra o .pkg e siga o instalador."
    echo
    echo "       https://adoptium.net/temurin/releases/?os=mac"
    echo
    echo "   Escolha JDK 21, pacote .pkg, e a arquitetura do seu Mac"
    echo "   (aarch64 para M1/M2/M3, x64 para Intel)."
  fi
  echo
  echo "   E uma vez so. Depois disso este teste roda sempre que voce quiser."
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
