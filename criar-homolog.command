#!/usr/bin/env bash
# OTDE — Criar o projeto de HOMOLOGACAO no Firebase (roda uma vez so).

cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@latest"
PROJ="otdegestao-homolog"

echo "=================================================="
echo "  CRIAR AMBIENTE DE HOMOLOGACAO"
echo "=================================================="
echo ""
echo "Isso cria um projeto Firebase SEPARADO, so para testes."
echo "Producao (otdegestao) nao e afetada em nada."
echo ""
read -p "Continuar? (s/n) " r
[ "$r" = "s" ] || { echo "cancelado."; read -p "Enter..."; exit 0; }

echo ""
echo ">> Criando o projeto..."
$FB projects:create "$PROJ" --display-name "OTDE Homologacao" || {
  echo ""
  echo "Se falhou por ja existir, tudo bem — seguindo."
}

echo ""
echo ">> Vinculando ao repositorio..."
$FB use --add --alias homolog "$PROJ" 2>/dev/null || $FB use homolog

echo ""
echo "=================================================="
echo " QUASE LA. Faltam 2 passos no console (uma vez so):"
echo ""
echo " 1) Ativar o plano Blaze no projeto de homologacao:"
echo "    https://console.firebase.google.com/project/$PROJ/usage/details"
echo "    (as Cloud Functions exigem Blaze — o custo fica em ~R\$ 0"
echo "     porque o ambiente quase nao roda)"
echo ""
echo " 2) Ativar Firestore e Authentication (e-mail/senha):"
echo "    https://console.firebase.google.com/project/$PROJ/firestore"
echo "    https://console.firebase.google.com/project/$PROJ/authentication"
echo ""
echo " Depois disso, use o publicar-homolog.command para testar."
echo "=================================================="
read -p "Pressione Enter para fechar..."
