// Identidade externa nunca depende de SKU. Coleção privada: só Admin SDK.
import { createHash } from "node:crypto";

export class ErroVinculo extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const hash = (partes) => createHash("sha256").update(JSON.stringify(partes)).digest("hex");
const campo = (valor, nome) => {
  if (typeof valor !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(valor))
    throw new ErroVinculo(`${nome}: informe o identificador do marketplace, sem link ou espaços.`);
  return valor;
};
export function identidadeAnuncio(entrada) {
  const { mkt } = entrada;
  if (!["Mercado Livre", "TikTok"].includes(mkt)) throw new ErroVinculo("Marketplace inválido.");
  const contaId = campo(entrada.contaId, "Conta");
  const itemId = campo(entrada.itemId, "Anúncio");
  return { mkt, contaId, itemId, contaChave: hash([mkt, contaId]), id: hash([mkt, contaId, itemId]) };
}
function validarProduto(produto, cliente, mkt, custId) {
  if (!produto || !cliente || produto.custId !== custId)
    throw new ErroVinculo("O produto não pertence ao cliente selecionado.", 409);
  if (!Array.isArray(produto.mkts) || !produto.mkts.includes(mkt))
    throw new ErroVinculo("O produto não está disponível neste marketplace.", 409);
}
export function criarServicoVinculos(db, agora = () => new Date().toISOString()) {
  const colecao = db.collection("vinculos_anuncios");
  return {
    async listar(entrada) {
      const identidade = identidadeAnuncio({ ...entrada, itemId: "consulta" });
      let consulta = colecao.where("contaChave", "==", identidade.contaChave).orderBy("__name__");
      if (entrada.depois) {
        if (!/^[a-f0-9]{64}$/.test(entrada.depois)) throw new ErroVinculo("Página inválida.");
        consulta = consulta.startAfter(entrada.depois);
      }
      const snap = await consulta.limit(101).get();
      const itens = snap.docs.slice(0, 100).map(d => ({ ...d.data(), id: d.id }));
      return { itens, depois: snap.docs.length > 100 ? itens.at(-1).id : null };
    },
    async registrar(entrada, uid) {
      const identidade = identidadeAnuncio(entrada);
      const ref = colecao.doc(identidade.id);
      return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (snap.exists) return { ...snap.data(), id: ref.id };
        const data = { ...identidade, status: "pendente", criadoEm: agora(),
          criadoPor: { uid, emNomeDe: null } };
        tx.set(ref, data);
        return data;
      });
    },
    async vincular(entrada, uid) {
      const identidade = identidadeAnuncio(entrada);
      const custId = campo(entrada.custId, "Cliente");
      const produtoId = campo(entrada.produtoId, "Produto");
      const ref = colecao.doc(identidade.id);
      return db.runTransaction(async tx => {
        const [snap, produto, cliente] = await Promise.all([
          tx.get(ref), tx.get(db.collection("products").doc(produtoId)),
          tx.get(db.collection("customers").doc(custId)),
        ]);
        if (!snap.exists) throw new ErroVinculo("Registre o anúncio antes de identificar o cliente.", 404);
        validarProduto(produto.data(), cliente.data(), identidade.mkt, custId);
        const atual = snap.data();
        if (atual.status === "confirmado") {
          if (atual.custId !== custId || atual.produtoId !== produtoId)
            throw new ErroVinculo("Este anúncio já tem um vínculo confirmado. Não é possível trocar seu dono por aqui.", 409);
          return atual;
        }
        const data = { ...atual, status: "confirmado", custId, produtoId,
          custNome: cliente.data().name || "", produtoNome: produto.data().nome || "",
          confirmadoEm: agora(), confirmadoPor: { uid, emNomeDe: custId } };
        tx.set(ref, data);
        return data;
      });
    },
    // Os futuros adaptadores devem chamar isto antes de distribuir qualquer
    // anúncio/venda. Vínculo ausente ou produto alterado devolve pendência.
    async resolver(entrada) {
      const identidade = identidadeAnuncio(entrada);
      return db.runTransaction(async tx => {
        const snap = await tx.get(colecao.doc(identidade.id));
        const vinculo = snap.data();
        if (!vinculo || vinculo.status !== "confirmado") return { status: "pendente" };
        const [produto, cliente] = await Promise.all([
          tx.get(db.collection("products").doc(vinculo.produtoId)),
          tx.get(db.collection("customers").doc(vinculo.custId)),
        ]);
        try { validarProduto(produto.data(), cliente.data(), identidade.mkt, vinculo.custId); }
        catch (e) { if (e instanceof ErroVinculo) return { status: "pendente" }; throw e; }
        return { status: "confirmado", custId: vinculo.custId, produtoId: vinculo.produtoId };
      });
    },
  };
}
