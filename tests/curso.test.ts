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
  limparBanco,
  limparUploads,
  pngReal,
  prepararBanco,
  resetarMocks,
  tokenAdmin,
} from "./helpers";

beforeAll(prepararBanco);
afterAll(fecharBanco);
beforeEach(async () => {
  await limparBanco();
  limparUploads();
  resetarMocks();
});

const admin = () => auth(tokenAdmin());

const criarCurso = async (nome = "Curso de Excel", extra: Record<string, string> = {}) =>
  request(app).post("/api/cursos").set(admin()).field("nome", nome).field("link", "https://exemplo.com").field(
    "ativo", "true",
  ).field(Object.keys(extra)[0] ?? "x", Object.values(extra)[0] ?? "");

describe("GET /api/cursos (público)", () => {
  it("lista vazia no início", async () => {
    const res = await request(app).get("/api/cursos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("lista os cursos criados com o formato esperado pelo front", async () => {
    await criarCurso("Excel");
    const res = await request(app).get("/api/cursos");
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ nome: "Excel", link: "https://exemplo.com", ativo: true });
    expect(res.body[0].id).toBe(res.body[0].cursoId);
  });
});

describe("permissões", () => {
  it.each([
    ["post", "/api/cursos"],
    ["put", "/api/cursos/1"],
    ["delete", "/api/cursos/1"],
  ])("%s %s exige admin", async (metodo, rota) => {
    const { token } = await criarUsuario();
    const semToken = await (request(app) as any)[metodo](rota);
    const comoUsuario = await (request(app) as any)[metodo](rota).set(auth(token));
    expect(semToken.status).toBe(401);
    expect(comoUsuario.status).toBe(401);
  });
});

describe("POST /api/cursos", () => {
  it("cria curso sem imagem", async () => {
    const res = await request(app).post("/api/cursos").set(admin()).field("nome", "Marketing");
    expect(res.status).toBe(201);
    expect(res.body.nome).toBe("Marketing");
  });

  it("aceita os apelidos de campo name e titulo", async () => {
    const a = await request(app).post("/api/cursos").set(admin()).field("name", "Por name");
    const b = await request(app).post("/api/cursos").set(admin()).field("titulo", "Por titulo");
    expect(a.body.nome).toBe("Por name");
    expect(b.body.nome).toBe("Por titulo");
  });

  it("exige nome", async () => {
    const res = await request(app).post("/api/cursos").set(admin()).field("link", "x");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nome/);
  });

  it("grava a imagem validada em /uploads e ela é servida", async () => {
    const res = await request(app)
      .post("/api/cursos")
      .set(admin())
      .field("nome", "Com imagem")
      .attach("file", await pngReal(), "capa.png");
    expect(res.status).toBe(201);
    expect(res.body.imagemUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    expect(fs.existsSync(path.resolve(res.body.imagemUrl.slice(1)))).toBe(true);

    const servida = await request(app).get(res.body.imagemUrl);
    expect(servida.status).toBe(200);
    expect(servida.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("recusa HTML como imagem e não cria o curso", async () => {
    const res = await request(app)
      .post("/api/cursos")
      .set(admin())
      .field("nome", "Malicioso")
      .attach("file", htmlMalicioso(), "capa.html");
    expect(res.status).toBe(415);
    const lista = await request(app).get("/api/cursos");
    expect(lista.body).toHaveLength(0);
  });
});

describe("PUT /api/cursos/:id", () => {
  it("atualiza o nome", async () => {
    const criado = await request(app).post("/api/cursos").set(admin()).field("nome", "Velho");
    const res = await request(app).put(`/api/cursos/${criado.body.id}`).set(admin()).field("nome", "Novo");
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe("Novo");
  });

  it("troca a imagem", async () => {
    const criado = await request(app).post("/api/cursos").set(admin()).field("nome", "C");
    const res = await request(app)
      .put(`/api/cursos/${criado.body.id}`)
      .set(admin())
      .attach("file", await pngReal(), "nova.png");
    expect(res.status).toBe(200);
    expect(res.body.imagemUrl).toMatch(/\.webp$/);
  });

  it("id inexistente dá 404 e id inválido dá 400", async () => {
    const inexistente = await request(app).put("/api/cursos/99999").set(admin()).field("nome", "x");
    const invalido = await request(app).put("/api/cursos/abc").set(admin()).field("nome", "x");
    expect(inexistente.status).toBe(404);
    expect(invalido.status).toBe(400);
  });
});

describe("DELETE /api/cursos/:id", () => {
  it("remove (204) e some da lista", async () => {
    const criado = await request(app).post("/api/cursos").set(admin()).field("nome", "Apagar");
    const res = await request(app).delete(`/api/cursos/${criado.body.id}`).set(admin());
    expect(res.status).toBe(204);
    expect((await request(app).get("/api/cursos")).body).toHaveLength(0);
  });

  it("inexistente dá 404 e id inválido dá 400", async () => {
    expect((await request(app).delete("/api/cursos/99999").set(admin())).status).toBe(404);
    expect((await request(app).delete("/api/cursos/abc").set(admin())).status).toBe(400);
  });
});
