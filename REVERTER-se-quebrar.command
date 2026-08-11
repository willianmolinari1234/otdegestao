#!/usr/bin/env bash
# OTDE — EMERGENCIA: volta o sistema para a versao anterior (arquivo unico)
# e republica na hora. Use se algo quebrar depois da divisao em modulos.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "  REVERTER PARA A VERSAO ANTERIOR"
echo "=================================================="
echo ""
echo "Isso volta o app.html para a versao de arquivo unico"
echo "(sem a divisao em modulos) e publica imediatamente."
echo ""
read -p "Confirmar? (s/n) " r
[ "$r" = "s" ] || { echo "cancelado."; read -p "Enter..."; exit 0; }

if [ ! -f backup-app-monolitico.html ]; then
  echo "!! Backup nao encontrado. Nada foi alterado."
  read -p "Enter..."; exit 1
fi

cp app.html app-modular-quebrado.html      # guarda a versao com problema
cp backup-app-monolitico.html app.html
echo ">> app.html revertido."

echo ">> Publicando..."
npx --yes firebase-tools@latest deploy --project otdegestao --only hosting

echo ""
echo "=================================================="
echo " REVERTIDO. https://otdegestao.web.app"
echo " A versao com problema ficou em app-modular-quebrado.html"
echo "=================================================="
read -p "Pressione Enter para fechar..."
