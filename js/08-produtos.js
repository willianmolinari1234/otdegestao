// ─── IMPORTAR A PLANILHA DO CLIENTE ───────────────────────────────────
//
// Uma aba da planilha é uma LOJA. Por isso a importação começa na linha da
// loja, e não numa tela genérica: assim o sistema já sabe de quem é o produto
// (o proprietário da loja), em qual loja o anúncio está e de qual marketplace
// ele deveria ser — sem ter que adivinhar nada pelo nome da aba, que muda de
// cliente para cliente.
//
// O produto é do PROPRIETÁRIO, o anúncio é da LOJA. É essa separação que faz
// as três lojas da mesma pessoa mostrarem um produto só, com três preços.

const PL_MAX_LISTA = 200;   // teto de linhas desenhadas por seção

// Os ids previsíveis vivem no módulo, junto do resto da regra e dos testes.
const plIdProduto = (custId, chave) => window.planilha.idDoProduto(custId, chave);
const plIdAnuncio = (lojaId, anuncioId, chave) => window.planilha.idDoAnuncioNaLoja(lojaId, anuncioId, chave);

const plMoeda = (n) => (n === null || n === undefined) ? "—"
  : "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let plEstado = null;   // { loja, cust, leitura, existentes, escolhas }

function abrirImportacaoPlanilha(lojaId) {
  const loja = clis.find((c) => c.id === lojaId);
  if (!loja) return;
  const cust = loja.custId ? getCust(loja.custId) : null;
  if (!cust) {
    showToast("Esta loja não tem proprietário vinculado. O produto precisa de dono.", "error");
    return;
  }
  plEstado = { loja, cust, leitura: null, existentes: [], escolhas: {} };
  plDesenharColar();
}

function plDesenharColar() {
  const { loja, cust } = plEstado;
  showFormModal(`
  <div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
      <div style="min-width:0"><div style="font-size:15px;font-weight:800;color:#14151A">Importar planilha · ${esc(loja.name)}</div></div>
      <button id="pl-close" style="background:none;border:none;color:#8E8B84;font-size:18px;cursor:pointer;flex-shrink:0">✕</button>
    </div>
      <div style="background:#FBFAF7;border:1px solid #E7E4DD;border-radius:11px;padding:12px 15px;margin-bottom:14px;font-size:12.5px;color:#5C584F;line-height:1.6">
        Os produtos entram para <b>${esc(cust.name)}</b>, e os anúncios para a loja
        <b>${esc(loja.name)}</b> (${esc(loja.mkt || "sem marketplace")}).
        Cole <b>uma aba</b> — a da loja ${esc(loja.name)} — com o cabeçalho junto.
      </div>
      <textarea id="pl-colado" class="finput" rows="9" placeholder="Selecione a aba inteira no Google Sheets ou no Excel (inclusive a linha de cabeçalho), copie e cole aqui." style="resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px"></textarea>
      <div class="form-actions" style="margin-top:16px">
        <button id="pl-cancel" class="btn-sm">Cancelar</button>
        <button id="pl-ler" class="btn-primary">Ler planilha</button>
      </div>

      <div style="margin-top:18px;padding-top:16px;border-top:1px solid #F4F1EA">
        <div style="font-size:12.5px;color:#5C584F;line-height:1.6;margin-bottom:10px">
          <b>SKU vem do marketplace, não da planilha.</b> O código cadastrado no
          anúncio já chega junto com cada venda — isto só costura com os anúncios
          que você importou. Nenhuma chamada nova à Shopee.
        </div>
        <button id="pl-sku" class="btn-sm">🏷️ Puxar SKU do marketplace</button>
      </div>
    </div>`);
  setTimeout(() => {
    document.getElementById("pl-close").onclick = document.getElementById("pl-cancel").onclick = closeFormModal;
    document.getElementById("pl-ler").onclick = plLer;
    document.getElementById("pl-sku").onclick = plPuxarSku;
  }, 0);
}

async function plLer() {
  const el = document.getElementById("pl-colado");
  const texto = el ? el.value : "";
  if (!texto.trim()) { showToast("Cole a aba da planilha primeiro.", "error"); return; }
  const botao = document.getElementById("pl-ler");
  botao.disabled = true; botao.textContent = "Lendo...";
  try {
    const leitura = window.planilha.lerAba(texto, plEstado.loja.mkt || "");
    if (leitura.ehLink) {
      showToast("Isso é o endereço da planilha. Abra, selecione as células e cole o conteúdo.", "error");
      botao.disabled = false; botao.textContent = "Ler planilha"; return;
    }
    if (!leitura.produtos.length && !leitura.conflitos.length && !leitura.semIdentidade.length) {
      showToast("Não achei produto nenhum. Confira se a linha de cabeçalho veio junto.", "error");
      botao.disabled = false; botao.textContent = "Ler planilha"; return;
    }
    // Produtos que este proprietário já tem: é aqui que aparece o custo que
    // diverge ENTRE abas — dentro de uma aba só ele nunca apareceria.
    plEstado.existentes = await plCarregarExistentes(plEstado.cust.id);
    plEstado.leitura = leitura;
    plEstado.escolhas = {};
    plDesenharConferencia();
  } catch (e) {
    showToast("Erro ao ler: " + (e.message || ""), "error");
    botao.disabled = false; botao.textContent = "Ler planilha";
  }
}

async function plCarregarExistentes(custId) {
  try {
    const q = window.fb.query(window.fb.collection(window.fb.db, "products"),
      window.fb.where("custId", "==", custId));
    const snap = await window.fb.getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("products:", e);
    return [];
  }
}

/** Conflitos de custo entre o que está sendo colado e o que já existe. */
function plConflitosComExistente() {
  const porId = new Map(plEstado.existentes.map((p) => [p.id, p]));
  const out = [];
  for (const p of plEstado.leitura.produtos) {
    if (p.custo === null) continue;
    const antigo = porId.get(plIdProduto(plEstado.cust.id, p.chave));
    if (!antigo || antigo.custo === undefined || antigo.custo === null) continue;
    if (Math.abs(Number(antigo.custo) - p.custo) < 0.005) continue;
    out.push({ chave: p.chave, nome: p.nome, campo: "custo", valores: [Number(antigo.custo), p.custo], entreAbas: true });
  }
  return out;
}

