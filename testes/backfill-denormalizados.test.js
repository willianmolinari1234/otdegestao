// Testes da lógica pura do backfill dos campos denormalizados (fase 6, item 2).
//
// Provam a regra sem tocar no Firestore: o que preenche, o que NÃO toca, o que
// vira órfão, e que rodar de novo não muda nada. Os dados são fictícios — o
// que importa é o comportamento da decisão.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vazioTexto, vazioLista, mktsDoProprietario, planejar, decidir,
} from "../functions/backfill-denormalizados.js";

// ─── vazioTexto / vazioLista ──────────────────────────────────────────
test("vazioTexto: ausente, null e string em branco contam como vazio", () => {
  assert.equal(vazioTexto(undefined), true);
  assert.equal(vazioTexto(null), true);
  assert.equal(vazioTexto(""), true);
  assert.equal(vazioTexto("   "), true);
  assert.equal(vazioTexto("Reana Tricot"), false);
  assert.equal(vazioTexto("0"), false);
});

test("vazioLista: ausente, null, não-array e array vazio contam como vazio", () => {
  assert.equal(vazioLista(undefined), true);
  assert.equal(vazioLista(null), true);
  assert.equal(vazioLista("Shopee"), true);
  assert.equal(vazioLista([]), true);
  assert.equal(vazioLista(["Shopee"]), false);
});

// ─── mktsDoProprietario ───────────────────────────────────────────────
test("mkts: lista própria do proprietário vence, sem duplicar", () => {
  const r = mktsDoProprietario(
    { marketplaces: ["Shopee", "Shein", "Shopee"] },
    [{ mkt: "Mercado Livre" }],
  );
  assert.deepEqual(r, ["Shopee", "Shein"]);
});

test("mkts: sem lista própria, deduz das lojas do proprietário", () => {
  const r = mktsDoProprietario(
    { name: "Fulano" },
    [{ mkt: "Shopee" }, { mkt: "Shein" }, { mkt: "Shopee" }, { mkt: "" }],
  );
  assert.deepEqual(r, ["Shopee", "Shein"]);
});

test("mkts: sem lista e sem loja, devolve vazio (não inventa [])", () => {
  assert.deepEqual(mktsDoProprietario({ name: "Fulano" }, []), []);
  assert.deepEqual(mktsDoProprietario(null, null), []);
});

// ─── planejar: só preenche o vazio ────────────────────────────────────
const origemCheia = {
  custNome: "Reana Tricot",
  storeNome: "Reana Tricot Oficial",
  storeMkt: "Shopee",
  mkts: ["Shopee", "Shein"],
};

test("planejar/product: documento pelado recebe custNome e mkts, nada de loja", () => {
  const campos = planejar("product", {}, origemCheia);
  assert.deepEqual(campos, { custNome: "Reana Tricot", mkts: ["Shopee", "Shein"] });
});

test("planejar/listing: documento pelado recebe os quatro campos", () => {
  const campos = planejar("listing", {}, origemCheia);
  assert.deepEqual(campos, {
    custNome: "Reana Tricot",
    mkts: ["Shopee", "Shein"],
    storeNome: "Reana Tricot Oficial",
    storeMkt: "Shopee",
  });
});

test("planejar: campo já gravado nunca é tocado", () => {
  const doc = {
    custNome: "Nome Antigo",
    storeNome: "Loja Antiga",
    storeMkt: "Shein",
    mkts: ["Shein"],
  };
  assert.deepEqual(planejar("listing", doc, origemCheia), {});
});

test("planejar: preenche só o subconjunto que está vazio", () => {
  const doc = { custNome: "Já Tem", storeMkt: "", mkts: [] };
  const campos = planejar("listing", doc, origemCheia);
  assert.deepEqual(campos, {
    mkts: ["Shopee", "Shein"],
    storeNome: "Reana Tricot Oficial",
    storeMkt: "Shopee",
  });
});

test("planejar: origem vazia não grava string vazia nem array vazio", () => {
  const campos = planejar("listing", {}, { custNome: "", storeNome: "", storeMkt: "", mkts: [] });
  assert.deepEqual(campos, {});
});

