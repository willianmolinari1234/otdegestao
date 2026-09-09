// Testes da normalização de link do Google Drive (fase 6, item 3).
//
// Cada formato aqui é um jeito real de o link chegar colado por um cliente.
// O caso que motiva o item: o link de compartilhamento cru (/file/d/<id>/view)
// quebra dentro de um <img> mesmo com o arquivo público — tem que virar
// /thumbnail?id=<id>.

import { test } from "node:test";
import assert from "node:assert/strict";
import { idArquivoDrive, urlImagemDrive, urlAbrirDrive } from "../js/drive.js";

const ID = "1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUvWx";

// ─── idArquivoDrive ───────────────────────────────────────────────────
test("extrai o id dos formatos que aparecem na prática", () => {
  const casos = [
    `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
    `https://drive.google.com/file/d/${ID}/view`,
    `https://drive.google.com/file/d/${ID}/preview`,
    `https://drive.google.com/open?id=${ID}`,
    `https://drive.google.com/uc?export=view&id=${ID}`,
    `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`,
    `https://lh3.googleusercontent.com/d/${ID}`,
    ID,
  ];
  for (const c of casos) assert.equal(idArquivoDrive(c), ID, c);
});

test("link de pasta não tem arquivo: devolve null", () => {
  assert.equal(idArquivoDrive("https://drive.google.com/drive/folders/1Nyy"), null);
  assert.equal(idArquivoDrive("https://drive.google.com/drive/folders/" + ID), null);
});

test("vazio, nulo e lixo devolvem null", () => {
  assert.equal(idArquivoDrive(""), null);
  assert.equal(idArquivoDrive(null), null);
  assert.equal(idArquivoDrive(undefined), null);
  assert.equal(idArquivoDrive("https://exemplo.com/foto.jpg"), null);
  assert.equal(idArquivoDrive("bla bla"), null);
});

test("espaço em volta do link não atrapalha", () => {
  assert.equal(idArquivoDrive(`  https://drive.google.com/file/d/${ID}/view  `), ID);
});

// ─── urlImagemDrive ───────────────────────────────────────────────────
test("monta o endereço de imagem a partir do id", () => {
  assert.equal(
    urlImagemDrive(`https://drive.google.com/file/d/${ID}/view`),
    `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`,
  );
});

test("largura personalizada vira sz=w<largura>", () => {
  assert.equal(
    urlImagemDrive(`https://drive.google.com/open?id=${ID}`, 400),
    `https://drive.google.com/thumbnail?id=${ID}&sz=w400`,
  );
});

test("link cru e link já normalizado dão o mesmo endereço de imagem", () => {
  const cru = `https://drive.google.com/file/d/${ID}/view?usp=drive_link`;
  const norm = `https://drive.google.com/thumbnail?id=${ID}&sz=w1000`;
  assert.equal(urlImagemDrive(cru), urlImagemDrive(norm));
});

test("pasta e lixo não viram imagem", () => {
  assert.equal(urlImagemDrive("https://drive.google.com/drive/folders/1Nyy"), null);
  assert.equal(urlImagemDrive("sem link"), null);
  assert.equal(urlImagemDrive(""), null);
});

// ─── urlAbrirDrive ────────────────────────────────────────────────────
test("abrir no Drive: sempre a página de visualização quando há id", () => {
  assert.equal(
    urlAbrirDrive(`https://drive.google.com/uc?export=view&id=${ID}`),
    `https://drive.google.com/file/d/${ID}/view`,
  );
});

test("abrir no Drive: sem id, devolve o link original (ex.: pasta)", () => {
  const pasta = "https://drive.google.com/drive/folders/1Nyy";
  assert.equal(urlAbrirDrive(pasta), pasta);
  assert.equal(urlAbrirDrive(""), null);
});
