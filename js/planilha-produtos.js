// Lê uma aba da planilha do cliente e devolve produtos, anúncios e problemas.
//
// Módulo ESM: o navegador importa e os testes importam o mesmo arquivo.
//
// Por que não reaproveitar o interpretarPlanilha() do custos.js: aquele existe
// para uma pergunta diferente — "quanto custou o item deste pedido?" — e por
// isso indexa por anúncio. Aqui a pergunta é "que PRODUTOS existem, e onde cada
// um está anunciado?". São chaves diferentes: o anúncio é do marketplace, o
// produto é do cliente.
//
// O desenho abaixo saiu de uma planilha real (3 abas, 60 produtos), não de
// suposição. O que ela ensinou:
//
//   1. O SKU não é a identidade. Nas abas da Shopee não existe coluna de SKU —
//      existe ID do anúncio, que é outra coisa. Na Shein a coluna existe e está
//      vazia em 13 de 15 linhas. O que liga o mesmo produto entre as abas é o
//      NOME, igual nas três.
//   2. Coluna pode não ter rótulo. Na aba da Shein o link do anúncio está numa
//      coluna sem cabeçalho. Procurar só pelo cabeçalho perdia 14 dos 15
//      produtos — e o descarte se escondia no meio das linhas de fórmula.
//   3. Toda aba tem centenas de linhas de fórmula arrastada (0, 0, 4, 0). Elas
//      não são erro nem produto: são vazio com aparência de dado.
//   4. Link colado errado acontece: metade dos links da aba da Shein aponta
//      para a Shopee. Não dá para confiar no nome da aba para saber o
//      marketplace do anúncio.

const SINONIMOS = {
  sku:      ["sku", "codigo", "cod", "ref", "referencia"],
  nome:     ["produto", "produtovendido", "descricao", "nome", "item"],
  preco:    ["valordavenda", "valorvenda", "preco", "precodevenda", "venda"],
  custo:    ["custoproduto", "custodoproduto", "custo", "customercadoria"],
  // Link e ID são colunas DIFERENTES e a planilha real tem as duas: a do ID
  // guarda só o número, a do link guarda o endereço — e é o endereço que diz
  // de qual marketplace é o anúncio. Juntar as duas num sinônimo só fazia a
  // primeira encontrada vencer e o marketplace se perder.
  link:     ["linkdoanuncio", "anuncio", "link", "url"],
  anuncio:  ["iddoanuncio", "idanuncio", "id"],
  peso:     ["peso", "pesodoproduto"],
  medidas:  ["medidas", "medidasdoproduto", "dimensoes", "medida"],
  tamanhos: ["tamanho", "tamanhos"],
  cores:    ["cor", "cores", "nomedascores"],
  material: ["material", "composicao"],
  fotos:    ["fotos", "fotosvideos", "videos", "imagens", "fotosevideos"],
};

const MARKETPLACES = [
  [/(^|\.)shopee\./i, "Shopee"],
  [/(^|\.)shein\./i, "Shein"],
  [/(^|\.)mercadolivre\.|(^|\.)mercadolibre\./i, "Mercado Livre"],
  [/(^|\.)tiktok\.|(^|\.)tiktokshop\./i, "TikTok"],
];
const HOSPEDAGEM_DE_MIDIA = /drive\.google\.|photos\.google\.|youtube\.|youtu\.be|dropbox\.|imgur\./i;

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpaCabecalho = (s) => semAcento(s).toLowerCase().replace(/[^a-z]/g, "");

/** Nome vira chave: sem acento, sem caixa, sem espaço sobrando. */
export function chaveDoNome(nome) {
  return semAcento(nome).toUpperCase().replace(/\s+/g, " ").trim();
}

/** Número em português ou inglês. "R$ 1.234,56" e "1234.56" viram 1234.56. */
export function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s%]/g, "").trim();
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : null;
}

/**
 * Id do anúncio a partir do link (ou do próprio número numa coluna de ID).
 *
 * Aceita a sobra ".0" que o Excel produz ao guardar um id como número —
 * 58204670969.0 é o mesmo anúncio que 58204670969, e recusar isso descartaria
 * a aba inteira em silêncio.
 */
export function idDoAnuncio(texto) {
  const s = String(texto ?? "").trim();
  if (!s) return "";
  let m = s.match(/\/product\/(\d+)\/(\d+)/);
  if (m) return m[2];
  m = s.match(/-i\.(\d+)\.(\d+)/);
  if (m) return m[2];
  m = s.match(/-p-(\d+)/);            // shein: ...-p-539417461-cat-1306
  if (m) return m[1];
  m = s.match(/^(\d{6,})(?:\.0+)?$/); // número solto numa coluna de ID
  if (m) return m[1];
  return "";
}

