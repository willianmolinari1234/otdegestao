#!/bin/bash
# Descobre se a Shopee deixa ver QUAIS anúncios estão fora de toda promoção.
#
# Hoje o sistema sabe se a loja TEM desconto no ar, não quantos anúncios estão
# dentro dele. Uma campanha cobrindo 3 de 200 anúncios conta como "tem".
#
# Este script pede à Shopee, para UMA loja: a lista de anúncios, os itens de
# cada campanha de desconto e os do "leve mais por menos". Se os três
# responderem, dá para montar a tela de anúncio descoberto. Se algum recusar,
# o erro dele vem no arquivo e a resposta é o escopo do app parceiro.
#
# O token nunca é digitado nem vai parar no histórico do navegador: sai
# direto do functions/.env para dentro do curl.

cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "  Cobertura por anúncio — o que a Shopee deixa ver"
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
echo "Digite o NÚMERO de uma loja com MUITOS anúncios — é nela que a"
echo "diferença entre 'tem desconto' e 'está coberta' aparece."
echo "(Enter em branco = a primeira loja da lista)"
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

URL="${BASE}/amostraCobertura?token=${TOKEN}"
[ -n "$LOJA" ] && URL="${URL}&cliente=${LOJA}"

SAIDA="_diagnostico/cobertura-$(date +%Y%m%d-%H%M%S).json"
echo
echo "Perguntando à Shopee... (pode levar até 1 minuto)"
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
    print("  ⚠️  Nenhuma loja voltou — o id não bateu.")
for l in lojas:
    print(f"  Loja: {l.get('cliente')}")
    print(f"    anúncios no ar ............ {l.get('totalAnuncios')}")
    print(f"    anúncios lidos nesta amostra {l.get('anunciosLidos')}")
    print(f"    campanhas encontradas ..... {len(l.get('campanhas') or [])}")
    print(f"    anúncios dentro de alguma . {l.get('cobertos')}")
    print(f"    anúncios fora de TODAS .... {l.get('foraDeTudo')}")
    erros=l.get("erros") or {}
    if erros:
        print("\n    ⚠️  A Shopee recusou:")
        for k,v in erros.items(): print(f"       · {k}: {v}")
        print("       → é escopo do app parceiro, não erro de código.")
print()
print("  ", d.get("oQueProcurar",""))
PY
  echo
  echo "Agora é só me avisar: eu leio o arquivo direto da pasta."
else
  echo "❌ A chamada falhou (HTTP $CODIGO). Resposta salva em $SAIDA"
fi

echo
read -r -p "Enter para fechar..." _
