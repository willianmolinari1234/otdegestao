// O que cada marketplace desconta de uma venda (fase 8, itens 4 e 5).
//
// Este é o teste mais caro de errar da suíte: margem errada não quebra tela
// nenhuma, ela só mostra um número bonito e falso — foi assim que preço menos
// custo deu 52% onde o real era 7,5%. Os números abaixo saem das tabelas
// oficiais que o Willian mandou em 11/09/2026, conferidas na mão.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAXAS, taxasDoMarketplace, pesoEmKg, faixaDeComissao, freteDoPeso, calcularMargem,
  pct, percentuaisDaLoja, PCT_OTDE_PADRAO, PCT_IMPOSTO_PADRAO,
} from "../js/taxas.js";

// ─── achar o marketplace ──────────────────────────────────────────────
test("o marketplace é achado sem depender de caixa, acento ou espaço", () => {
  for (const escrito of ["Shopee", "shopee", "SHOPEE", " Shopee "]) {
    assert.equal(taxasDoMarketplace(escrito)?.nome, "Shopee", escrito);
  }
  assert.equal(taxasDoMarketplace("Shein")?.nome, "Shein");
  assert.equal(taxasDoMarketplace("Mercado Livre"), null, "ainda não tem tabela");
  assert.equal(taxasDoMarketplace(""), null);
  assert.equal(taxasDoMarketplace(null), null);
});

// ─── faixas de comissão da Shopee ─────────────────────────────────────
const shopee = TAXAS.shopee;

test("as bordas das faixas da Shopee caem onde a tabela manda", () => {
  const faixa = (p) => faixaDeComissao(shopee, p);
  // Até R$79,99 → 20% + R$4
  assert.equal(faixa(0.01).percentual, 20);
  assert.equal(faixa(79.99).fixo, 4);
  // Acima de R$80 até R$99,99 → 14% + R$16. R$80,00 já é a faixa de cima.
  assert.equal(faixa(80).fixo, 16);
  assert.equal(faixa(99.99).fixo, 16);
  // Acima de R$100 até R$199,99 → 14% + R$20
  assert.equal(faixa(100).fixo, 20);
  assert.equal(faixa(199.99).fixo, 20);
  // Acima de R$200 até R$499,99 → 14% + R$26
  assert.equal(faixa(200).fixo, 26);
  assert.equal(faixa(499.99).fixo, 26);
  // Acima de R$500 → 14% + R$26, e o subsídio Pix sobe para 8%
  assert.equal(faixa(500).fixo, 26);
  assert.equal(faixa(500).subsidioPix, 8);
  assert.equal(faixa(9999).subsidioPix, 8);
});

test("o subsídio Pix não existe na primeira faixa e é 5% nas do meio", () => {
  assert.equal(faixaDeComissao(shopee, 50).subsidioPix, 0);
  assert.equal(faixaDeComissao(shopee, 90).subsidioPix, 5);
  assert.equal(faixaDeComissao(shopee, 150).subsidioPix, 5);
  assert.equal(faixaDeComissao(shopee, 300).subsidioPix, 5);
});

test("a Shein cobra 20% em qualquer preço, sem parte fixa", () => {
  for (const p of [10, 79.99, 80, 500, 5000]) {
    const f = faixaDeComissao(TAXAS.shein, p);
    assert.equal(f.percentual, 20, `R$ ${p}`);
    assert.equal(f.fixo, 0);
  }
});

test("preço inválido não devolve faixa", () => {
  assert.equal(faixaDeComissao(shopee, -1), null);
  assert.equal(faixaDeComissao(shopee, NaN), null);
  assert.equal(faixaDeComissao(shopee, "100"), null, "texto não passa por número");
});

// ─── peso ─────────────────────────────────────────────────────────────
test("o peso é entendido em grama e em quilo, com vírgula ou ponto", () => {
  assert.equal(pesoEmKg("180g"), 0.18);
  assert.equal(pesoEmKg("180 g"), 0.18);
  assert.equal(pesoEmKg("1200 gramas"), 1.2);
  assert.equal(pesoEmKg("1,2kg"), 1.2);
  assert.equal(pesoEmKg("1.2 kg"), 1.2);
  assert.equal(pesoEmKg("0,9"), 0.9, "sem unidade é quilo");
  assert.equal(pesoEmKg(0.3), 0.3);
});

test("peso que não dá para entender devolve null, nunca um chute", () => {
  for (const x of ["", "   ", "leve", "1,2 quilos e meio", "-5kg", "0", "abc123", null]) {
    assert.equal(pesoEmKg(x), null, JSON.stringify(x));
  }
});

// ─── frete da Shein ───────────────────────────────────────────────────
const shein = TAXAS.shein;