/** De qual marketplace é este link. Vazio quando não dá para dizer. */
export function marketplaceDoLink(url) {
  // Compara só o HOST. Testar a URL inteira parece funcionar e não funciona:
  // em "https://shopee.com.br/..." o "shopee." vem depois de uma barra, então
  // um padrão ancorado em ponto ou início de texto erra justamente o
  // marketplace mais comum daqui — e erra em silêncio, devolvendo vazio.
  const m = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);
  const host = m ? m[1].toLowerCase() : String(url || "").toLowerCase();
  for (const [re, nome] of MARKETPLACES) if (re.test(host)) return nome;
  return "";
}

const ehUrl = (v) => /^https?:\/\//i.test(String(v || "").trim());

/** Divide respeitando aspas: o CSV do Sheets protege "R$ 1.234,56". */
function separaLinha(linha, sep) {
  const out = []; let atual = "", dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentro && linha[i + 1] === '"') { atual += '"'; i++; }
      else dentro = !dentro;
    } else if (c === sep && !dentro) { out.push(atual); atual = ""; }
    else atual += c;
  }
  out.push(atual);
  return out;
}

/**
 * Acha as colunas: primeiro pelo rótulo, depois pelo conteúdo.
 *
 * A segunda passada existe por causa da aba sem rótulo no link. Ela só olha
 * colunas que sobraram, e só decide quando a maioria das células concorda —
 * uma coluna de links de marketplace é o anúncio, uma de links do Drive são as
 * fotos. Conteúdo é evidência melhor que rótulo: o rótulo é digitado uma vez,
 * o conteúdo se repete em toda linha.
 */
function acharColunas(cabecalho, linhas) {
  const col = {};
  cabecalho.forEach((rot, i) => {
    const limpo = limpaCabecalho(rot);
    if (!limpo) return;
    for (const [campo, nomes] of Object.entries(SINONIMOS)) {
      if (col[campo] !== undefined) continue;
      if (nomes.includes(limpo)) { col[campo] = i; return; }
    }
  });

  const usadas = new Set(Object.values(col));
  const largura = Math.max(0, ...linhas.map((l) => l.length));
  for (let i = 0; i < largura; i++) {
    if (usadas.has(i)) continue;
    const valores = linhas.map((l) => l[i]).filter((v) => String(v || "").trim() !== "");
    if (valores.length < 3) continue;
    const urls = valores.filter(ehUrl);
    if (urls.length / valores.length < 0.6) continue;
    const deMkt = urls.filter((u) => marketplaceDoLink(u)).length;
    const deMidia = urls.filter((u) => HOSPEDAGEM_DE_MIDIA.test(u)).length;
    if (deMkt >= deMidia && col.link === undefined) { col.link = i; usadas.add(i); }
    else if (deMidia > deMkt && col.fotos === undefined) { col.fotos = i; usadas.add(i); }
  }
  return col;
}

const texto = (linha, i) => (i === undefined ? "" : String(linha[i] ?? "").trim());

/**
 * Lê uma aba colada (uma aba = uma loja).
 *
 * Devolve tudo separado, inclusive o que NÃO entrou e por quê. Juntar
 * "linha vazia" com "linha que eu não soube ler" num número só foi o que
 * escondeu a perda de 14 produtos na primeira vez: 235 ignoradas parecia
 * plausível porque 220 eram fórmula arrastada.
 */
