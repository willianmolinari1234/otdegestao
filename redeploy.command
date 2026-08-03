#!/usr/bin/env bash
# OTDE — Republicar functions + dashboard + regras. De dois cliques.
cd "$(dirname "$0")" || exit 1
echo ">> Republicando functions, hosting e regras do Firestore..."
npx --yes firebase-tools@latest deploy --only functions,hosting,firestore:rules
echo ""
echo "=========================================="
echo " PRONTO."
echo " Abra o sistema e va no menu 'Integracoes'"
echo " para conectar as lojas voce mesmo."
echo "=========================================="
read -p "Pressione Enter para fechar..."