function plDesenharConferencia() {
  const { leitura, loja, cust } = plEstado;
  const conflitos = leitura.conflitos.concat(plConflitosComExistente());
  const chavesEmConflito = new Set(conflitos.map((c) => c.chave));
  const entram = leitura.produtos.filter((p) => !chavesEmConflito.has(p.chave));
  const anuncios = entram.reduce((a, p) => a + p.anuncios.length, 0);
  const foraDoMkt = entram.filter((p) => p.avisos.some((a) => a.tipo === "linkDeOutroMarketplace"));

  const cartao = (cor, fundo, borda, n, rot) => `
    <div style="background:${fundo};border:1px solid ${borda};border-radius:11px;padding:11px 14px;flex:1;min-width:120px">
      <div style="font-size:22px;font-weight:700;color:${cor};line-height:1.1">${n}</div>
      <div style="font-size:11.5px;color:#6B6A66;margin-top:2px">${rot}</div>
    </div>`;

  const linhaProduto = (p) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #F4F1EA">
        <div style="font-weight:600;font-size:13px">${esc(p.nome)}</div>
        <div style="font-size:11px;color:#8E8B84">${p.sku ? "SKU " + esc(p.sku) : "identificado pelo nome"}</div>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #F4F1EA;font-size:13px;white-space:nowrap">${plMoeda(p.custo)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #F4F1EA;font-size:12.5px">
        ${p.anuncios.map((a) => `<span style="display:inline-block;background:#FBFAF7;border:1px solid #E7E4DD;border-radius:7px;padding:2px 8px;margin:1px 3px 1px 0;${a.foraDoMarketplace ? "border-color:#fca5a5;background:#fef2f2;color:#b91c1c" : ""}">${plMoeda(a.preco)}${a.foraDoMarketplace ? " · " + esc(a.mkt) : ""}</span>`).join("") || "<span style='color:#C9C4B8'>sem anúncio</span>"}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #F4F1EA;font-size:11.5px;color:#8E8B84">${p.fotos ? "📁 fotos" : ""}${p.fotos && p.peso ? " · " : ""}${p.peso ? "peso" : ""}</td>
    </tr>`;

  const blocoConflito = (c, i) => `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:11px;padding:12px 15px;margin-bottom:8px">
      <div style="font-weight:600;font-size:13px;margin-bottom:2px">${esc(c.nome || c.chave)}</div>
      <div style="font-size:12px;color:#92400e;margin-bottom:9px">Custo diferente ${c.entreAbas ? "do que já está no sistema" : "entre as linhas desta aba"}. Qual é o certo?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.valores.map((v, j) => `<label style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid #E7E4DD;border-radius:9px;padding:7px 13px;font-size:13px;cursor:pointer">
          <input type="radio" name="pl-cf-${i}" data-cf="${esc(c.chave)}" value="${v}" ${j === 0 ? "" : ""} style="margin:0;accent-color:#B8872B"/>${plMoeda(v)}
        </label>`).join("")}
        <label style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid #E7E4DD;border-radius:9px;padding:7px 13px;font-size:13px;cursor:pointer;color:#6B6A66">
          <input type="radio" name="pl-cf-${i}" data-cf="${esc(c.chave)}" value="" checked style="margin:0;accent-color:#8E8B84"/>deixar de fora
        </label>
      </div>
    </div>`;

  showFormModal(`
  <div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
      <div style="min-width:0"><div style="font-size:15px;font-weight:800;color:#14151A">Conferir antes de importar · ${esc(loja.name)}</div></div>
      <button id="pl-close" style="background:none;border:none;color:#8E8B84;font-size:18px;cursor:pointer;flex-shrink:0">✕</button>
    </div>
      <div style="display:flex;gap:9px;margin-bottom:16px;flex-wrap:wrap">
        ${cartao("#16a34a", "#f0fdf4", "#bbf7d0", entram.length, "produtos entram")}
        ${cartao("#14151A", "#FBFAF7", "#E7E4DD", anuncios, "anúncios")}
        ${cartao(conflitos.length ? "#8A6420" : "#8E8B84", "#fffbeb", "#fde68a", conflitos.length, "em conflito")}
        ${cartao(leitura.semIdentidade.length ? "#b91c1c" : "#8E8B84", "#fef2f2", "#fecaca", leitura.semIdentidade.length, "não consegui ler")}
      </div>

      <div style="font-size:11.5px;color:#8E8B84;margin-bottom:16px;line-height:1.6">
        ${leitura.vazias} linha(s) de fórmula vazia ignoradas · anúncios por marketplace:
        ${Object.entries(leitura.porMarketplace).map(([k, v]) => `${esc(k)} ${v}`).join(" · ") || "—"}
      </div>

      ${foraDoMkt.length ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-left:3px solid #dc2626;border-radius:11px;padding:12px 15px;margin-bottom:14px">
        <div style="font-weight:700;font-size:12.5px;color:#991b1b;margin-bottom:3px">${foraDoMkt.length} link(s) apontam para outro marketplace</div>
        <div style="font-size:12.5px;color:#b91c1c;line-height:1.55">Esta aba é da loja ${esc(loja.name)}, de ${esc(loja.mkt || "?")}. Os anúncios marcados em vermelho abaixo levam para outro lugar. Eles entram assim mesmo — só corrija a planilha depois, porque o preço deles pode não ser o preço desta loja.</div>
      </div>` : ""}

      ${conflitos.length ? `<div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:9px">Conflitos de custo</div>
        ${conflitos.slice(0, PL_MAX_LISTA).map(blocoConflito).join("")}` : ""}

      ${leitura.semIdentidade.length ? `<div style="font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 9px">Linhas que ficaram de fora</div>
        <div style="background:#fff;border:1px solid #fecaca;border-radius:11px;padding:4px 0;max-height:170px;overflow:auto">
        ${leitura.semIdentidade.slice(0, PL_MAX_LISTA).map((s) => `<div style="padding:6px 14px;font-size:12px;border-bottom:1px solid #fef2f2">
            <span style="color:#8E8B84">linha ${s.linha}</span> · <span style="color:#b91c1c">${esc(s.motivo)}</span>
            <div style="color:#6B6A66;font-family:ui-monospace,Menlo,monospace;font-size:11px;margin-top:2px">${esc(s.conteudo)}</div>
          </div>`).join("")}
        </div>` : ""}

      <div style="font-size:11px;font-weight:700;color:#5C584F;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 9px">Vão entrar</div>
      <div style="border:1px solid #E7E4DD;border-radius:11px;overflow:auto;max-height:300px">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#FBFAF7;position:sticky;top:0">
            <tr>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6A66">Produto</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6A66">Custo</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6A66">Anúncios nesta loja</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6B6A66"></th>
            </tr>
          </thead>
          <tbody>${entram.slice(0, PL_MAX_LISTA).map(linhaProduto).join("")}</tbody>
        </table>
      </div>

      <div class="form-actions" style="margin-top:18px">
        <button id="pl-voltar" class="btn-sm">Voltar</button>
        <button id="pl-importar" class="btn-primary">Importar ${entram.length} produto(s)</button>
      </div>
    </div>`);

  setTimeout(() => {
    document.getElementById("pl-close").onclick = closeFormModal;
    document.getElementById("pl-voltar").onclick = plDesenharColar;
    document.querySelectorAll("#form-modal-content [data-cf]").forEach((r) => {
      r.onchange = () => { plEstado.escolhas[r.dataset.cf] = r.value === "" ? null : Number(r.value); };
    });
    document.getElementById("pl-importar").onclick = () => plImportar(entram, conflitos);
  }, 0);
}

