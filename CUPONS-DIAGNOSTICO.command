#!/bin/bash
# Descobre QUAL campo da Shopee identifica o "Cupom de prêmio do seguidor".
#
# O nome não serve: cada loja batiza o dela como quer (vimos um chamado
# "consultoria"). Este script baixa os cupons crus de uma loja e grava num
# arquivo, para comparar uma loja que TEM o prêmio com uma que não tem.
#
# A loja é escolhida numa lista, não digitada: o endpoint filtra pelo id do
# documento no Firestore, que não é o número que aparece na URL da Shopee.
#
# O token nunca é digitado nem vai parar no histórico do navegador: sai
# direto do functions/.env para dentro do curl.

cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "  Diagnóstico dos cupons — prêmio de seguidor"
echo "=================================================="
echo

PY3=$(command -v python3 || echo /usr/bin/python3)
BASE="https://us-central1-otdegestao.cloudfunctions.net"

TOKEN=$(grep -E '^SYNC_TOKEN=' functions/.env | head -1 | tr -d '\r' | sed -e 's/^SYNC_TOKEN=//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
if [ -z "$TOKEN" ]; then
  echo "❌ Não achei o SYNC_TOKEN em functions/.env. Sem ele o endpoint dá 403."
  echo; read -r -p "Enter para fechar..." _; exit 1
fi

mkdir -p _diagnostico
LISTA="_diagnostico/.lojas.json"

echo "Buscando as lojas conectadas..."
CODIGO=$(curl -s -w '%{http_code}' --max-time 60 "${BASE}/lojasConectadas?token=${TOKEN}" -o "$LISTA")
if [ "$CODIGO" != "200" ]; then
  echo "❌ Não consegui listar as lojas (HTTP $CODIGO)."
  [ "$CODIGO" = "403" ] && echo "   403 = token errado ou desatualizado no functions/.env."
  echo; read -r -p "Enter para fechar..." _; exit 1
fi

echo
"$PY3" - "$LISTA" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for i,l in enumerate(d.get("lojas",[]),1):
    print(f"  {i:>3}) {l.get('cliente')}   ·  shopId {l.get('shopId')}")
print(f"\n  ({d.get('total',0)} lojas conectadas)")
PY

echo
echo "Digite o NÚMERO da loja que TEM o cupom de prêmio de seguidor."
echo "(Enter em branco = amostra das 3 primeiras lojas)"
echo
read -r -p "Número: " N

LOJA=""
if [ -n "$N" ]; then
  LOJA=$("$PY3" - "$LISTA" "$N" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ls=d.get("lojas",[])
try: i=int(sys.argv[2])
except: sys.exit(0)
if 1<=i<=len(ls): print(ls[i-1].get("cliente",""))
PY
)
  if [ -z "$LOJA" ]; then
    echo "❌ Número fora da lista."
    echo; read -r -p "Enter para fechar..." _; exit 1
  fi
  echo "→ Loja escolhida: $LOJA"
fi

URL="${BASE}/amostraCupons?token=${TOKEN}"
[ -n "$LOJA" ] && URL="${URL}&cliente=${LOJA}"

SAIDA="_diagnostico/cupons-$(date +%Y%m%d-%H%M%S).json"
echo
echo "Baixando os cupons... (pode levar até 1 minuto)"
CODIGO=$(curl -s -w '%{http_code}' --max-time 280 "$URL" -o "$SAIDA")

echo
if [ "$CODIGO" = "200" ]; then
  echo "✅ Pronto: $SAIDA"
  echo
  "$PY3" - "$SAIDA" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
lojas=d.get("porLoja",[])
if not lojas:
    print("  ⚠️  Nenhuma loja voltou — o id não bateu, ou a loja não tem cupom ativo.")
for l in lojas:
    print(f"  - {l.get('cliente')} -> {l.get('quantos')} cupons ativos")
    for v in l.get("lista",[])[:20]:
        print("      ·", v.get("voucher_name"))
PY
  echo
  echo "Agora é só me avisar: eu leio o arquivo direto da pasta."
else
  echo "❌ A chamada falhou (HTTP $CODIGO). Resposta salva em $SAIDA"
fi

echo
read -r -p "Enter para fechar..." _
