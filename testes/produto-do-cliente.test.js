// Testes da ficha do produto preenchida pelo cliente (fase 8, item 1).
//
// Provam a decisão sem tocar no Firestore: o que barra o salvamento, o que o
// cliente NÃO consegue escrever, o que campo vazio faz, e que salvar duas
// vezes cai no mesmo id. Dados fictícios — o que importa é o comportamento.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAMPOS_DA_FICHA, ErroProduto, faltandoNaFicha, chaveDoProduto, idDoProduto,
  montarProdutoDoCliente,
} from "../functions/produto-do-cliente.js";
import { idDoProduto as idDaPlanilha, chaveDoNome } from "../js/planilha-produtos.js";

// Ficha completa de referência. Cada teste estraga só o que quer provar.
const completa = () => ({
  nome: "Body Manga Longa", sku: "BML-42", peso: "180g",
  medidasProduto: "50x30cm", medidas: "22x16x6cm",
  fotos: "https://drive.google.com/drive/folders/abc123",
  obs: "Tecido suplex, não amassa.",
});

const montar = (extra = {}, resto = {}) => montarProdutoDoCliente({
  entrada: { ...completa(), ...extra },
  custId: "cust1", custNome: "Poliane", mkts: ["Shopee", "Shein"],
  autor: { uid: "u-cliente" }, agora: "2026-09-11T12:00:00.000Z",
  ...resto,
});

// ─── obrigatórios ─────────────────────────────────────────────────────
test("os sete obrigatórios são os combinados com o Willian", () => {
  const nomes = CAMPOS_DA_FICHA.filter((c) => c.obrigatorio).map((c) => c.campo);
  assert.deepEqual(nomes, ["nome", "sku", "peso", "medidasProduto", "medidas", "fotos", "obs"]);
});

test("custo NÃO é obrigatório: a ficha é para anunciar, não para precificar", () => {
  assert.equal(CAMPOS_DA_FICHA.some((c) => c.campo === "custo"), false);
  const { doc } = montar();
  assert.equal("custo" in doc, false);
});

test("faltandoNaFicha devolve os rótulos em português, não os campos", () => {
  assert.deepEqual(faltandoNaFicha({}), [
    "Nome do produto", "SKU", "Peso", "Medidas do produto",
    "Medidas da embalagem", "Foto", "Observações",
  ]);
  assert.deepEqual(faltandoNaFicha(completa()), []);
});

test("faltandoNaFicha aceita foto em lista, que é como a planilha às vezes grava", () => {
  const p = { ...completa(), fotos: ["https://drive.google.com/file/d/xyz/view"] };
  assert.deepEqual(faltandoNaFicha(p), []);
});

test("só espaço em branco não preenche obrigatório", () => {
  assert.deepEqual(faltandoNaFicha({ ...completa(), peso: "   " }), ["Peso"]);
});

test("um obrigatório faltando barra o salvamento, dizendo qual", () => {
  assert.throws(() => montar({ obs: "" }), (e) => {
    assert.ok(e instanceof ErroProduto);
    assert.equal(e.status, 400);
    assert.equal(e.message, "Falta preencher: Observações.");
    return true;
  });
});

test("vários faltando saem na mesma frase, na ordem da tela", () => {
  assert.throws(() => montar({ peso: "", fotos: "" }),
    /Faltam preencher: Peso, Foto\./);
});

// ─── o que o cliente não escreve ──────────────────────────────────────
test("mkts vem do proprietário e ignora o que a entrada mandar", () => {
  const { doc } = montar({ mkts: ["Amazon"], custId: "outro" });
  assert.deepEqual(doc.mkts, ["Shopee", "Shein"]);
  assert.equal(doc.custId, "cust1");
});

test("mkts vazio do proprietário vira lista vazia, não some do documento", () => {
  const { doc } = montar({}, { mkts: [] });
  assert.deepEqual(doc.mkts, []);
});

test("sem custId não grava nada: produto sem dono é o erro caro deste projeto", () => {
  assert.throws(() => montarProdutoDoCliente({ entrada: completa(), custId: "" }),
    (e) => e instanceof ErroProduto && e.status === 403);
});

test("preco, margem e lucro não entram, nem quando a entrada insiste", () => {
  const { doc } = montar({ preco: 99, margem: 52, lucro: 40 });
  assert.equal("preco" in doc, false);
  assert.equal("margem" in doc, false);
  assert.equal("lucro" in doc, false);
});

// ─── id determinístico ────────────────────────────────────────────────
test("salvar duas vezes cai no mesmo id", () => {
  assert.equal(montar().id, montar().id);
  assert.equal(montar().id, "cust1__bml-42");
});