test("as bordas das faixas de frete são inclusivas, como na tabela", () => {
  // "0 kg < p ≤ 0,3 kg" → R$4. Exatamente 0,3 ainda é a primeira faixa.
  assert.equal(freteDoPeso(shein, 0.3), 4);
  assert.equal(freteDoPeso(shein, 0.31), 5);
  assert.equal(freteDoPeso(shein, 0.6), 5);
  assert.equal(freteDoPeso(shein, 0.9), 6);
  assert.equal(freteDoPeso(shein, 1.2), 8);
  assert.equal(freteDoPeso(shein, 1.5), 10);
  assert.equal(freteDoPeso(shein, 2), 12);
  assert.equal(freteDoPeso(shein, 5), 15);
  assert.equal(freteDoPeso(shein, 9), 32);
  assert.equal(freteDoPeso(shein, 13), 63);
  assert.equal(freteDoPeso(shein, 17), 73);
  assert.equal(freteDoPeso(shein, 23), 89);
  assert.equal(freteDoPeso(shein, 30), 106);
});

test("acima de 30 kg não repete a última faixa: a tabela acaba ali", () => {
  assert.equal(freteDoPeso(shein, 30.5), null);
  assert.equal(freteDoPeso(shein, 100), null);
});

test("marketplace sem tabela de frete devolve null", () => {
  assert.equal(freteDoPeso(shopee, 1), null, "a Shopee não entrou com tabela de frete");
});

// ─── a conta inteira ──────────────────────────────────────────────────
test("Shopee: a conta bate com a calculadora na mão", () => {
  // R$ 150 cai em "14% + R$20". Comissão = 21 + 20 = 41.
  // Lucro = 150 - 60 - 41 = 49. Margem = 49/150 = 32,67%.
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Shopee" });
  assert.deepEqual(r.falta, []);
  assert.equal(r.lucro, 49);
  assert.equal(r.margem, 32.67);
});

test("Shein: a conta desconta o frete do peso", () => {
  // R$ 150 a 20% = 30 de comissão. 500 g → frete R$ 5.
  // Lucro = 150 - 60 - 30 - 5 = 55. Margem = 36,67%.
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Shein" });
  assert.deepEqual(r.falta, []);
  assert.equal(r.lucro, 55);
  assert.equal(r.margem, 36.67);
});

test("a primeira faixa da Shopee morde bem mais: 20% + R$4 num item barato", () => {
  // R$ 50: comissão = 10 + 4 = 14. Lucro = 50 - 30 - 14 = 6. Margem = 12%.
  const r = calcularMargem({ preco: 50, custo: 30, peso: "200g", mkt: "Shopee" });
  assert.equal(r.lucro, 6);
  assert.equal(r.margem, 12);
});

test("a conta pode dar prejuízo, e o número sai negativo em vez de zerado", () => {
  // R$ 50, custo R$ 45: comissão 14. Lucro = 50 - 45 - 14 = -9.
  const r = calcularMargem({ preco: 50, custo: 45, peso: "200g", mkt: "Shopee" });
  assert.equal(r.lucro, -9);
  assert.equal(r.margem, -18);
});

test("os descontos saem discriminados, para a tela poder explicar a conta", () => {
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Shein" });
  assert.deepEqual(r.descontos, [
    { rotulo: "Custo do produto", valor: 60 },
    { rotulo: "Comissão Shein (20% + R$ 0)", valor: 30 },
    { rotulo: "Intermediação de frete", valor: 5 },
  ]);
});

// ─── o que falta, dito em português ───────────────────────────────────
test("sem custo não inventa margem: diz o que falta", () => {
  const r = calcularMargem({ preco: 150, custo: null, peso: "500g", mkt: "Shopee" });
  assert.equal(r.lucro, null);
  assert.equal(r.margem, null);
  assert.deepEqual(r.falta, ["o custo do produto"]);
});

test("na Shein, sem peso não há conta — é ele que decide o frete", () => {
  const r = calcularMargem({ preco: 150, custo: 60, peso: "", mkt: "Shein" });
  assert.equal(r.lucro, null);
  assert.match(r.falta[0], /peso do produto/);
});

test("na Shopee, sem peso a conta sai assim mesmo: não há frete por peso lá", () => {
  const r = calcularMargem({ preco: 150, custo: 60, peso: "", mkt: "Shopee" });
  assert.deepEqual(r.falta, []);
  assert.equal(r.lucro, 49);
});

test("peso fora da tabela avisa, em vez de cobrar o frete de 30 kg", () => {
  const r = calcularMargem({ preco: 150, custo: 60, peso: "45kg", mkt: "Shein" });
  assert.equal(r.lucro, null);
  assert.match(r.falta[0], /faixa de frete para 45 kg/);
});