test("planejar: mkts com um item vazio no doc é considerado preenchido", () => {
  // ["Shein"] já é um valor gravado — não sobrescreve mesmo divergindo da origem.
  const campos = planejar("product", { mkts: ["Shein"] }, origemCheia);
  assert.deepEqual(campos, { custNome: "Reana Tricot" });
});

// ─── decidir: junção com órfãos ───────────────────────────────────────
const prop = { id: "cust1", name: "Reana Tricot", marketplaces: ["Shopee", "Shein"] };
const loja = { id: "loja1", name: "Reana Tricot Oficial", mkt: "Shopee", custId: "cust1" };

test("decidir/product: proprietário achado, preenche o que falta", () => {
  const { campos, orfao } = decidir("product", { custId: "cust1" }, { proprietario: prop });
  assert.deepEqual(campos, { custNome: "Reana Tricot", mkts: ["Shopee", "Shein"] });
  assert.deepEqual(orfao, []);
});

test("decidir/listing: proprietário e loja achados", () => {
  const { campos, orfao } = decidir(
    "listing",
    { custId: "cust1", storeId: "loja1" },
    { proprietario: prop, loja },
  );
  assert.deepEqual(campos, {
    custNome: "Reana Tricot",
    mkts: ["Shopee", "Shein"],
    storeNome: "Reana Tricot Oficial",
    storeMkt: "Shopee",
  });
  assert.deepEqual(orfao, []);
});

test("decidir: custId sem proprietário é órfão e NÃO grava nada", () => {
  const { campos, orfao } = decidir(
    "listing",
    { custId: "sumiu", storeId: "loja1" },
    { proprietario: null, loja },
  );
  assert.deepEqual(campos, {});
  assert.deepEqual(orfao, [{ campo: "custId", valor: "sumiu" }]);
});

test("decidir: storeId sem loja é órfão e NÃO grava nada, mesmo com dono ok", () => {
  const { campos, orfao } = decidir(
    "listing",
    { custId: "cust1", storeId: "sumiu" },
    { proprietario: prop, loja: null },
  );
  assert.deepEqual(campos, {});
  assert.deepEqual(orfao, [{ campo: "storeId", valor: "sumiu" }]);
});

test("decidir: documento sem custId nenhum vira órfão com valor null", () => {
  const { campos, orfao } = decidir("product", {}, { proprietario: null });
  assert.deepEqual(campos, {});
  assert.deepEqual(orfao, [{ campo: "custId", valor: null }]);
});

test("decidir: proprietário sem lista de mkts deduz das lojas dele", () => {
  const propSemLista = { id: "cust2", name: "Eva Home" };
  const { campos } = decidir("product", { custId: "cust2" }, {
    proprietario: propSemLista,
    lojasDoProprietario: [{ mkt: "Shopee" }, { mkt: "Shopee" }],
  });
  assert.deepEqual(campos, { custNome: "Eva Home", mkts: ["Shopee"] });
});

test("decidir é idempotente: segunda passada não acha nada", () => {
  const doc = { custId: "cust1", storeId: "loja1" };
  const primeira = decidir("listing", doc, { proprietario: prop, loja });
  const aplicado = { ...doc, ...primeira.campos };
  const segunda = decidir("listing", aplicado, { proprietario: prop, loja });
  assert.deepEqual(segunda.campos, {});
  assert.deepEqual(segunda.orfao, []);
});

test("decidir nunca devolve margem, lucro, custo, preco, criadoPor ou criadoEm", () => {
  const doc = {
    custId: "cust1", storeId: "loja1",
    margem: 7.5, lucro: 3.2, custo: 24.5, preco: 44.9,
    criadoPor: { uid: "x", emNomeDe: "y" }, criadoEm: "2026-01-01",
  };
  const { campos } = decidir("listing", doc, { proprietario: prop, loja });
  for (const proibido of ["margem", "lucro", "custo", "preco", "criadoPor", "criadoEm"]) {
    assert.equal(proibido in campos, false, `${proibido} não pode entrar`);
  }
});
