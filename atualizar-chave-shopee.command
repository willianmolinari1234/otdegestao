#!/usr/bin/env bash
# OTDE — Cadastrar a chave secreta da Shopee e republicar. Dê dois cliques.

cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@latest"

echo "=========================================="
echo "  Cadastrar a Test API Partner Key (Shopee)"
echo "=========================================="
echo ""
echo "Quando pedir o valor, COLE a chave (Test API Partner Key) do App 1 e aperte Enter."
echo "A chave nao aparece na tela enquanto voce cola (e normal)."
echo ""
$FB functions:secrets:set SHOPEE_PARTNER_KEY || { echo "!! Falhou ao definir a chave."; read -p "Enter para fechar..."; exit 1; }

echo ""
echo ">> Republicando as functions com a chave e a config de teste..."
$FB deploy --only functions

echo ""
echo "=========================================="
echo " PRONTO. Backend conectado ao App 1 (Sandbox)."
echo " Me avise aqui que seguimos para conectar uma loja de teste."
echo "=========================================="
read -p "Pressione Enter para fechar..."