test("marketplace sem tabela não chuta taxa nenhuma", () => {
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Mercado Livre" });
  assert.equal(r.lucro, null);
  assert.match(r.falta[0], /não tenho as taxas de Mercado Livre/);
});

test("tudo faltando é listado de uma vez, não um erro por vez", () => {
  const r = calcularMargem({ preco: null, custo: null, peso: "", mkt: "Shein" });
  assert.equal(r.falta.length, 3);
});

// ─── avisos: o que a conta NÃO desconta ───────────────────────────────
test("a conta avisa que ainda não desconta imposto", () => {
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Shopee" });
  assert.ok(r.avisos.some((a) => /imposto/i.test(a)));
});

test("o subsídio Pix não é descontado, é avisado à parte", () => {
  // Aplicar sempre inventaria um custo em toda venda: ele só incide quando o
  // comprador escolhe Pix.
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Shopee" });
  assert.equal(r.lucro, 49, "o lucro NÃO pode ter os 5% do Pix descontados");
  assert.ok(r.avisos.some((a) => /Pix/.test(a) && /5%/.test(a)));
});

test("na primeira faixa da Shopee não há aviso de Pix, porque não há subsídio", () => {
  const r = calcularMargem({ preco: 50, custo: 30, peso: "200g", mkt: "Shopee" });
  assert.equal(r.avisos.some((a) => /Pix/.test(a)), false);
});

test("acima de R$500 o aviso de Pix sobe para 8%", () => {
  const r = calcularMargem({ preco: 600, custo: 200, peso: "1kg", mkt: "Shopee" });
  assert.ok(r.avisos.some((a) => /8%/.test(a)));
});

// ─── a decisão travada ────────────────────────────────────────────────
test("calcularMargem não conhece margem gravada: quem decide usar é quem chama", () => {
  // A garantia de nunca sobrescrever margem de planilha mora em quem consome
  // este módulo. Aqui só se prova que a função é pura: mesma entrada, mesma
  // saída, sem tocar em nada de fora.
  const entrada = { preco: 150, custo: 60, peso: "500g", mkt: "Shopee" };
  assert.deepEqual(calcularMargem(entrada), calcularMargem(entrada));
  assert.deepEqual(entrada, { preco: 150, custo: 60, peso: "500g", mkt: "Shopee" });
});

// ─── a trava da conta incompleta ──────────────────────────────────────
test("as tabelas dos dois marketplaces não têm lacuna", () => {
  // A Shopee não cobra frete do lojista (confirmado em 11/09/2026), então
  // `frete: null` lá não é buraco, é a informação de que não há.
  assert.equal(TAXAS.shopee.completa, true);
  assert.equal(TAXAS.shein.completa, true);
  assert.equal(TAXAS.shopee.frete, null);
});

test("sem os percentuais do cadastro, a conta NÃO se declara completa", () => {
  // É o que segura a estimativa otimista longe da tela do cliente: sem a
  // gestão da OTDE e o imposto, ela dá 52% onde o real é da ordem de 7,5%.
  const r = calcularMargem({ preco: 150, custo: 60, peso: "500g", mkt: "Shopee" });
  assert.equal(r.completa, false);
  assert.ok(r.avisos.some((a) => /gestão da OTDE/.test(a) && /imposto/.test(a)));
});

test("conta que não fecha nunca se declara completa", () => {
  const r = calcularMargem({ preco: null, custo: null, peso: "", mkt: "Shein" });
  assert.equal(r.completa, false);
});

test("marketplace sem tabela nenhuma nunca se declara completo", () => {
  assert.equal(calcularMargem({ preco: 150, custo: 60, peso: "1kg", mkt: "Amazon" }).completa, false);
});

test("o caso que já custou caro: conta incompleta dá margem alta demais", () => {
  // R$199,99 com custo R$48 dá 52% aqui. O CLAUDE.md registra que o real,
  // nesse tipo de caso, é da ordem de 7,5%. Enquanto a diferença for essa, a
  // estimativa não pode chegar ao dono do produto.
  const r = calcularMargem({ preco: 199.99, custo: 48, peso: "420g", mkt: "Shopee" });
  assert.equal(r.margem, 52);
  assert.equal(r.completa, false, "52% não pode ser mostrado ao cliente como margem");
});

// ─── a comissão da OTDE e o imposto, que vêm do cadastro ──────────────
test("percentual é lido de texto, que é como o cadastro guarda", () => {
  assert.equal(pct("8%"), 8);
  assert.equal(pct("7,5%"), 7.5);
  assert.equal(pct("8"), 8);
  assert.equal(pct(8), 8);
  assert.equal(pct(""), null);
  assert.equal(pct(null), null);
  assert.equal(pct("oito"), null);
});

