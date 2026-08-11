#!/usr/bin/env bash
# OTDE — Publicar em HOMOLOGAÇÃO (ambiente de teste). De dois cliques.
# Nao toca em producao. Use para testar antes de publicar de verdade.

cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@latest"

echo "=================================================="
echo "  PUBLICANDO EM HOMOLOGACAO (teste)"
echo "  Projeto: otdegestao-homolog"
echo "=================================================="
echo ""

$FB use homolog || { echo "!! Projeto de homologacao nao configurado."; echo "   Rode primeiro: criar-homolog.command"; read -p "Enter..."; exit 1; }
$FB deploy --only functions,hosting,firestore:rules

echo ""
$FB use producao >/dev/null 2>&1   # volta o padrao para nao publicar errado sem querer

echo "=================================================="
echo " PRONTO. Teste em:"
echo "   https://otdegestao-homolog.web.app"
echo ""
echo " Se estiver tudo certo, rode o redeploy.command"
echo " para publicar em PRODUCAO."
echo "=================================================="
read -p "Pressione Enter para fechar..."
