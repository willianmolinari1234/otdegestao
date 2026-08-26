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
    <div class="form-modal-header">
      <h3>Importar planilha · ${esc(loja.name)}</h3>
      <button id="pl-close" class="modal-close">×</button>
    </div>
    <div class="form-modal-body">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:11px;padding:12px 15px;margin-bottom:14px;font-size:12.5px;color:#475569;line-height:1.6">
        Os produtos entram para <b>${esc(cust.name)}</b>, e os anúncios para a loja
        <b>${esc(loja.name)}</b> (${esc(loja.mkt || "sem marketplace")}).
        Cole <b>uma aba</b> — a da loja ${esc(loja.name)} — com o cabeçalho junto.
      </div>
      <textarea id="pl-colado" class="finput" rows="9" placeholder="Selecione a aba inteira no Google Sheets ou no Excel (inclusive a linha de cabeçalho), copie e cole aqui." style="resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px"></textarea>
      <div class="form-actions" style="margin-top:16px">
        <button id="pl-cancel" class="btn-sm">Cancelar</button>
        <button id="pl-ler" class="btn-primary">Ler planilha</button>
      </div>
    </div>`);
  setTimeout(() => {
    document.getElementById("pl-close").onclick = document.getElementById("pl-cancel").onclick = closeFormModal;
    document.getElementById("pl-ler").onclick = plLer;
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
      <div style="font-size:11.5px;color:#64748b;margin-top:2px">${rot}</div>
    </div>`;

  const linhaProduto = (p) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9">
        <div style="font-weight:600;font-size:13px">${esc(p.nome)}</div>
        <div style="font-size:11px;color:#94a3b8">${p.sku ? "SKU " + esc(p.sku) : "identificado pelo nome"}</div>
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:13px;white-space:nowrap">${plMoeda(p.custo)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12.5px">
        ${p.anuncios.map((a) => `<span style="display:inline-block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:2px 8px;margin:1px 3px 1px 0;${a.foraDoMarketplace ? "border-color:#fca5a5;background:#fef2f2;color:#b91c1c" : ""}">${plMoeda(a.preco)}${a.foraDoMarketplace ? " · " + esc(a.mkt) : ""}</span>`).join("") || "<span style='color:#cbd5e1'>sem anúncio</span>"}
      </td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:11.5px;color:#94a3b8">${p.fotos ? "📁 fotos" : ""}${p.peso ? " ⚖️" : ""}</td>
    </tr>`;

  const blocoConflito = (c, i) => `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:11px;padding:12px 15px;margin-bottom:8px">
      <div style="font-weight:600;font-size:13px;margin-bottom:2px">${esc(c.nome || c.chave)}</div>
      <div style="font-size:12px;color:#92400e;margin-bottom:9px">Custo diferente ${c.entreAbas ? "do que já está no sistema" : "entre as linhas desta aba"}. Qual é o certo?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${c.valores.map((v, j) => `<label style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid #e5e7eb;border-radius:9px;padding:7px 13px;font-size:13px;cursor:pointer">
          <input type="radio" name="pl-cf-${i}" data-cf="${esc(c.chave)}" value="${v}" ${j === 0 ? "" : ""} style="margin:0;accent-color:#ea580c"/>${plMoeda(v)}
        </label>`).join("")}
        <label style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1.5px solid #e5e7eb;border-radius:9px;padding:7px 13px;font-size:13px;cursor:pointer;color:#64748b">
          <input type="radio" name="pl-cf-${i}" data-cf="${esc(c.chave)}" value="" checked style="margin:0;accent-color:#94a3b8"/>deixar de fora
        </label>
      </div>
    </div>`;

  showFormModal(`
    <div class="form-modal-header">
      <h3>Conferir antes de importar · ${esc(loja.name)}</h3>
      <button id="pl-close" class="modal-close">×</button>
    </div>
    <div class="form-modal-body">
      <div style="display:flex;gap:9px;margin-bottom:16px;flex-wrap:wrap">
        ${cartao("#16a34a", "#f0fdf4", "#bbf7d0", entram.length, "produtos entram")}
        ${cartao("#0f172a", "#f8fafc", "#e2e8f0", anuncios, "anúncios")}
        ${cartao(conflitos.length ? "#b45309" : "#94a3b8", "#fffbeb", "#fde68a", conflitos.length, "em conflito")}
        ${cartao(leitura.semIdentidade.length ? "#b91c1c" : "#94a3b8", "#fef2f2", "#fecaca", leitura.semIdentidade.length, "não consegui ler")}
      </div>

      <div style="font-size:11.5px;color:#94a3b8;margin-bottom:16px;line-height:1.6">
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
            <span style="color:#94a3b8">linha ${s.linha}</span> · <span style="color:#b91c1c">${esc(s.motivo)}</span>
            <div style="color:#64748b;font-family:ui-monospace,Menlo,monospace;font-size:11px;margin-top:2px">${esc(s.conteudo)}</div>
          </div>`).join("")}
        </div>` : ""}

      <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 9px">Vão entrar</div>
      <div style="border:1px solid #e2e8f0;border-radius:11px;overflow:auto;max-height:300px">
        <table style="width:100%;border-collapse:collapse">
          <thead style="background:#f8fafc;position:sticky;top:0">
            <tr>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b">Produto</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b">Custo</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b">Anúncios nesta loja</th>
              <th style="padding:8px 10px;text-align:left;font-size:11px;color:#64748b"></th>
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
      const doc = { id: idProduto, custId: cust.id, chave: p.chave, nome: p.nome, mkts,
        origem: "planilha", atualizadoEm: agora, atualizadoPor: currentUser.id };
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
          id: idAnuncio, custId: cust.id, produtoId: idProduto, chave: p.chave,
          mkt: a.mkt || loja.mkt || "", storeId: loja.id, itemId: a.id || "",
          preco: a.preco === null ? null : a.preco, link: a.link || "",
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