async function plImportar(entram, conflitos) {
  const { loja, cust } = plEstado;
  const botao = document.getElementById("pl-importar");
  botao.disabled = true; botao.textContent = "Importando...";
  try {
    // Conflito resolvido na tela entra com o custo escolhido; sem escolha,
    // fica de fora. Nunca se escolhe sozinho: errar aqui estraga o lucro em
    // silêncio, que é o problema que a checagem existe para evitar.
    const resolvidos = [];
    for (const c of conflitos) {
      const escolhido = plEstado.escolhas[c.chave];
      if (escolhido === null || escolhido === undefined) continue;
      const p = plEstado.leitura.produtos.find((x) => x.chave === c.chave);
      if (p) resolvidos.push({ ...p, custo: escolhido });
    }
    const lista = entram.concat(resolvidos);
    const mkts = mktsDoCliente(cust);
    const agora = new Date().toISOString();
    let batch = window.fb.writeBatch(window.fb.db), n = 0;
    const solta = async () => { if (n) { await batch.commit(); batch = window.fb.writeBatch(window.fb.db); n = 0; } };

    for (const p of lista) {
      const idProduto = plIdProduto(cust.id, p.chave);
      // custNome viaja junto: a tela do especialista lista produtos de vários
      // clientes e precisa dizer de quem é cada um — e ela não pode ler a
      // coleção customers, onde há dado que não é para sair daqui.
      const doc = { id: idProduto, custId: cust.id, custNome: cust.name || "", chave: p.chave,
        nome: p.nome, mkts, origem: "planilha", atualizadoEm: agora, atualizadoPor: currentUser.id };
      if (p.sku) doc.sku = p.sku;
      if (p.custo !== null) doc.custo = p.custo;
      // Campo vazio não sobrescreve: numa planilha real o peso vem em 3 de 25
      // linhas, e reimportar apagaria o que a outra aba tinha trazido.
      for (const campo of ["peso", "medidas", "tamanhos", "cores", "material", "fotos"]) {
        if (p[campo]) doc[campo] = p[campo];
      }
      batch.set(window.fb.doc(window.fb.db, "products", idProduto), doc, { merge: true });
      n++;
      if (n >= 400) await solta();

      for (const a of p.anuncios) {
        const idAnuncio = plIdAnuncio(loja.id, a.id, p.chave);
        batch.set(window.fb.doc(window.fb.db, "listings", idAnuncio), {
          id: idAnuncio, custId: cust.id, custNome: cust.name || "", produtoId: idProduto, chave: p.chave,
          // Cópia dos marketplaces do produto: é por ela que a regra deixa o
          // especialista ver o preço de referência sem ter que ler o produto.
          mkts,
          mkt: a.mkt || loja.mkt || "", storeId: loja.id, itemId: a.id || "",
          // Nome e marketplace da loja copiados para dentro do anúncio: a área
          // do cliente precisa dizer "está na Reana Tricot" e NÃO pode ler a
          // coleção clients, onde mora a senha da loja. Copiar dois campos
          // evita uma projeção inteira só para mostrar um nome.
          storeNome: loja.name || "", storeMkt: loja.mkt || "",
          preco: a.preco === null ? null : a.preco, link: a.link || "",
          // Vindos da planilha, já com as taxas daquela loja descontadas.
          lucro: a.lucro === null || a.lucro === undefined ? null : a.lucro,
          margem: a.margem === null || a.margem === undefined ? null : a.margem,
          atualizadoEm: agora,
        }, { merge: true });
        n++;
        if (n >= 400) await solta();
      }
    }
    await solta();
    closeFormModal();
    showToast(`${lista.length} produto(s) importado(s) para ${cust.name}`);
  } catch (e) {
    console.error("importar:", e);
    showToast("Erro ao importar: " + (e.message || ""), "error");
    botao.disabled = false; botao.textContent = "Importar";
  }
}


/**
 * Puxa o SKU do marketplace para os anúncios já importados desta loja.
 *
 * Duas passadas de propósito: a primeira só conta e mostra, a segunda grava.
 * Ver antes de gravar é a regra da casa, e aqui ela paga: se o cliente não
 * preenche SKU no anúncio, não há o que puxar — e é melhor descobrir isso num
 * relatório do que numa base meio preenchida.
 */
