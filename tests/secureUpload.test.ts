import express from "express";
import fs from "fs";
import path from "path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { receberArquivos, uploadSeguro } from "../src/utils/secureUpload";
import { htmlMalicioso, pdfFalso, pngReal } from "./helpers";

const DESTINO = path.resolve(process.cwd(), "tests", ".tmp-destino");
const TMP = path.resolve(process.cwd(), "uploads-tmp");

const app = express();
app.post(
  "/up",
  ...receberArquivos(
    uploadSeguro.fields([{ name: "file" }, { name: "ccmei" }]),
    { camposPdf: ["ccmei"], moverPara: DESTINO },
  ),
  (req, res) => res.json(req.files),
);

const arquivosNoDestino = () =>
  fs.existsSync(DESTINO) ? fs.readdirSync(DESTINO) : [];
const arquivosNoTmp = () => (fs.existsSync(TMP) ? fs.readdirSync(TMP) : []);

beforeAll(() => fs.rmSync(DESTINO, { recursive: true, force: true }));
afterAll(() => fs.rmSync(DESTINO, { recursive: true, force: true }));

describe("upload seguro", () => {
  it("rejeita HTML com 415 e não deixa resíduo", async () => {
    const res = await request(app)
      .post("/up")
      .attach("file", htmlMalicioso(), "a.html");
    expect(res.status).toBe(415);
    expect(arquivosNoDestino()).toHaveLength(0);
    expect(arquivosNoTmp()).toHaveLength(0);
  });

  it("rejeita HTML disfarçado de .jpg", async () => {
    const res = await request(app)
      .post("/up")
      .attach("file", htmlMalicioso(), "foto.jpg");
    expect(res.status).toBe(415);
    expect(arquivosNoDestino()).toHaveLength(0);
  });

  it("rejeita PDF fora do campo ccmei", async () => {
    const res = await request(app)
      .post("/up")
      .attach("file", pdfFalso(), "d.pdf");
    expect(res.status).toBe(415);
  });

  it("aceita PDF no campo ccmei com extensão .pdf definida pelo servidor", async () => {
    const res = await request(app)
      .post("/up")
      .attach("ccmei", pdfFalso(), "qualquer.exe");
    expect(res.status).toBe(200);
    expect(res.body.ccmei[0].filename).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(arquivosNoDestino()).toHaveLength(1);
  });

  it("aceita PNG enviado como .jpg e grava como .webp", async () => {
    const res = await request(app)
      .post("/up")
      .attach("file", await pngReal(), "x.jpg");
    expect(res.status).toBe(200);
    expect(res.body.file[0].filename).toMatch(/\.webp$/);
    expect(res.body.file[0].mimetype).toBe("image/webp");
  });

  it("não usa o nome enviado pelo cliente", async () => {
    const res = await request(app)
      .post("/up")
      .attach("file", await pngReal(), "../../etc/passwd.png");
    expect(res.status).toBe(200);
    expect(res.body.file[0].filename).not.toContain("passwd");
    expect(res.body.file[0].path.startsWith(DESTINO)).toBe(true);
  });

  it("rejeita arquivo acima do limite com 413", async () => {
    const grande = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await request(app).post("/up").attach("file", grande, "g.jpg");
    expect(res.status).toBe(413);
    expect(arquivosNoTmp()).toHaveLength(0);
  });
});
