#!/usr/bin/env bash
# OTDE — Publicar do jeito certo: teste primeiro, produção depois.
#
# Por que este script existe: a homologação foi criada e ficou sem uso.
# Todas as publicações foram direto para produção, e um erro de cache
# derrubou a tela de importação num sistema que fatura de verdade.
# Agora o caminho seguro é o caminho padrão — não depende de lembrar.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "  PUBLICAR — teste primeiro, produção depois"
echo "=================================================="
echo ""

# ── 1. Verificações locais ────────────────────────────────────────────
echo ">> Testes..."
if ! node --test testes/*.test.js > /tmp/otde-t.log 2>&1; then
  echo "  !! TESTE FALHOU — nada foi publicado."
  grep -E "^not ok" /tmp/otde-t.log | head -5
  read -p "Enter para fechar..."; exit 1
fi
echo "   OK — $(grep -c '^ok' /tmp/otde-t.log) testes"

echo ">> Sintaxe..."
node --check functions/index.js || { echo "  !! backend"; read -p "Enter..."; exit 1; }
for f in js/*.js; do node --check "$f" || { echo "  !! $f"; read -p "Enter..."; exit 1; }; done
echo "   OK"

echo ">> Carimbo de versão..."
node ferramentas/carimbar-versao.js || { echo "  !! falhou"; read -p "Enter..."; exit 1; }

# ── 2. Homologação ────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo "  1 de 2 — AMBIENTE DE TESTE"
echo "=================================================="
npx --yes firebase-tools@latest deploy --project otdegestao-homolog --only hosting,firestore:rules
if [ $? -ne 0 ]; then
  echo ""
  echo "  !! Falhou em homologação. PRODUÇÃO NÃO FOI TOCADA."
  read -p "Enter para fechar..."; exit 1
fi

echo ""
echo "=================================================="
echo "  ABRA E CONFIRA:  https://otdegestao-homolog.web.app"
echo "=================================================="
echo ""
echo "  Olhe a tela que você mexeu. Abra o console do navegador"
echo "  (F12) e veja se não há erro em vermelho."
echo ""
echo "  Lembrete: homologação não tem backend da Shopee, então"
echo "  telas que dependem de venda aparecem vazias. Isso é normal."
echo ""
read -p "  Funcionou? Digite 's' para publicar em PRODUÇÃO: " ok
if [ "$ok" != "s" ] && [ "$ok" != "S" ]; then
  echo ""
  echo "  Parado. Produção segue como estava."
  read -p "Enter para fechar..."; exit 0
fi

# ── 3. Produção ───────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo "  2 de 2 — PRODUÇÃO"
echo "=================================================="
npx --yes firebase-tools@latest deploy --project otdegestao --only functions,hosting,firestore:rules
CODIGO=$?

echo ""
if [ $CODIGO -ne 0 ]; then
  echo " !! FALHOU EM PRODUÇÃO. Leia o erro acima."
else
  echo " PRONTO. https://otdegestao.web.app"
fi
read -p "Pressione Enter para fechar..."
exit $CODIGO