export function lerAba(colado, mktEsperado = "") {
  const bruto = String(colado || "").trim();
  const vazio = { colunas: null, produtos: [], conflitos: [], semIdentidade: [], vazias: 0, porMarketplace: {} };
  if (!bruto) return vazio;
  if (/^https?:\/\/\S+$/i.test(bruto)) return { ...vazio, ehLink: true };

  const linhasTexto = bruto.split(/\r?\n/);
  if (!linhasTexto.length) return vazio;
  const amostra = linhasTexto.slice(0, 3).join("\n");
  const sep = amostra.includes("\t") ? "\t" : amostra.includes(";") ? ";" : ",";
  const linhas = linhasTexto.map((l) => separaLinha(l, sep));

  const cabecalho = linhas[0] || [];
  const corpo = linhas.slice(1);
  const col = acharColunas(cabecalho, corpo);
  if (col.nome === undefined && col.sku === undefined) return { ...vazio, colunas: col };

  const porChave = new Map();
  const semIdentidade = [];
  let vazias = 0;

  corpo.forEach((linha, i) => {
    const numeroDaLinha = i + 2;                    // 1 = cabeçalho, base 1
    const nome = texto(linha, col.nome);
    const sku = texto(linha, col.sku);
    // O link vale mais que o id: traz o número E o marketplace.
    const anuncioBruto = texto(linha, col.link) || texto(linha, col.anuncio);
    const preco = numero(texto(linha, col.preco));
    const custo = numero(texto(linha, col.custo));

    // Fórmula arrastada: sem nome, sem sku, sem anúncio de verdade e sem
    // dinheiro de verdade. "De verdade" importa nos dois: a célula do ID
    // costuma trazer um zero da fórmula, que é texto preenchido e anúncio
    // nenhum — e zero de preço ou de custo é a fórmula calculando sobre
    // linha vazia, não um produto que custa nada.
    const temAnuncio = Boolean(idDoAnuncio(anuncioBruto)) || ehUrl(anuncioBruto);
    if (!nome && !sku && !temAnuncio && !preco && !custo) { vazias++; return; }

    const chave = sku ? sku.toUpperCase() : chaveDoNome(nome);
    if (!chave) {
      semIdentidade.push({
        linha: numeroDaLinha,
        motivo: "sem SKU e sem nome",
        conteudo: linha.filter((c) => String(c || "").trim() !== "").slice(0, 6).join(" · "),
      });
      return;
    }

    let p = porChave.get(chave);
    if (!p) {
      p = {
        chave, porNome: !sku, sku, nome: nome || sku,
        custo: null, custosVistos: [], anuncios: [], linhas: [], avisos: [],
        peso: "", medidas: "", tamanhos: "", cores: "", material: "", fotos: "",
      };
      porChave.set(chave, p);
    }
    p.linhas.push(numeroDaLinha);
    if (!p.nome && nome) p.nome = nome;
    if (!p.sku && sku) p.sku = sku;

    if (custo !== null && !p.custosVistos.some((c) => Math.abs(c - custo) < 0.005)) p.custosVistos.push(custo);

    const id = idDoAnuncio(anuncioBruto);
    if (id || preco !== null) {
      const mkt = ehUrl(anuncioBruto) ? marketplaceDoLink(anuncioBruto) : "";
      // Uma aba é uma loja, e uma loja é de um marketplace só. Link apontando
      // para outro lugar é engano de quem colou — e acontece: na planilha real,
      // metade dos links da aba da Shein aponta para a Shopee. Marcar em vez de
      // corrigir sozinho: quem sabe qual dos dois está certo é o dono.
      const fora = Boolean(mktEsperado && mkt && mkt !== mktEsperado);
      p.anuncios.push({ id, preco, link: ehUrl(anuncioBruto) ? anuncioBruto : "", mkt, foraDoMarketplace: fora });
      if (fora) p.avisos.push({ tipo: "linkDeOutroMarketplace", mkt, linha: numeroDaLinha });
    }

    // Descritivos: a primeira linha que trouxer o campo é a que vale. Numa
    // planilha real eles vêm quase sempre vazios (peso em 3 de 25), então
    // sobrescrever com vazio apagaria o pouco que existe.
    for (const campo of ["peso", "medidas", "tamanhos", "cores", "material", "fotos"]) {
      if (!p[campo]) p[campo] = texto(linha, col[campo]);
    }
  });

  const produtos = [], conflitos = [];
  for (const p of porChave.values()) {
    if (p.custosVistos.length > 1) {
      conflitos.push({ chave: p.chave, nome: p.nome, campo: "custo", valores: p.custosVistos.slice().sort((a, b) => a - b), linhas: p.linhas });
      continue;                                     // custo ambíguo não entra
    }
    p.custo = p.custosVistos.length ? p.custosVistos[0] : null;
    delete p.custosVistos;

    const mkts = [...new Set(p.anuncios.map((a) => a.mkt).filter(Boolean))];
    if (mkts.length > 1) p.avisos.push({ tipo: "linksDeMarketplacesDiferentes", mkts });
    produtos.push(p);
  }

  // Contagem por marketplace da aba inteira: é o número que denuncia a aba
  // colada no lugar errado antes de alguém conferir produto por produto.
  const porMarketplace = {};
  for (const p of produtos) {
    for (const a of p.anuncios) {
      const k = a.mkt || "sem link";
      porMarketplace[k] = (porMarketplace[k] || 0) + 1;
    }
  }

  return { colunas: col, produtos, conflitos, semIdentidade, vazias, porMarketplace };
}

/**
 * Id previsível do produto: reimportar a mesma planilha ATUALIZA, não duplica.
 *
 * Id aleatório faria cada importação criar tudo de novo, e o cliente veria o
 * mesmo produto três vezes — uma por aba. Como a chave já é estável (SKU ou
 * nome normalizado), o id sai dela.
 */
export function idDoProduto(custId, chave) {
  const s = String(chave || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  return `${custId}__${s || "sem-nome"}`;
}

/** Id do anúncio dentro de uma loja. Sem id do marketplace, cai na chave. */
export function idDoAnuncioNaLoja(lojaId, anuncioId, chave) {
  if (anuncioId) return `${lojaId}__${anuncioId}`;
  return `${lojaId}__${idDoProduto("x", chave).slice(3)}`;
}
