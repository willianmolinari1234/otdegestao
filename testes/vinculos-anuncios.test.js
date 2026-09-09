import { test } from "node:test";
import assert from "node:assert/strict";
import { identidadeAnuncio } from "../functions/vinculos-anuncios.js";
const base = { mkt: "Mercado Livre", contaId: "123", itemId: "MLB123" };
test("identidade externa ignora SKU e cliente informados", () => {
  assert.deepEqual(identidadeAnuncio(base), identidadeAnuncio({ ...base, sku: "repetido", custId: "outro" }));
});
test("mesmo anúncio em outra conta ou marketplace é outra identidade", () => {
  const ids = [base, { ...base, contaId: "456" }, { ...base, mkt: "TikTok" }].map(x => identidadeAnuncio(x).id);
  assert.equal(new Set(ids).size, 3);
});
test("combinações com separadores não colidem", () => {
  assert.notEqual(identidadeAnuncio({ ...base, contaId: "a__b", itemId: "c" }).id,
    identidadeAnuncio({ ...base, contaId: "a", itemId: "b__c" }).id);
});
test("recusa identidade ausente, link, objeto e número que poderia perder precisão", () => {
  for (const valor of ["", "a/b", "https://site.com", 123, {}, "x".repeat(161)])
    assert.throws(() => identidadeAnuncio({ ...base, contaId: valor }));
  assert.throws(() => identidadeAnuncio({ ...base, mkt: "Outro" }));
});
