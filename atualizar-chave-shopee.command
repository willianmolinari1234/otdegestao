#!/usr/bin/env bash
# OTDE — Cadastrar a chave de PRODUCAO da Shopee e republicar. De dois cliques.

cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@latest"

echo "=================================================="
echo "  Cadastrar a LIVE API Partner Key (Shopee)"
echo "=================================================="
echo ""
echo "No console da Shopee (App OTDE Gestao), clique no olho ao lado de"
echo "'Live API Partner Key' e COPIE a chave."
echo ""
echo "Quando pedir o valor abaixo, COLE a chave e aperte Enter."
echo "A chave nao aparece na tela enquanto voce cola (e normal)."
echo ""
$FB functions:secrets:set SHOPEE_PARTNER_KEY || { echo "!! Falhou ao definir a chave."; read -p "Enter para fechar..."; exit 1; }

echo ""
echo ">> Republicando as functions com a chave e a config de PRODUCAO..."
$FB deploy --only functions

echo ""
echo "=================================================="
echo " PRONTO. Backend conectado a Shopee em PRODUCAO."
echo "   Live Partner ID: 2040453"
echo "   Host: https://partner.shopeemobile.com"
echo ""
echo " Me avise aqui que seguimos para autorizar uma loja real."
echo "=================================================="
read -p "Pressione Enter para fechar..."
