#!/bin/bash
# Backfill dos campos denormalizados de `products` e `listings`.
#
# custNome, storeNome, storeMkt e mkts[] derivam de custId e storeId — não da
# planilha. Anúncio antigo importado antes desses campos existirem fica sem
# eles, e a área do cliente mostra "—" no lugar do nome da loja.
#
# Este script recompõe SÓ o que está vazio. Nunca sobrescreve valor já
# gravado, e não encosta em margem, lucro, custo, preco, criadoPor nem
# criadoEm — backfill não é digitação.
#
# Modo padrão é DRY-RUN: mostra quantos documentos mudariam e não grava nada.
# Só grava com a flag  --gravar , e ainda assim pede confirmação.
#
#   ./BACKFILL-DENORMALIZADOS.command            (dry-run)
#   ./BACKFILL-DENORMALIZADOS.command --gravar   (grava, com confirmação)
#
# O token sai do functions/.env, nunca da URL do navegador.

cd "$(dirname "$0")" || exit 1
clear
echo "=================================================="
echo "  Backfill dos campos denormalizados"
echo "=================================================="
echo

PY3=$(command -v python3 || echo /usr/bin/python3)
BASE="https://us-central1-otdegestao.cloudfunctions.net"

GRAVAR=0
[ "$1" = "--gravar" ] && GRAVAR=1

TOKEN=$(grep -E '^SYNC_TOKEN=' functions/.env | head -1 | tr -d '\r' | sed -e 's/^SYNC_TOKEN=//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//')
if [ -z "$TOKEN" ]; then
  echo "❌ Não achei o SYNC_TOKEN em functions/.env. Sem ele o endpoint dá 403."
  echo; read -r -p "Enter para fechar..." _; exit 1
fi

URL="${BASE}/backfillDenormalizados?token=${TOKEN}"

if [ "$GRAVAR" = "1" ]; then
  echo "⚠️  Modo GRAVAR. Isto vai escrever no Firestore de PRODUÇÃO."
  echo "   Só preenche campo vazio — mas ainda assim, rode o dry-run antes"
  echo "   e leia o relatório."
  echo
  read -r -p "Digite  GRAVAR  para confirmar: " OK
  if [ "$OK" != "GRAVAR" ]; then
    echo "Cancelado. Nada foi gravado."
    echo; read -r -p "Enter para fechar..." _; exit 0
  fi
  URL="${URL}&gravar=1"
  echo
  echo "Gravando..."
else
  echo "Modo DRY-RUN — nada será gravado."
  echo
  echo "Consultando..."
fi

mkdir -p _diagnostico
SAIDA="_diagnostico/backfill-$(date +%Y%m%d-%H%M%S).json"
CODIGO=$(curl -s -w '%{http_code}' --max-time 540 "$URL" -o "$SAIDA")

echo
if [ "$CODIGO" != "200" ]; then
  echo "❌ A chamada falhou (HTTP $CODIGO). Resposta salva em $SAIDA"
  [ "$CODIGO" = "403" ] && echo "   403 = token errado ou desatualizado no functions/.env."
  [ "$CODIGO" = "404" ] && echo "   404 = o endpoint ainda não foi publicado (firebase deploy --only functions)."
  echo; read -r -p "Enter para fechar..." _; exit 1
fi

"$PY3" - "$SAIDA" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))

def campos(bloco):
    c = bloco.get("campos", {})
    return ", ".join(f"{k}={v}" for k, v in c.items()) or "—"

print(f"  Modo: {d.get('modo')}")
print()
print(f"  products : {d['products']['mudariam']} de {d['products']['total']} mudariam   [{campos(d['products'])}]")
print(f"  listings : {d['listings']['mudariam']} de {d['listings']['total']} mudariam   [{campos(d['listings'])}]")

print()
print("  ── Por proprietário ─────────────────────────────")
for r in d.get("porProprietario", []):
    print(f"    {r['nome'][:34]:<34}  products {r['products']:>4}   listings {r['listings']:>4}")
if not d.get("porProprietario"):
    print("    (nada a preencher)")

print()
print("  ── Por loja ─────────────────────────────────────")
for r in d.get("porLoja", []):
    print(f"    {r['nome'][:34]:<34}  {r.get('mkt',''):<10}  listings {r['listings']:>4}")
if not d.get("porLoja"):
    print("    (nada a preencher)")

orf = d.get("orfaos", [])
print()
print(f"  ── Órfãos ({len(orf)}) ─────────────────────────────────")
for o in orf[:200]:
    print(f"    {o['colecao']}/{o['id']}   {o['campo']} = {o['valor']}  (não achou cadastro)")
if len(orf) > 200:
    print(f"    ... e mais {len(orf) - 200}")
if not orf:
    print("    nenhum — toda referência achou cadastro")

print()
print("  ── Todas as lojas cadastradas ───────────────────")
for l in d.get("lojas", []):
    print(f"    {l['nome'][:38]:<38}  {l['mkt']:<12}  {l['id']}")
PY

echo
if [ "$GRAVAR" = "1" ]; then
  echo "✅ Backfill gravado. Rode o dry-run de novo: deve dar 0 mudariam."
else
  echo "Dry-run só. Para gravar:  ./BACKFILL-DENORMALIZADOS.command --gravar"
fi
echo "Relatório salvo em $SAIDA"
echo
read -r -p "Enter para fechar..." _
