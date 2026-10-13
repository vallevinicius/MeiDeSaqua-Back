import fs from "fs";
import path from "path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  auth,
  criarUsuario,
  fecharBanco,
  htmlMalicioso,
  jpegReal,
  limparUploads,
  pdfFalso,
  pngReal,
  prepararBanco,
} from "./helpers";

beforeAll(prepararBanco);
afterAll(fecharBanco);
beforeEach(limparUploads);

const existe = (url: string) => fs.existsSync(path.resolve(url.replace(/^\//, "")));

describe("POST /api/files/upload", () => {
  it("exige login", async () => {
    const res = await request(app).post("/api/files/upload").attach("file", await pngReal(), "a.png");
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.resolve("uploads"))).toBe(false);
  });

  it("grava imagem como webp com nome do servidor e devolve a URL", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", await pngReal(), "../../a.png");
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    expect(existe(res.body.url)).toBe(true);
  });

  it("aceita qualquer nome de campo (o front antigo usa variações)", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("imagem", await jpegReal(), "a.jpg");
    expect(res.status).toBe(200);
  });

  it("a imagem gravada é servida com cabeçalhos seguros", async () => {
    const { token } = await criarUsuario();
    const up = await request(app).post("/api/files/upload").set(auth(token)).attach("file", await pngReal(), "a.png");
    const res = await request(app).get(up.body.url);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-disposition"]).toBeUndefined();
  });

  it.each([
    ["HTML", () => htmlMalicioso(), "a.html"],
    ["HTML com extensão de imagem", () => htmlMalicioso(), "a.png"],
    ["SVG", () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), "a.svg"],
    ["executável", () => Buffer.from("MZ\x90\x00"), "a.exe"],
    ["script shell", () => Buffer.from("#!/bin/sh\nrm -rf /"), "a.sh"],
    ["PDF (só vale para CCMEI)", () => pdfFalso(), "a.pdf"],
    ["arquivo vazio", () => Buffer.alloc(0), "a.png"],
  ])("recusa %s com 415 e sem resíduo", async (_nome, conteudo, arquivo) => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", conteudo(), arquivo);
    expect([400, 415]).toContain(res.status);
    const publicos = fs.existsSync("uploads") ? fs.readdirSync("uploads") : [];
    expect(publicos).toHaveLength(0);
    expect(fs.readdirSync("uploads-tmp")).toHaveLength(0);
  });

  it("sem arquivo dá 400", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token));
    expect(res.status).toBe(400);
  });

  it("imagem corrompida com assinatura válida é recusada", async () => {
    const { token } = await criarUsuario();
    const corrompida = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("lixo qualquer")]);
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", corrompida, "a.jpg");
    expect(res.status).toBe(415);
    expect(fs.readdirSync("uploads-tmp")).toHaveLength(0);
  });
});

describe("POST /api/files/upload-multiple", () => {
  it("exige login", async () => {
    const res = await request(app).post("/api/files/upload-multiple");
    expect(res.status).toBe(401);
  });

  it("grava várias imagens", async () => {
    const { token } = await criarUsuario();
    const res = await request(app)
      .post("/api/files/upload-multiple")
      .set(auth(token))
      .attach("files", await pngReal(), "a.png")
      .attach("files", await jpegReal(), "b.jpg");
    expect(res.status).toBe(200);
    expect(res.body.urls).toHaveLength(2);
    for (const url of res.body.urls) expect(existe(url)).toBe(true);
  });

  it("se um arquivo é inválido, nenhum é gravado", async () => {
    const { token } = await criarUsuario();
    const res = await request(app)
      .post("/api/files/upload-multiple")
      .set(auth(token))
      .attach("files", await pngReal(), "a.png")
      .attach("files", htmlMalicioso(), "b.html");
    expect(res.status).toBe(415);
    const publicos = fs.existsSync("uploads") ? fs.readdirSync("uploads") : [];
    expect(publicos).toHaveLength(0);
  });
});

describe("/uploads", () => {
  const dir = () => path.resolve("uploads");

  it.each([
    ["a.html", "text/html"],
    ["a.svg", "image/svg+xml"],
    ["a.js", "text/javascript"],
  ])("arquivo antigo %s é entregue como download inerte", async (nome) => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), nome), "<script>alert(1)</script>");
    const res = await request(app).get(`/uploads/${nome}`);
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
  });

  it("PDF antigo é entregue como download com tipo correto", async () => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), "a.pdf"), pdfFalso());
    const res = await request(app).get("/uploads/a.pdf");
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe("attachment");
  });

  it("não lista diretório nem serve arquivos ocultos", async () => {
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), ".segredo"), "x");
    expect((await request(app).get("/uploads/")).status).toBe(404);
    expect((await request(app).get("/uploads/.segredo")).status).toBe(404);
  });

  it("não sai da pasta com ../", async () => {
    fs.writeFileSync(path.resolve("fora.txt"), "segredo");
    const res = await request(app).get("/uploads/..%2Ffora.txt");
    expect(res.status).not.toBe(200);
  });

  it("a pasta privada não é servida por /uploads", async () => {
    fs.mkdirSync(path.resolve("uploads-privados"), { recursive: true });
    fs.writeFileSync(path.resolve("uploads-privados", "ccmei.pdf"), pdfFalso());
    const res = await request(app).get("/uploads-privados/ccmei.pdf");
    expect(res.status).toBe(404);
    const res2 = await request(app).get("/uploads/ccmei.pdf");
    expect(res2.status).toBe(404);
  });
});
