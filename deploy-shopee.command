#!/usr/bin/env bash
# OTDE — Deploy do backend (App 1). Dê dois cliques neste arquivo.
# (Na 1ª vez, se o macOS bloquear: clique com o botão direito -> Abrir.)

cd "$(dirname "$0")" || exit 1

echo "=========================================="
echo "   OTDE - Deploy do backend Shopee (App 1)"
echo "=========================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "!! Node.js nao encontrado. Instale em https://nodejs.org (LTS) e rode de novo."
  read -p "Enter para fechar..."; exit 1
fi
echo "Node: $(node -v)"

# Usa o Firebase CLI via npx (nao precisa instalar global nem senha de admin)
FB="npx --yes firebase-tools@latest"

echo ""
echo ">> Passo 1/4 - Login no Firebase (vai abrir o navegador; escolha sua conta)"
$FB login || { echo "!! Login falhou."; read -p "Enter para fechar..."; exit 1; }

echo ""
echo ">> Passo 2/4 - Instalando dependencias do backend"
( cd functions && npm install ) || { echo "!! npm install falhou."; read -p "Enter para fechar..."; exit 1; }

echo ""
echo ">> Passo 3/4 - Segredos provisorios (trocaremos pelos reais depois)"
for S in SHOPEE_PARTNER_ID SHOPEE_PARTNER_KEY SHOPEE_CALLBACK_URL; do
  if printf "0" | $FB functions:secrets:set "$S" --data-file=- --force >/dev/null 2>&1; then
    echo "   ok: $S"
  elif printf "0" | $FB functions:secrets:set "$S" >/dev/null 2>&1; then
    echo "   ok: $S"
  else
    echo "   (defina $S manualmente depois)"
  fi
done

echo ""
echo ">> Passo 4/4 - Deploy das Functions"
$FB deploy --only functions

echo ""
echo "=========================================="
echo " PRONTO. Procure acima a linha do 'shopeeCallback'"
echo " (Function URL: https://...cloudfunctions.net/shopeeCallback)"
echo " Copie essa URL e me mande no chat."
echo "=========================================="
read -p "Pressione Enter para fechar..."
