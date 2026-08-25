#!/bin/bash
# Descobre QUAL campo da Shopee identifica o "Cupom de prêmio do seguidor".
#
# O nome não serve: cada loja batiza o dela como quer (vimos um chamado
# "consultoria"). Este script baixa os cupons crus de algumas lojas e grava
# num arquivo, para comparar uma loja que TEM o prêmio com uma que não tem.
#
# O token nunca é digitado nem vai parar no histórico do navegador: sai
# direto do functions/.env para dentro do curl.

cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "  Diagnóstico dos cupons — prêmio de seguidor"
echo "=================================================="
echo

TOKEN=$(grep -E '^SYNC_TOKEN=' functions/.env | head -1 | tr -d '\r' | sed -e 's/^SYNC_TOKEN=//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
if [ -z "$TOKEN" ]; then
  echo "❌ Não achei o SYNC_TOKEN em functions/.env."
  echo "   Sem ele o endpoint responde 403."
  echo; read -r -p "Enter para fechar..." _; exit 1
fi

echo "Digite o ID da loja que TEM o cupom de prêmio de seguidor."
echo "(é o mesmo id de cliente/loja que o sistema usa)"
echo "Se não souber, deixe em branco: ele pega uma amostra de 3 lojas."
echo
read -r -p "Loja: " LOJA

URL="https://us-central1-otdegestao.cloudfunctions.net/amostraCupons?token=${TOKEN}"
[ -n "$LOJA" ] && URL="${URL}&cliente=${LOJA}"

mkdir -p _diagnostico
SAIDA="_diagnostico/cupons-$(date +%Y%m%d-%H%M%S).json"

echo
echo "Baixando... (pode levar até 1 minuto)"
CODIGO=$(curl -s -w '%{http_code}' --max-time 280 "$URL" -o "$SAIDA")

echo
if [ "$CODIGO" = "200" ]; then
  echo "✅ Pronto: $SAIDA"
  echo
  echo "Lojas e quantidade de cupons encontrados:"
  PY3=$(command -v python3 || echo /usr/bin/python3)
  "$PY3" - "$SAIDA" 2>/dev/null <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for l in d.get("porLoja",[]):
    print("  -", l.get("cliente"), "->", l.get("quantos"), "cupons ativos")
    for v in l.get("lista",[])[:20]:
        print("      ·", v.get("voucher_name"))
if not d.get("porLoja"): print("  (nenhuma loja voltou — confira o id)")
PY
  [ $? -ne 0 ] && echo "  (não consegui resumir aqui, mas o arquivo está salvo)"
  echo
  echo "Agora é só me avisar: eu leio o arquivo direto da pasta."
else
  echo "❌ A chamada falhou (HTTP $CODIGO)."
  [ "$CODIGO" = "403" ] && echo "   403 = token errado ou desatualizado no functions/.env."
  echo "   Resposta salva em $SAIDA"
fi

echo
read -r -p "Enter para fechar..." _
