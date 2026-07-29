#!/usr/bin/env bash
# OTDE — Republicar as functions (sem mexer na chave). Dê dois cliques.
cd "$(dirname "$0")" || exit 1
echo ">> Republicando as functions..."
npx --yes firebase-tools@latest deploy --only functions
echo ""
echo "PRONTO."
read -p "Pressione Enter para fechar..."
