#!/usr/bin/env bash
# OTDE — Publicar em HOMOLOGACAO (ambiente de teste). De dois cliques.
# NAO toca em producao: o projeto vai fixo no comando.
#
# Publica TELA + REGRAS. Nao publica o backend (functions) — veja o porque
# no final deste arquivo.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "  PUBLICANDO EM: otdegestao-homolog (TESTE)"
echo "=================================================="
echo ""

if grep -q "HOMOLOG_API_KEY" app.html; then
  echo "!! As chaves de homologacao ainda nao foram preenchidas."
  echo "   Rode primeiro: configurar-homolog.command"
  read -p "Enter para fechar..."; exit 1
fi

echo ">> Testes..."
if ! node --test testes/*.test.js > /tmp/otde-testes-h.log 2>&1; then
  echo "  !! TESTE FALHOU — nem em homologacao vale publicar codigo quebrado."
  grep -E "^not ok" /tmp/otde-testes-h.log | head -5
  read -p "Enter para fechar..."; exit 1
fi
echo "   OK — $(grep -c '^ok' /tmp/otde-testes-h.log) testes"

echo ">> Sintaxe do front..."
erro=0
for f in js/*.js; do
  node --check "$f" 2>/dev/null || { echo "  !! ERRO em $f"; erro=1; }
done
[ $erro -eq 1 ] && { echo "  Publicacao cancelada."; read -p "Enter..."; exit 1; }
echo "   OK"

echo ""
npx --yes firebase-tools@latest deploy --project otdegestao-homolog --only hosting,firestore:rules
CODIGO=$?

echo ""
echo "=================================================="
if [ $CODIGO -ne 0 ]; then
  echo " !! FALHOU. Leia o erro em vermelho acima."
  echo "    Homologacao nao foi atualizada."
else
  echo " PRONTO. Teste em:"
  echo "   https://otdegestao-homolog.web.app"
  echo ""
  echo " Deve aparecer uma tarja LARANJA de ambiente de teste."
  echo " Se estiver tudo certo, rode redeploy.command (PRODUCAO)."
fi
echo "=================================================="
read -p "Pressione Enter para fechar..."
exit $CODIGO

# --------------------------------------------------------------------
# POR QUE HOMOLOGACAO NAO TEM BACKEND (functions)
#
# O backend precisa da chave secreta da Shopee e das lojas autorizadas.
# As 26 lojas foram autorizadas no app de PRODUCAO da Shopee, e a URL de
# retorno esta registrada la. Um backend em homologacao ficaria sem
# nenhuma loja: rodaria a cada 5 minutos sem fazer nada, cobrando.
#
# Entao homologacao serve para testar TELA, CALCULOS e REGRAS — que e
# onde quase todo erro nosso apareceu. O banco e separado do de producao,
# entao da para mexer a vontade sem risco.
#
# Em homologacao os botoes de sincronizar avisam que estao desligados.
# --------------------------------------------------------------------