test("o id bate com o da importação de planilha, senão o produto vira dois", () => {
  assert.equal(idDoProduto("cust1", "BML-42"), idDaPlanilha("cust1", "BML-42"));
  assert.equal(idDoProduto("cust1", "Body Manga Longa"),
    idDaPlanilha("cust1", chaveDoNome("Body Manga Longa")));
});

test("acento e espaço não mudam o id", () => {
  assert.equal(chaveDoProduto("Calção Infantil"), "calcao-infantil");
  assert.equal(chaveDoProduto("  A  B  "), "a-b");
});

test("chave sem nenhuma letra ou número não gera id quebrado", () => {
  assert.equal(idDoProduto("cust1", "###"), "cust1__sem-nome");
});

// ─── edição ───────────────────────────────────────────────────────────
const existente = {
  id: "cust1__bml-42", chave: "BML-42", custId: "cust1", origem: "planilha",
  custo: 12.9, preco: 49.9, margem: 7.5, criadoEm: "2026-01-01T00:00:00.000Z",
  criadoPor: { uid: "u-equipe", emNomeDe: "cust1" },
};

test("corrigir o SKU não cria um segundo produto: id e chave são preservados", () => {
  const { id, doc, criando } = montar({ sku: "BML-99" }, { existente });
  assert.equal(id, "cust1__bml-42");
  assert.equal(doc.chave, "BML-42");
  assert.equal(doc.sku, "BML-99");
  assert.equal(criando, false);
});

test("editar preserva a origem: produto de planilha não vira produto do cliente", () => {
  assert.equal(montar({}, { existente }).doc.origem, "planilha");
  assert.equal(montar().doc.origem, "cliente");
});

test("campo opcional apagado na tela é apagado mesmo: o que está na tela é o que fica", () => {
  const comCor = { ...existente, cores: "Azul" };
  const { doc } = montar({ cores: "" }, { existente: comCor });
  assert.equal(doc.cores, "");
});

test("custo vazio não apaga o que a planilha trouxe", () => {
  const { doc } = montar({ custo: "" }, { existente });
  assert.equal("custo" in doc, false, "custo ausente do patch preserva o gravado");
});

test("custo em português vira número", () => {
  assert.equal(montar({ custo: "R$ 1.234,56" }).doc.custo, 1234.56);
  assert.equal(montar({ custo: "12,90" }).doc.custo, 12.9);
  assert.equal(montar({ custo: "0" }).doc.custo, 0);
});

test("custo inválido reclama em vez de virar NaN no painel", () => {
  assert.throws(() => montar({ custo: "doze reais" }), /Custo inválido/);
  assert.throws(() => montar({ custo: "-5" }), /Custo inválido/);
});

// ─── autoria dupla ────────────────────────────────────────────────────
test("criar carimba criadoEm e criadoPor; editar carimba atualizadoPor", () => {
  const novo = montar().doc;
  assert.equal(novo.criadoEm, "2026-09-11T12:00:00.000Z");
  assert.deepEqual(novo.criadoPor, { uid: "u-cliente", emNomeDe: "cust1" });
  assert.equal("atualizadoPor" in novo, false);

  const editado = montar({}, { existente }).doc;
  assert.deepEqual(editado.atualizadoPor, { uid: "u-cliente", emNomeDe: "cust1" });
  assert.equal("criadoEm" in editado, false, "edição não reescreve a data de criação");
});

test("a equipe preenchendo pelo cliente aparece como quem digitou", () => {
  const { doc } = montar({}, { autor: { uid: "u-equipe", emNomeDe: "cust1" } });
  assert.deepEqual(doc.criadoPor, { uid: "u-equipe", emNomeDe: "cust1" });
});

// ─── foto e vídeo com mais de um link ─────────────────────────────────
test("um link só continua texto, como o dado já existe hoje", () => {
  const { doc } = montar();
  assert.equal(typeof doc.fotos, "string");
  assert.equal(doc.fotos, "https://drive.google.com/drive/folders/abc123");
});

test("vários links, um por linha, viram lista", () => {
  const { doc } = montar({ fotos: "https://drive.google.com/a\nhttps://drive.google.com/b" });
  assert.deepEqual(doc.fotos, ["https://drive.google.com/a", "https://drive.google.com/b"]);
});

test("linha em branco no meio não vira link vazio", () => {
  const { doc } = montar({ fotos: "https://drive.google.com/a\n\n  \nhttps://drive.google.com/b\n" });
  assert.deepEqual(doc.fotos, ["https://drive.google.com/a", "https://drive.google.com/b"]);
});

test("lista que chega como array é preservada", () => {
  const { doc } = montar({ video: ["https://drive.google.com/v1", "https://drive.google.com/v2"] });
  assert.deepEqual(doc.video, ["https://drive.google.com/v1", "https://drive.google.com/v2"]);
});

test("foto só com espaços continua contando como faltando", () => {
  assert.throws(() => montar({ fotos: "  \n  " }), /Falta preencher: Foto\./);
});