async function plPuxarSku() {
  const botao = document.getElementById("pl-sku");
  const antes = botao.textContent;
  botao.disabled = true; botao.textContent = "Consultando...";
  try {
    const tk = await window.fb.auth.currentUser.getIdToken();
    const r = await fetch(`${FN_BASE}/skusDoMarketplace?loja=${encodeURIComponent(plEstado.loja.id)}`,
      { method: "POST", headers: { Authorization: "Bearer " + tk } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "falha");
    plMostrarSku(j);
  } catch (e) {
    showToast("Erro ao consultar SKU: " + (e.message || ""), "error");
  } finally {
    botao.disabled = false; botao.textContent = antes;
  }
}

function plMostrarSku(j) {
  const { loja } = plEstado;
  const lista = (titulo, itens, cor) => !itens.length ? "" : `
    <div style="font-size:11px;font-weight:700;color:${cor};text-transform:uppercase;letter-spacing:.5px;margin:14px 0 7px">${titulo}</div>
    <div style="border:1px solid #E7E4DD;border-radius:10px;max-height:150px;overflow:auto">
      ${itens.map((x) => `<div style="padding:6px 12px;font-size:12px;border-bottom:1px solid #FBFAF7">
        <span style="font-family:ui-monospace,Menlo,monospace;color:#5C584F">${esc(x.sku || x.itemId || "—")}</span>
        <span style="color:#8E8B84"> · ${esc(x.chave || x.nome || "")}</span>
      </div>`).join("")}
    </div>`;

  showFormModal(`
  <div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
      <div style="min-width:0"><div style="font-size:15px;font-weight:800;color:#14151A">SKU do marketplace · ${esc(loja.name)}</div></div>
      <button id="pl-close" style="background:none;border:none;color:#8E8B84;font-size:18px;cursor:pointer;flex-shrink:0">✕</button>
    </div>
      <div style="background:#FBFAF7;border:1px solid #E7E4DD;border-radius:11px;padding:13px 16px;margin-bottom:6px;font-size:13px;color:#14151A;line-height:1.6">
        ${esc(j.veredito)}
      </div>
      <div style="font-size:11.5px;color:#8E8B84;line-height:1.7;margin-bottom:4px">
        ${j.lidos.diasDeVenda} dia(s) de venda lidos · ${j.lidos.itens} item(ns) ·
        ${j.anunciosImportados} anúncio(s) importado(s) nesta loja
      </div>

      ${lista("Vão receber SKU", j.amostra.casados, "#16a34a")}
      ${j.semSku ? `<div style="margin-top:14px;font-size:12.5px;color:#8A6420;line-height:1.6">
        ${j.semSku} anúncio(s) venderam mas <b>não têm SKU preenchido no marketplace</b>. Não há o que puxar para eles — o campo está vazio no próprio anúncio.
      </div>` : ""}
      ${j.semVenda ? `<div style="margin-top:10px;font-size:12.5px;color:#8E8B84;line-height:1.6">
        ${j.semVenda} anúncio(s) importado(s) ainda não venderam nada no período sincronizado, então o marketplace não me contou o SKU deles.
      </div>` : ""}

      <div class="form-actions" style="margin-top:18px">
        <button id="pl-voltar" class="btn-sm">Voltar</button>
        <button id="pl-gravar" class="btn-primary"${j.casados ? "" : " disabled"}>Gravar ${j.casados} SKU(s)</button>
      </div>
    </div>`);
  setTimeout(() => {
    document.getElementById("pl-close").onclick = closeFormModal;
    document.getElementById("pl-voltar").onclick = plDesenharColar;
    document.getElementById("pl-gravar").onclick = plGravarSku;
  }, 0);
}

async function plGravarSku() {
  const botao = document.getElementById("pl-gravar");
  botao.disabled = true; botao.textContent = "Gravando...";
  try {
    const tk = await window.fb.auth.currentUser.getIdToken();
    const r = await fetch(`${FN_BASE}/skusDoMarketplace?loja=${encodeURIComponent(plEstado.loja.id)}&aplicar=1`,
      { method: "POST", headers: { Authorization: "Bearer " + tk } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "falha");
    closeFormModal();
    showToast(`${j.gravados} anúncio(s) e ${j.produtos} produto(s) com SKU do marketplace`);
  } catch (e) {
    showToast("Erro ao gravar: " + (e.message || ""), "error");
    botao.disabled = false; botao.textContent = "Gravar";
  }
}


// ─── ACESSO DO CLIENTE AO SISTEMA ─────────────────────────────────────
//
// Não confundir com o 🔑 do lado: aquele guarda a senha do cliente NO
// MARKETPLACE, para a equipe operar a loja. Este cria a conta com que o
// próprio cliente entra aqui — coisa que até agora não existia.
//
// A senha vai para o backend e some: quem grava é o Admin SDK, e o navegador
// nunca guarda nem relê. Por isso ela é mostrada uma vez e só.

async function abrirAcessoDoCliente(custId) {
  const cust = getCust(custId);
  if (!cust) return;
  let contas = [];
  try {
    const q = window.fb.query(window.fb.collection(window.fb.db, "accounts"),
      window.fb.where("custId", "==", custId));
    contas = (await window.fb.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("accounts:", e); }

  const jaTem = contas.length > 0;
  showFormModal(`
  <div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
      <div style="min-width:0"><div style="font-size:15px;font-weight:800;color:#14151A">Acesso ao sistema · ${esc(cust.name)}</div></div>
      <button id="ac-close" style="background:none;border:none;color:#8E8B84;font-size:18px;cursor:pointer;flex-shrink:0">✕</button>
    </div>
      <div style="background:#FBFAF7;border:1px solid #E7E4DD;border-radius:11px;padding:12px 15px;margin-bottom:16px;font-size:12.5px;color:#5C584F;line-height:1.6">
        Esta é a conta com que <b>o próprio cliente</b> entra no sistema e vê os
        produtos dele. Não é a senha da loja no marketplace — essa fica no 🔑.
      </div>

      ${jaTem ? contas.map((c) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:11px;padding:13px 16px;margin-bottom:10px">
          <div style="min-width:0">
            <div style="font-weight:600;font-size:13px">${esc(c.nome || "sem nome")}</div>
            <div style="font-size:12px;color:#166534;overflow:hidden;text-overflow:ellipsis">${esc(c.email || "")}</div>
          </div>
          <button data-remac="${esc(c.id)}" class="btn-sm" style="color:#b91c1c;white-space:nowrap">Remover acesso</button>
        </div>`).join("") : `
        <div style="font-size:12.5px;color:#8E8B84;margin-bottom:14px">Nenhum acesso criado ainda.</div>`}

      <div style="border-top:1px solid #F4F1EA;margin-top:14px;padding-top:16px">
        <div style="font-size:11px;font-weight:700;color:#5C584F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px">${jaTem ? "Criar outro acesso" : "Criar o acesso"}</div>
        <div class="form-row">
          <div class="form-group"><label>Nome de quem vai entrar</label><input id="ac-nome" class="finput" value="${esc(cust.name)}"/></div>
          <div class="form-group"><label>E-mail</label><input id="ac-email" class="finput" type="email" placeholder="cliente@exemplo.com"/></div>
        </div>
        <div class="form-group" style="margin-top:10px">
          <label>Senha inicial (mínimo 8)</label>
          <div style="display:flex;gap:6px">
            <input id="ac-senha" class="finput" style="flex:1" placeholder="Ele troca depois, por 'Esqueci minha senha'"/>
            <button id="ac-gerar" type="button" class="btn-sm" style="white-space:nowrap">Gerar</button>
          </div>
          <div style="font-size:11.5px;color:#8E8B84;margin-top:6px;line-height:1.5">Anote agora e mande para o cliente: depois de salvar, nem eu nem você conseguimos ler essa senha de novo.</div>
        </div>
      </div>

      <div class="form-actions" style="margin-top:18px">
        <button id="ac-cancel" class="btn-sm">Fechar</button>
        <button id="ac-criar" class="btn-primary">Criar acesso</button>
      </div>
    </div>`);

  setTimeout(() => {
    document.getElementById("ac-close").onclick = document.getElementById("ac-cancel").onclick = closeFormModal;
    document.getElementById("ac-gerar").onclick = () => {
      const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const n = new Uint32Array(12); crypto.getRandomValues(n);
      const senha = [...n].map((x) => abc[x % abc.length]).join("");
      const campo = document.getElementById("ac-senha");
      campo.value = senha; campo.select();
    };
    document.getElementById("ac-criar").onclick = () => acCriar(custId);
    document.querySelectorAll("#form-modal-content [data-remac]").forEach((b) => {
      b.onclick = () => askConfirm("Remover acesso",
        "O cliente perde o login imediatamente. Os produtos e anúncios dele continuam aqui. Continuar?",
        () => acRemover(b.dataset.remac, custId));
    });
  }, 0);
}

async function acCriar(custId) {
  const v = (id) => (document.getElementById(id) || {}).value || "";
  const nome = v("ac-nome").trim(), email = v("ac-email").trim().toLowerCase(), senha = v("ac-senha");
  if (!nome || !email || !senha) { showToast("Preencha nome, e-mail e senha.", "error"); return; }
  if (senha.length < 8) { showToast("A senha precisa de pelo menos 8 caracteres.", "error"); return; }
  const botao = document.getElementById("ac-criar");
  botao.disabled = true; botao.textContent = "Criando...";
  try {
    const tk = await window.fb.auth.currentUser.getIdToken();
    const r = await fetch(`${FN_BASE}/criarAcesso`, {
      method: "POST",
      headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha, papel: "cliente", custId }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "falha");
    closeFormModal();
    showToast("Acesso criado. Mande o e-mail e a senha para o cliente.");
  } catch (e) {
    showToast("Erro: " + (e.message || ""), "error");
    botao.disabled = false; botao.textContent = "Criar acesso";
  }
}

async function acRemover(uid, custId) {
  try {
    const tk = await window.fb.auth.currentUser.getIdToken();
    const r = await fetch(`${FN_BASE}/removerAcesso?uid=${encodeURIComponent(uid)}`,
      { method: "POST", headers: { Authorization: "Bearer " + tk } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "falha");
    showToast("Acesso removido");
    abrirAcessoDoCliente(custId);
  } catch (e) {
    showToast("Erro: " + (e.message || ""), "error");
  }
}


// ─── ACESSO DOS ESPECIALISTAS ─────────────────────────────────────────
//
// Conta de especialista não pertence a nenhum cliente: ela pertence a um
// MARKETPLACE. Por isso não fica no painel de proprietários junto do 👤 do
// cliente — ficaria pendurada num dono qualquer, e a primeira pessoa a
// procurar não acharia. Fica na tela de Produtos, que é onde o assunto vive.

async function abrirAcessoEspecialistas() {
  let contas = [];
  try {
    const q = window.fb.query(window.fb.collection(window.fb.db, "accounts"),
      window.fb.where("papel", "==", "especialista"));
    contas = (await window.fb.getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error("accounts:", e); }

  const opcoes = MKTS.filter((m) => m !== "Shopee");
  showFormModal(`
  <div class="form-panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px">
      <div>
        <div style="font-size:15px;font-weight:800;color:#14151A">🤝 Especialistas</div>
        <div style="font-size:11.5px;color:#6B6A66;margin-top:2px">Um acesso por marketplace, para os parceiros</div>
      </div>
      <button id="es-close" style="background:none;border:none;color:#8E8B84;font-size:18px;cursor:pointer">✕</button>
    </div>
    <div style="background:#FBFAF7;border:1px solid #E7E4DD;border-radius:11px;padding:12px 15px;margin-bottom:16px;font-size:12.5px;color:#5C584F;line-height:1.6">
      O especialista vê os produtos dos clientes que operam no marketplace dele,
      com o custo para precificar, e registra o anúncio que criou. Não enxerga
      nada seu nem de cliente fora do marketplace dele.
    </div>

    ${contas.length ? contas.map((c) => {
      const st = mktStyle(c.mkt);
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border:1px solid #E7E4DD;border-radius:11px;padding:12px 15px;margin-bottom:9px">
        <div style="min-width:0">
          <span style="display:inline-block;background:${st.bg};color:${st.fg};border:1px solid ${st.border};border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700">${esc(c.mkt || "?")}</span>
          <div style="font-weight:600;font-size:13px;margin-top:5px">${esc(c.nome || "sem nome")}</div>
          <div style="font-size:12px;color:#6B6A66;overflow:hidden;text-overflow:ellipsis">${esc(c.email || "")}</div>
        </div>
        <button data-remesp="${esc(c.id)}" class="btn-sm" style="color:#b91c1c;white-space:nowrap">Remover</button>
      </div>`;
    }).join("") : `<div style="font-size:12.5px;color:#8E8B84;margin-bottom:14px">Nenhum especialista cadastrado ainda.</div>`}

    <div style="border-top:1px solid #F4F1EA;margin-top:14px;padding-top:16px">
      <div style="font-size:11px;font-weight:700;color:#5C584F;text-transform:uppercase;letter-spacing:.5px;margin-bottom:11px">Novo acesso</div>
      <div class="form-row">
        <div class="form-group"><label>Marketplace</label>
          <select id="es-mkt" class="finput">${opcoes.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}</select>
        </div>
        <div class="form-group"><label>Nome do parceiro</label><input id="es-nome" class="finput" placeholder="Quem cuida desse marketplace"/></div>
      </div>
      <div class="form-row" style="margin-top:10px">
        <div class="form-group"><label>E-mail</label><input id="es-email" class="finput" type="email" placeholder="parceiro@exemplo.com"/></div>
        <div class="form-group"><label>Senha inicial (mínimo 8)</label>
          <div style="display:flex;gap:6px">
            <input id="es-senha" class="finput" style="flex:1"/>
            <button id="es-gerar" type="button" class="btn-sm" style="white-space:nowrap">Gerar</button>
          </div>
        </div>
      </div>
      <div style="font-size:11.5px;color:#8E8B84;margin-top:8px;line-height:1.5">Anote a senha agora: depois de salvar, ninguém consegue lê-la de novo.</div>
    </div>

    <div class="form-actions" style="margin-top:16px">
      <button id="es-cancel" class="btn-sm">Fechar</button>
      <button id="es-criar" class="btn-primary">Criar acesso</button>
    </div>
  </div>`);

  setTimeout(() => {
    document.getElementById("es-close").onclick = document.getElementById("es-cancel").onclick = closeFormModal;
    document.getElementById("es-gerar").onclick = () => {
      const abc = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const n = new Uint32Array(12); crypto.getRandomValues(n);
      const campo = document.getElementById("es-senha");
      campo.value = [...n].map((x) => abc[x % abc.length]).join(""); campo.select();
    };
    document.getElementById("es-criar").onclick = esCriar;
    document.querySelectorAll("#form-modal-content [data-remesp]").forEach((b) => {
      b.onclick = () => askConfirm("Remover especialista",
        "Ele perde o acesso imediatamente. Os anúncios que registrou continuam aqui. Continuar?",
        async () => {
          try {
            const tk = await window.fb.auth.currentUser.getIdToken();
            const r = await fetch(`${FN_BASE}/removerAcesso?uid=${encodeURIComponent(b.dataset.remesp)}`,
              { method: "POST", headers: { Authorization: "Bearer " + tk } });
            const j = await r.json();
            if (!r.ok) throw new Error(j.erro || "falha");
            showToast("Acesso removido");
            abrirAcessoEspecialistas();
          } catch (e) { showToast("Erro: " + (e.message || ""), "error"); }
        });
    });
  }, 0);
}

async function esCriar() {
  const v = (id) => (document.getElementById(id) || {}).value || "";
  const nome = v("es-nome").trim(), email = v("es-email").trim().toLowerCase(), senha = v("es-senha"), mkt = v("es-mkt");
  if (!nome || !email || !senha) { showToast("Preencha nome, e-mail e senha.", "error"); return; }
  if (senha.length < 8) { showToast("A senha precisa de pelo menos 8 caracteres.", "error"); return; }
  const b = document.getElementById("es-criar");
  b.disabled = true; b.textContent = "Criando...";
  try {
    const tk = await window.fb.auth.currentUser.getIdToken();
    const r = await fetch(`${FN_BASE}/criarAcesso`, {
      method: "POST",
      headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha, papel: "especialista", mkt }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || "falha");
    showToast(`Acesso de ${mkt} criado. Mande o e-mail e a senha para o parceiro.`);
    abrirAcessoEspecialistas();
  } catch (e) {
    showToast("Erro: " + (e.message || ""), "error");
    b.disabled = false; b.textContent = "Criar acesso";
  }
}

// ─── IDENTIFICAR ANÚNCIOS EM CONTAS COMPARTILHADAS ────────────────────
async function vaChamar(acao, dados) {
  const token = await window.fb.auth.currentUser.getIdToken();
  const r = await fetch(`${FN_BASE}/gerenciarVinculosAnuncios`, {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ ...dados, acao }),
  });
  let resposta;
  try { resposta = await r.json(); }
  catch { throw new Error("A identificação de anúncios ainda não está disponível. Confira se a atualização foi publicada."); }
  if (!r.ok) throw new Error(resposta.erro || "Não foi possível concluir. Tente novamente.");
  return resposta;
}
function abrirVinculosAnuncios() {
  showFormModal(`<div class="form-panel" id="va-painel">
    <h3>Identificar anúncios</h3>
    <p style="font-size:13px;color:#5C584F">Escolha a conta compartilhada para consultar ou registrar anúncios. O cliente será identificado por um vínculo confirmado, mesmo que o SKU se repita.</p>
    <p style="font-size:12px;color:#6B6A66">Este cadastro prepara os vínculos. A sincronização automática dos marketplaces ainda não está conectada.</p>
    <div class="form-group"><label for="va-mkt">Marketplace</label><select class="finput" id="va-mkt"><option>Mercado Livre</option><option>TikTok</option></select></div>
    <div class="form-group"><label for="va-conta">ID da conta no marketplace</label><input class="finput" id="va-conta" maxlength="160" placeholder="Identificador da conta vendedora, não o e-mail" /></div>
    <div class="form-actions"><button class="btn-sm" id="va-fechar">Fechar</button><button class="btn-primary" id="va-consultar">Consultar conta</button></div>
    <div id="va-conteudo" style="margin-top:18px"></div>
    <p id="va-erro" role="alert" style="color:#b91c1c;font-size:13px"></p>
  </div>`);
  const painel = document.getElementById("va-painel");
  const el = id => painel.querySelector("#va-" + id);
  let conta = null, itens = [], depois = null;
  const erro = e => { if (painel.isConnected) el("erro").textContent = e.message; };
  const tarefa = async (botao, fn) => {
    botao.disabled = true; el("erro").textContent = "";
    try { await fn(); } catch (e) { erro(e); } finally { botao.disabled = false; }
  };
  el("fechar").onclick = closeFormModal;
  const invalidar = () => { conta = null; itens = []; depois = null; el("conteudo").innerHTML = ""; };
  el("mkt").onchange = invalidar;
  el("conta").oninput = invalidar;
  const carregar = async (mais = false) => {
    const contexto = conta;
    const resposta = await vaChamar("listar", { ...contexto, depois: mais ? depois : null });
    if (!painel.isConnected || conta !== contexto) return;
    itens = mais ? itens.concat(resposta.itens) : resposta.itens;
    depois = resposta.depois;
    desenhar();
  };
  el("consultar").onclick = () => tarefa(el("consultar"), async () => {
    conta = { mkt: el("mkt").value, contaId: el("conta").value.trim() };
    el("conteudo").innerHTML = "";
    await carregar();
  });
  function desenhar() {
    el("conteudo").innerHTML = `
      <div class="form-group"><label for="va-item">ID do anúncio nesta conta</label><input class="finput" id="va-item" maxlength="160" placeholder="Identificador do anúncio, não o SKU" /></div>
      <button id="va-registrar" class="btn-sm">Registrar anúncio pendente</button>
      <p style="font-size:12px;color:#6B6A66">Anúncios pendentes ficam fora dos painéis dos clientes. Registrar novamente o mesmo anúncio preserva seu vínculo.</p>
      <div>${itens.length ? itens.map((x, i) => `<div style="border-top:1px solid #E7E4DD;padding:12px 0">
        <strong>${esc(x.itemId)}</strong> · ${x.status === "confirmado" ? `Confirmado: ${esc(x.custNome)} · ${esc(x.produtoNome)}` : '<span style="color:#92400e">Pendente de identificação</span>'}
        ${x.status === "confirmado" ? "" : `<button class="btn-sm" data-va-escolher="${i}">Identificar cliente</button>`}
      </div>`).join("") : '<p>Nenhum anúncio registrado nesta conta.</p>'}</div>
      ${depois ? '<button class="btn-sm" id="va-mais">Carregar mais</button>' : ""}
      <div id="va-escolha"></div>`;
    el("registrar").onclick = () => tarefa(el("registrar"), async () => {
      const contexto = conta;
      await vaChamar("registrar", { ...contexto, itemId: el("item").value.trim() });
      if (painel.isConnected && conta === contexto) await carregar();
    });
    if (el("mais")) el("mais").onclick = () => tarefa(el("mais"), () => carregar(true));
    painel.querySelectorAll("[data-va-escolher]").forEach(b => {
      b.onclick = () => escolher(itens[Number(b.dataset.vaEscolher)]);
    });
  }
  function escolher(anuncio) {
    const contexto = conta;
    const destino = el("escolha");
    destino.innerHTML = `<h4>Identificar anúncio ${esc(anuncio.itemId)}</h4>
      <div class="form-group"><label for="va-cliente">Cliente proprietário</label><select class="finput" id="va-cliente"><option value="">Selecione o cliente</option>${custs.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</select></div>
      <div class="form-group"><label for="va-produto">Produto deste cliente</label><select class="finput" id="va-produto" disabled><option value="">Selecione o cliente primeiro</option></select></div>
      <p id="va-resumo" style="font-size:13px"></p><button class="btn-primary" id="va-confirmar" disabled>Confirmar vínculo</button>`;
    const clienteEl = el("cliente"), produtoEl = el("produto"), confirmar = el("confirmar"), resumo = el("resumo");
    let produtos = [];
    clienteEl.onchange = async () => {
      const custId = clienteEl.value;
      confirmar.disabled = true; produtoEl.disabled = true; resumo.textContent = "";
      produtoEl.innerHTML = '<option value="">Carregando produtos…</option>';
      try {
        const consulta = custId ? await window.fb.getDocs(window.fb.query(
          window.fb.collection(window.fb.db, "products"), window.fb.where("custId", "==", custId))) : null;
        const todos = consulta ? consulta.docs.map(d => ({ ...d.data(), id: d.id })) : [];
        if (!clienteEl.isConnected || clienteEl.value !== custId || conta !== contexto) return;
        produtos = todos.filter(p => Array.isArray(p.mkts) && p.mkts.includes(contexto.mkt));
        produtoEl.innerHTML = '<option value="">Selecione o produto</option>' + produtos.map(p => `<option value="${esc(p.id)}">${esc(p.nome || p.id)} · SKU ${esc(p.sku || "sem SKU")}</option>`).join("");
        produtoEl.disabled = !produtos.length;
        if (!produtos.length) resumo.textContent = "Este cliente não tem produtos disponíveis neste marketplace.";
      } catch (e) { erro(e); produtoEl.innerHTML = '<option value="">Não foi possível carregar os produtos</option>'; }
    };
    produtoEl.onchange = () => {
      const produto = produtos.find(p => p.id === produtoEl.value);
      confirmar.disabled = !produto;
      resumo.textContent = produto ? `Confirmar: ${contexto.mkt}, conta ${contexto.contaId}, anúncio ${anuncio.itemId} pertence a ${getCust(clienteEl.value)?.name || clienteEl.value}, produto ${produto.nome || produto.id}.` : "";
    };
    confirmar.onclick = () => tarefa(confirmar, async () => {
      const custId = clienteEl.value, produtoId = produtoEl.value;
      clienteEl.disabled = true; produtoEl.disabled = true;
      try {
        await vaChamar("vincular", { ...contexto, itemId: anuncio.itemId, custId, produtoId });
        if (painel.isConnected && conta === contexto) { showToast("Vínculo confirmado."); await carregar(); }
      } finally { clienteEl.disabled = false; produtoEl.disabled = !produtos.length; }
    });
  }
}

// ─── CONFERIR AS CONTAS DE MARGEM ─────────────────────────────────────
//
// A planilha do cliente traz margem e lucro já com tudo descontado. O sistema
// agora calcula os mesmos números a partir das taxas. Enquanto os dois não
// baterem, é o cálculo que está errado — e um cálculo errado de margem não
// quebra tela nenhuma, só mostra um número bonito e falso.
//
// Esta tela põe os dois lado a lado, com os dados REAIS de produção. É a única
// prova que vale: nenhum teste sabe quanto a planilha descontou de verdade.
async function conferirMargens() {
  showFormModal(`<div class="form-panel" id="cm-painel" style="max-width:900px">
    <h3>Conferir as contas de margem</h3>
    <p style="font-size:13px;color:#5C584F">Comparando a margem que veio da planilha com a que o sistema calcula pelas taxas. Onde os dois divergirem, falta alguma coisa na conta.</p>
    <div id="cm-corpo" style="margin-top:16px;font-size:13px;color:#6B6A66">Carregando…</div>
    <div class="form-actions"><button class="btn-sm" id="cm-fechar">Fechar</button></div>
  </div>`);
  const painel = document.getElementById("cm-painel");
  painel.querySelector("#cm-fechar").onclick = () => closeFormModal();
  const corpo = painel.querySelector("#cm-corpo");

  // A conferência mais forte não é contra a planilha: é contra o que a Shopee
  // COBROU. A sincronização guarda isso em `sales` (comissao + taxaServico,
  // da API financeira dela), então dá para perguntar, com dado de produção,
  // se a tabela de taxas está no lugar certo.
  const conferirTabela = async () => {
    try {
      const snap = await window.fb.getDocs(window.fb.query(
        window.fb.collection(window.fb.db, "sales"),
        window.fb.orderBy("data", "desc"), window.fb.limit(120)));
      const dias = snap.docs.map((d) => d.data());
      const r = window.taxas.conferirTabelaShopee(dias);
      if (!r) return `<div style="font-size:12.5px;color:#8E8B84;margin-bottom:14px">Ainda não há vendas com detalhe de item para conferir a tabela da Shopee.</div>`;
      const perto = Math.abs(r.diferenca) <= 1.5;
      const cor = perto ? "#15803d" : Math.abs(r.diferenca) <= 4 ? "#8A6420" : "#b91c1c";
      const fundo = perto ? "#f0fdf4" : Math.abs(r.diferenca) <= 4 ? "#fffbeb" : "#fef2f7";
      const borda = perto ? "#bbf7d0" : Math.abs(r.diferenca) <= 4 ? "#fde68a" : "#fecaca";
      return `
      <div style="background:${fundo};border:1px solid ${borda};border-radius:10px;padding:13px 15px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:800;color:${cor};margin-bottom:7px">A tabela da Shopee bate com o que ela cobrou?</div>
        <div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:#4A463D">
          <span>A Shopee cobrou <b>${plMoeda(r.real)}</b> (${String(r.pctReal).replace(".", ",")}% do faturamento)</span>
          <span>A tabela previa <b>${plMoeda(r.estimado)}</b> (${String(r.pctEstimado).replace(".", ",")}%)</span>
          <span style="color:${cor};font-weight:700">diferença ${r.diferenca > 0 ? "+" : ""}${String(r.diferenca).replace(".", ",")} pontos</span>
        </div>
        <div style="font-size:11.5px;color:#6B6A66;margin-top:7px;line-height:1.55">
          ${perto
            ? "A tabela está certa. O que a margem estima para a Shopee pode ser usado com confiança."
            : r.diferenca > 0
              ? "A tabela desconta <b>mais</b> do que a Shopee cobra: a margem estimada está saindo mais baixa que a real."
              : "A tabela desconta <b>menos</b> do que a Shopee cobra: a margem estimada está saindo mais alta que a real, e é a que engana."}
          Base: ${r.dias} dia(s) de venda, ${r.unidades} unidades, ${plMoeda(r.gmv)} faturados.${r.semFaixa ? ` ${r.semFaixa} unidade(s) ficaram fora de qualquer faixa.` : ""}
        </div>
      </div>`;
    } catch (e) {
      console.error("conferirTabela:", e);
      return "";
    }
  };

  try {
    corpo.innerHTML = await conferirTabela() + `<div style="font-size:13px;color:#6B6A66">Comparando com a planilha…</div>`;
    const cabecalho = corpo.innerHTML.replace(/<div style="font-size:13px;color:#6B6A66">Comparando[\s\S]*$/, "");

    // Só os anúncios que têm margem da planilha: são os únicos com gabarito.
    const snap = await window.fb.getDocs(window.fb.query(
      window.fb.collection(window.fb.db, "listings"), window.fb.limit(400)));
    const anuncios = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.margem !== null && a.margem !== undefined && a.preco);
    if (!anuncios.length) {
      corpo.innerHTML = cabecalho + `<div style="color:#8E8B84">Nenhum anúncio com margem da planilha para comparar.</div>`;
      return;
    }

    // Os produtos daqueles anúncios, para ter custo e peso.
    const ids = [...new Set(anuncios.map((a) => a.produtoId).filter(Boolean))];
    const prods = new Map();
    for (const id of ids.slice(0, 200)) {
      const d = await window.fb.getDoc(window.fb.doc(window.fb.db, "products", id));
      if (d.exists()) prods.set(id, d.data());
    }

    const linhas = [];
    for (const a of anuncios) {
      const p = prods.get(a.produtoId);
      if (!p || p.custo === undefined || p.custo === null) continue;
      const loja = clis.find((c) => c.id === a.storeId);
      const dono = custs.find((c) => c.id === a.custId);
      const pcts = window.taxas.percentuaisDaLoja(loja, dono);
      const r = window.taxas.calcularMargem({
        preco: Number(a.preco), custo: Number(p.custo), peso: p.peso,
        mkt: a.mkt || a.storeMkt, ...pcts,
      });
      linhas.push({ a, p, r, real: Number(a.margem), pcts,
        dif: r.margem === null ? null : Math.abs(r.margem - Number(a.margem)) });
    }
    if (!linhas.length) {
      corpo.innerHTML = cabecalho + `<div style="color:#8E8B84">Nenhum anúncio com margem E custo para comparar.</div>`;
      return;
    }

    // Maior divergência primeiro: é ali que está o que falta na conta.
    linhas.sort((x, y) => (y.dif ?? -1) - (x.dif ?? -1));
    const perto = linhas.filter((l) => l.dif !== null && l.dif <= 1).length;
    const mediana = (() => {
      const ok = linhas.filter((l) => l.dif !== null).map((l) => l.dif).sort((x, y) => x - y);
      return ok.length ? ok[Math.floor(ok.length / 2)] : null;
    })();

    corpo.innerHTML = cabecalho + `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
        <div class="card" style="padding:11px 14px;flex:1;min-width:150px">
          <div style="font-size:11px;color:#6B6A66;text-transform:uppercase;letter-spacing:.4px">Comparados</div>
          <div style="font-size:19px;font-weight:800">${linhas.length}</div></div>
        <div class="card" style="padding:11px 14px;flex:1;min-width:150px">
          <div style="font-size:11px;color:#6B6A66;text-transform:uppercase;letter-spacing:.4px">Batendo (até 1 ponto)</div>
          <div style="font-size:19px;font-weight:800;color:${perto === linhas.length ? "#3b6d11" : "#8A6420"}">${perto}</div></div>
        <div class="card" style="padding:11px 14px;flex:1;min-width:150px">
          <div style="font-size:11px;color:#6B6A66;text-transform:uppercase;letter-spacing:.4px">Diferença típica</div>
          <div style="font-size:19px;font-weight:800">${mediana === null ? "—" : mediana.toFixed(1).replace(".", ",") + " pts"}</div></div>
      </div>
      ${perto === linhas.length ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:9px;padding:10px 13px;margin-bottom:12px;font-size:12.5px">A conta bate com a planilha. O cálculo pode ser usado onde não há margem gravada.</div>`
        : `<div style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:9px;padding:10px 13px;margin-bottom:12px;font-size:12.5px"><b>Ainda falta alguma coisa na conta.</b> Olhe as maiores diferenças abaixo: se a estimativa sobra sempre mais que a planilha, há um desconto que o sistema não conhece.</div>`}
      <div style="max-height:340px;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead style="background:#FBFAF7;position:sticky;top:0"><tr>
          <th style="text-align:left;padding:7px 9px">Produto</th>
          <th style="text-align:left;padding:7px 9px">Loja</th>
          <th style="text-align:right;padding:7px 9px">Preço</th>
          <th style="text-align:right;padding:7px 9px">Planilha</th>
          <th style="text-align:right;padding:7px 9px">Sistema</th>
          <th style="text-align:right;padding:7px 9px">Diferença</th>
        </tr></thead>
        <tbody>${linhas.slice(0, 60).map((l) => {
          const c = l.dif === null ? "#8E8B84" : l.dif <= 1 ? "#3b6d11" : l.dif <= 5 ? "#8A6420" : "#b91c1c";
          const detalhe = l.r.falta.length ? "falta " + l.r.falta.join(", ")
            : l.r.descontos.map((d) => `${d.rotulo} -${plMoeda(d.valor)}`).join(" | ");
          return `<tr title="${esc(detalhe)}">
            <td style="padding:7px 9px">${esc(l.p.nome || l.a.sku || "—")}</td>
            <td style="padding:7px 9px;color:#6B6A66">${esc(l.a.storeNome || "—")}</td>
            <td style="padding:7px 9px;text-align:right">${plMoeda(l.a.preco)}</td>
            <td style="padding:7px 9px;text-align:right;font-weight:600">${l.real.toFixed(1).replace(".", ",")}%</td>
            <td style="padding:7px 9px;text-align:right;font-weight:600">${l.r.margem === null ? "—" : l.r.margem.toFixed(1).replace(".", ",") + "%"}</td>
            <td style="padding:7px 9px;text-align:right;font-weight:700;color:${c}">${l.dif === null ? "—" : l.dif.toFixed(1).replace(".", ",") + " pts"}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
      <div style="font-size:11.5px;color:#8E8B84;margin-top:9px">Passe o mouse numa linha para ver a conta detalhada. Mostrando ${Math.min(60, linhas.length)} de ${linhas.length}.</div>`;
  } catch (e) {
    console.error("conferirMargens:", e);
    corpo.innerHTML = `<div style="color:#b91c1c">Não consegui comparar agora: ${esc(e.message || "")}</div>`;
  }
}
