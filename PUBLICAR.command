#!/usr/bin/env bash
# OTDE — Publicar do jeito certo: teste primeiro, produção depois.
#
# Por que este script existe: a homologação foi criada e ficou sem uso.
# Todas as publicações foram direto para produção, e um erro de cache
# derrubou a tela de importação num sistema que fatura de verdade.
# Agora o caminho seguro é o caminho padrão — não depende de lembrar.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo "  PUBLICAR — teste primeiro, produção depois"
echo "=================================================="
echo ""

# ── 1. Verificações locais ────────────────────────────────────────────
echo ">> Testes..."
if ! node --test testes/*.test.js > /tmp/otde-t.log 2>&1; then
  echo "  !! TESTE FALHOU — nada foi publicado."
  grep -E "^not ok" /tmp/otde-t.log | head -5
  read -p "Enter para fechar..."; exit 1
fi
echo "   OK — $(grep -c '^ok' /tmp/otde-t.log) testes"

echo ">> Sintaxe..."
node --check functions/index.js || { echo "  !! backend"; read -p "Enter..."; exit 1; }
for f in js/*.js; do node --check "$f" || { echo "  !! $f"; read -p "Enter..."; exit 1; }; done
echo "   OK"

echo ">> Carimbo de versão..."
# Guarda se o app.html JÁ estava alterado antes do carimbo. Se estava, o
# commit automático lá do fim não roda: ele levaria junto uma edição sua que
# não é carimbo, com uma mensagem dizendo que é. Melhor não commitar do que
# commitar mentindo o que mudou.
APPHTML_SUJO_ANTES=""
if command -v git > /dev/null 2>&1; then
  APPHTML_SUJO_ANTES=$(git status --porcelain -- app.html 2>/dev/null)
fi
node ferramentas/carimbar-versao.js || { echo "  !! falhou"; read -p "Enter..."; exit 1; }

# ── 2. Homologação ────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo "  1 de 2 — AMBIENTE DE TESTE"
echo "=================================================="
# O "< /dev/null" é precaução, não conserto de bug observado: impede que o
# firebase consuma a entrada do teclado e a pergunta logo abaixo receba vazio
# sem ninguém ter digitado. Nunca vimos isso acontecer aqui.
npx --yes firebase-tools@latest deploy --project otdegestao-homolog --only hosting,firestore:rules < /dev/null
if [ $? -ne 0 ]; then
  echo ""
  echo "  !! Falhou em homologação. PRODUÇÃO NÃO FOI TOCADA."
  read -p "Enter para fechar..."; exit 1
fi

echo ""
echo "=================================================="
echo "  ABRA E CONFIRA:  https://otdegestao-homolog.web.app"
echo "=================================================="
echo ""
echo "  Olhe a tela que você mexeu. Abra o console do navegador"
echo "  (F12) e veja se não há erro em vermelho."
echo ""
echo "  Lembrete: homologação não tem backend da Shopee, então"
echo "  telas que dependem de venda aparecem vazias. Isso é normal."
echo ""
read -p "  Funcionou? Digite 's' para publicar em PRODUÇÃO: " ok
if [ "$ok" != "s" ] && [ "$ok" != "S" ]; then
  echo ""
  echo "  Parado. Produção segue como estava."
  read -p "Enter para fechar..."; exit 0
fi

# ── 3. Produção ───────────────────────────────────────────────────────
echo ""
echo "=================================================="
echo "  2 de 2 — PRODUÇÃO"
echo "=================================================="
npx --yes firebase-tools@latest deploy --project otdegestao --only functions,hosting,firestore:rules
CODIGO=$?

echo ""
if [ $CODIGO -ne 0 ]; then
  echo " !! FALHOU EM PRODUÇÃO. Leia o erro acima."
else
  echo " PRONTO. https://otdegestao.web.app"

  # ── 4. Registrar no git o que foi publicado ─────────────────────────
  # Por que existe: o carimbo é escrito no app.html pelo próprio script, e
  # ficava só no disco. O resultado é o repositório ficar atrás do que está
  # no ar — foi assim que o clone do Windows e o origin/main passaram semanas
  # apontando para uma versão que não era a de produção. Publicar sem
  # registrar transforma o Mac no único lugar onde o código publicado existe.
  #
  # Commita SÓ o app.html: os arquivos que você editou são assunto seu, e
  # varrer tudo para dentro de um commit chamado "carimbo" esconde o trabalho
  # real no meio de duas linhas de hash.
  if command -v git > /dev/null 2>&1 && [ -z "$APPHTML_SUJO_ANTES" ] \
     && [ -n "$(git status --porcelain -- app.html 2>/dev/null)" ]; then
    echo ""
    echo ">> Registrando o carimbo no git..."
    if git add app.html && git commit -q -m "Carimbo de versao da publicacao" -- app.html; then
      echo "   commit feito."
      # O push pode falhar (sem rede, credencial expirada). Não é motivo para
      # a publicação parecer que deu errado: o que está no ar já está no ar.
      if git push -q origin HEAD 2>/dev/null; then
        echo "   enviado para o GitHub."
      else
        echo "   !! nao consegui enviar. Abra o GitHub Desktop e clique em Push origin."
      fi
    else
      echo "   !! nao consegui commitar. Faça pelo GitHub Desktop."
    fi
  elif [ -n "$APPHTML_SUJO_ANTES" ]; then
    echo ""
    echo " (o app.html já tinha alterações suas — commite pelo GitHub Desktop)"
  fi
fi
read -p "Pressione Enter para fechar..."
exit $CODIGO
