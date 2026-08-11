#!/usr/bin/env bash
# OTDE — Publicar a dashboard + regras de seguranca do Firestore. De dois cliques.
cd "$(dirname "$0")" || exit 1
echo ">> Publicando a dashboard e as regras do Firestore..."
npx --yes firebase-tools@latest deploy --project otdegestao --only hosting,firestore:rules
echo ""
echo "=========================================="
echo " PRONTO."
echo "   Dashboard:  https://otdegestao.web.app"
echo "   Regras do Firestore aplicadas."
echo ""
echo " Agora, na tela de login, use 'Primeiro acesso?' com um"
echo " e-mail NOVO para criar a conta de administrador."
echo "=========================================="
read -p "Pressione Enter para fechar..."
