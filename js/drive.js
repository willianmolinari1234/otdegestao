// Link do Google Drive → endereço que funciona dentro de um <img>.
//
// Por que existe: o link que a pessoa copia do Drive é o de compartilhamento
// (https://drive.google.com/file/d/<id>/view). Esse endereço devolve uma
// PÁGINA, não o arquivo — dentro de um <img src> ele quebra mesmo quando o
// arquivo está público. O que carrega em <img> é derivar o id do arquivo e
// montar https://drive.google.com/thumbnail?id=<id>.
//
// Formatos que aparecem na prática (todos já vistos em links colados por
// cliente):
//   https://drive.google.com/file/d/<id>/view?usp=sharing
//   https://drive.google.com/file/d/<id>/preview
//   https://drive.google.com/open?id=<id>
//   https://drive.google.com/uc?export=view&id=<id>
//   https://drive.google.com/thumbnail?id=<id>&sz=w1000
//   https://lh3.googleusercontent.com/d/<id>
//
// Link de PASTA (/drive/folders/<id>) não aponta para arquivo nenhum:
// devolve null de propósito, e a tela mostra só o link "abrir pasta".

const ID = "[A-Za-z0-9_-]{20,}";

// Extrai o id do arquivo, ou null quando o link é de pasta / não reconhecido.
export function idArquivoDrive(link) {
  const s = String(link || "").trim();
  if (!s) return null;
  if (/\/drive\/folders\//.test(s)) return null;
  const m =
    s.match(new RegExp("/file/d/(" + ID + ")")) ||
    s.match(new RegExp("[?&]id=(" + ID + ")")) ||
    s.match(new RegExp("/d/(" + ID + ")")) ||
    s.match(new RegExp("^(" + ID + ")$"));
  return m ? m[1] : null;
}

// Endereço para usar em <img src>. `largura` vira o parâmetro sz=w<largura>.
// null quando não dá para derivar um arquivo (ex.: link de pasta).
export function urlImagemDrive(link, largura = 1000) {
  const id = idArquivoDrive(link);
  return id ? "https://drive.google.com/thumbnail?id=" + id + "&sz=w" + largura : null;
}

// Endereço para o botão "abrir no Drive". Sempre a página de visualização
// quando há id; senão devolve o link original (pode ser uma pasta) ou null.
export function urlAbrirDrive(link) {
  const id = idArquivoDrive(link);
  if (id) return "https://drive.google.com/file/d/" + id + "/view";
  const s = String(link || "").trim();
  return s || null;
}
