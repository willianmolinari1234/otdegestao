#!/usr/bin/env bash
# OTDE — Busca as chaves do projeto de homologacao e preenche no codigo.
# Roda uma vez, depois do Blaze ativado.

cd "$(dirname "$0")" || exit 1
FB="npx --yes firebase-tools@latest"
PROJ="otdegestao-homolog"

echo "=================================================="
echo "  CONFIGURAR AS CHAVES DE HOMOLOGACAO"
echo "=================================================="
echo ""

echo ">> Procurando o app web no projeto de teste..."
CFG=$($FB apps:sdkconfig WEB --project "$PROJ" --json 2>/dev/null)

if [ -z "$CFG" ] || echo "$CFG" | grep -q '"status": *"error"'; then
  echo "   Nenhum app web encontrado. Criando..."
  $FB apps:create WEB "OTDE Homologacao" --project "$PROJ" >/dev/null 2>&1
  sleep 3
  CFG=$($FB apps:sdkconfig WEB --project "$PROJ" --json 2>/dev/null)
fi

if [ -z "$CFG" ]; then
  echo ""
  echo "!! Nao consegui obter as chaves."
  echo "   Verifique se o Blaze esta ativo e se voce tem acesso ao projeto."
  read -p "Enter para fechar..."; exit 1
fi

echo "$CFG" > /tmp/otde-homolog-cfg.json
echo "   Chaves obtidas."

echo ""
echo ">> Preenchendo no codigo..."
node - <<'NODE'
const fs = require("fs");
const bruto = JSON.parse(fs.readFileSync("/tmp/otde-homolog-cfg.json", "utf8"));
const c = bruto.result?.sdkConfig || bruto.sdkConfig || bruto.result || bruto;
if (!c.apiKey) { console.error("   !! Config sem apiKey."); process.exit(1); }

const trocas = [
  ["HOMOLOG_API_KEY", c.apiKey],
  ["HOMOLOG_SENDER_ID", c.messagingSenderId],
  ["HOMOLOG_APP_ID", c.appId],
];
for (const arq of ["app.html", "relatorio-cliente.html"]) {
  let t = fs.readFileSync(arq, "utf8");
  let n = 0;
  for (const [de, para] of trocas) {
    const antes = t;
    t = t.split(de).join(para);
    if (t !== antes) n++;
  }
  fs.writeFileSync(arq, t);
  console.log(`   ${arq}: ${n} chave(s) preenchida(s)`);
}
NODE

echo ""
echo "=================================================="
echo " PRONTO. Agora rode: publicar-homolog.command"
echo "=================================================="
read -p "Pressione Enter para fechar..."