test("a herança vai da loja para o cliente e só então para o padrão", () => {
  const dono = { fee: "8%", imposto: "7,5%" };
  // 1. exceção na própria loja vence
  assert.deepEqual(percentuaisDaLoja({ comissao: "5", imposto: "3" }, dono),
    { pctOtde: 5, pctImposto: 3 });
  // 2. loja sem exceção herda do proprietário
  assert.deepEqual(percentuaisDaLoja({}, dono), { pctOtde: 8, pctImposto: 7.5 });
  // 3. ninguém disse nada: o padrão do sistema
  assert.deepEqual(percentuaisDaLoja({}, {}),
    { pctOtde: PCT_OTDE_PADRAO, pctImposto: PCT_IMPOSTO_PADRAO });
});

test("os padrões são os mesmos do fechamento mensal", () => {
  // Se divergissem, a margem da tela brigaria com o relatório que o cliente
  // recebe todo mês — e ninguém saberia qual dos dois está certo.
  assert.equal(PCT_OTDE_PADRAO, 2);
  assert.equal(PCT_IMPOSTO_PADRAO, 0);
});

test("zero é um percentual válido e não cai no padrão", () => {
  assert.deepEqual(percentuaisDaLoja({ comissao: "0", imposto: "0" }, { fee: "8" }),
    { pctOtde: 0, pctImposto: 0 });
});

test("a conta completa desconta gestão e imposto, e se declara completa", () => {
  // R$ 150 na Shopee: comissão 14% + R$20 = 41. Gestão 8% = 12. Imposto 7,5% = 11,25.
  // Lucro = 150 - 60 - 41 - 12 - 11,25 = 25,75. Margem = 17,17%.
  const r = calcularMargem({
    preco: 150, custo: 60, peso: "500g", mkt: "Shopee", pctOtde: 8, pctImposto: 7.5,
  });
  assert.equal(r.lucro, 25.75);
  assert.equal(r.margem, 17.17);
  assert.equal(r.completa, true);
  assert.equal(r.avisos.some((a) => /não desconta/.test(a)), false);
});

test("a conta completa muda MUITO o número: é por isso que ela existe", () => {
  const semCadastro = calcularMargem({ preco: 199.99, custo: 48, peso: "420g", mkt: "Shopee" });
  const comCadastro = calcularMargem({
    preco: 199.99, custo: 48, peso: "420g", mkt: "Shopee", pctOtde: 8, pctImposto: 7.5,
  });
  assert.equal(semCadastro.margem, 52);
  assert.ok(comCadastro.margem < 37, `com o cadastro deu ${comCadastro.margem}%`);
  assert.equal(semCadastro.completa, false);
  assert.equal(comCadastro.completa, true);
});

test("gestão e imposto saem discriminados, com o percentual no rótulo", () => {
  const r = calcularMargem({
    preco: 100, custo: 20, peso: "200g", mkt: "Shein", pctOtde: 8, pctImposto: 7.5,
  });
  assert.deepEqual(r.descontos, [
    { rotulo: "Custo do produto", valor: 20 },
    { rotulo: "Comissão Shein (20% + R$ 0)", valor: 20 },
    { rotulo: "Intermediação de frete", valor: 4 },
    { rotulo: "Gestão OTDE (8%)", valor: 8 },
    { rotulo: "Imposto (7,5%)", valor: 7.5 },
  ]);
  assert.equal(r.lucro, 40.5);
});

test("percentual zero não vira linha de desconto, mas conta como informado", () => {
  const r = calcularMargem({
    preco: 100, custo: 20, peso: "200g", mkt: "Shopee", pctOtde: 0, pctImposto: 0,
  });
  assert.equal(r.descontos.some((d) => /Gestão|Imposto/.test(d.rotulo)), false);
  assert.equal(r.completa, true, "zero é uma resposta, não uma lacuna");
});

test("só um dos dois informado ainda é conta incompleta, e diz qual falta", () => {
  const soOtde = calcularMargem({ preco: 150, custo: 60, peso: "", mkt: "Shopee", pctOtde: 8 });
  assert.equal(soOtde.completa, false);
  assert.ok(soOtde.avisos.some((a) => /não desconta o imposto/.test(a)));

  const soImposto = calcularMargem({ preco: 150, custo: 60, peso: "", mkt: "Shopee", pctImposto: 7.5 });
  assert.equal(soImposto.completa, false);
  assert.ok(soImposto.avisos.some((a) => /não desconta a gestão da OTDE/.test(a)));
});

test("percentual inválido é tratado como ausente, nunca como zero", () => {
  // Tratar lixo como zero faria a conta se declarar completa mostrando uma
  // margem que não desconta nada — exatamente o erro que se quer evitar.
  const r = calcularMargem({
    preco: 150, custo: 60, peso: "", mkt: "Shopee", pctOtde: NaN, pctImposto: -3,
  });
  assert.equal(r.completa, false);
});
