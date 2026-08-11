#!/usr/bin/env bash
# OTDE — Republicar em PRODUCAO. De dois cliques.
# Roda os testes e a verificacao de sintaxe ANTES. Se algo falhar, nao publica.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "  VERIFICANDO ANTES DE PUBLICAR"
echo "=================================================="
echo ""

echo ">> Testes das contas de dinheiro..."
if ! node --test testes/*.test.js > /tmp/otde-testes.log 2>&1; then
  echo ""
  echo "  !! TESTE FALHOU — publicacao cancelada."
  echo ""
  grep -E "^not ok|^# fail" /tmp/otde-testes.log | head -10
  echo ""
  echo "  Nada foi publicado. Producao segue como estava."
  read -p "Pressione Enter para fechar..."
  exit 1
fi
echo "   OK — $(grep -c '^ok' /tmp/otde-testes.log) testes passaram"

echo ">> Sintaxe do backend..."
if ! node --check functions/index.js 2>/tmp/otde-sintaxe.log; then
  echo "  !! ERRO DE SINTAXE no backend — publicacao cancelada."
  cat /tmp/otde-sintaxe.log
  read -p "Pressione Enter para fechar..."
  exit 1
fi
echo "   OK"

echo ">> Sintaxe do front..."
erro=0
for f in js/*.js; do
  if ! node --check "$f" 2>/dev/null; then echo "  !! ERRO em $f"; erro=1; fi
done
if [ $erro -eq 1 ]; then
  echo "  Publicacao cancelada."
  read -p "Pressione Enter para fechar..."
  exit 1
fi
echo "   OK — $(ls js/*.js | wc -l | tr -d ' ') arquivos"

echo ""
echo "=================================================="
echo "  PUBLICANDO EM: otdegestao (PRODUCAO)"
echo "=================================================="
# O projeto vai FIXO no comando. Sem isso, o deploy usaria o projeto ativo
# do firebase-tools — que pode ter ficado apontado para homologacao.
npx --yes firebase-tools@latest deploy --project otdegestao --only functions,hosting,firestore:rules

echo ""
echo "=================================================="
echo " PRONTO. https://otdegestao.web.app"
echo "=================================================="
read -p "Pressione Enter para fechar..."
