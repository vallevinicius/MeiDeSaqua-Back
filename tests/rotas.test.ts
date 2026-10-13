import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { criarUsuario, fecharBanco, htmlMalicioso, limparBanco, prepararBanco } from "./helpers";

beforeAll(async () => {
  await prepararBanco();
  await limparBanco();
});
afterAll(fecharBanco);

describe("rotas protegidas respondem 401 sem token", () => {
  it.each([
    ["post", "/api/estabelecimentos/1/status"],
    ["post", "/api/estabelecimentos"],
    ["put", "/api/estabelecimentos/solicitar-atualizacao"],
    ["post", "/api/estabelecimentos/solicitar-exclusao"],
    ["post", "/api/files/upload"],
    ["post", "/api/files/upload-multiple"],
    ["get", "/api/admin/estabelecimento/1/ccmei"],
    ["get", "/api/admin/pending"],
    ["get", "/api/admin/users"],
    ["post", "/api/cursos"],
  ])("%s %s", async (metodo, rota) => {
    const res = await (request(app) as any)[metodo](rota);
    expect(res.status).toBe(401);
  });

  it("token de usuário comum não acessa rota de admin", async () => {
    const { token } = await criarUsuario();
    const res = await request(app)
      .get("/api/admin/pending")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("upload autenticado de HTML é recusado com 415", async () => {
    const { token } = await criarUsuario();
    const res = await request(app)
      .post("/api/files/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", htmlMalicioso(), "a.html");
    expect(res.status).toBe(415);
  });
});

describe("/uploads é servido de forma inerte", () => {
  const dir = path.resolve(process.cwd(), "uploads");
  const arquivo = path.join(dir, "teste-inerte.html");

  afterAll(() => fs.rmSync(arquivo, { force: true }));

  it("força download e bloqueia execução de HTML", async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(arquivo, "<script>alert(1)</script>");
    const res = await request(app).get("/uploads/teste-inerte.html");
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
  });
});

describe("rate limit (limitadores reais, em app isolado)", () => {
  const carregar = () =>
    vi.importActual<typeof import("../src/middlewares/rateLimit.middleware")>(
      "../src/middlewares/rateLimit.middleware",
    );

  const appCom = (limite: any) => {
    const mini = express();
    mini.post("/x", limite, (_req, res) => res.json({ ok: true }));
    return mini;
  };

  const disparar = async (mini: express.Express, vezes: number) => {
    const status: number[] = [];
    for (let i = 0; i < vezes; i++) status.push((await request(mini).post("/x")).status);
    return status;
  };

  it("login: bloqueia a partir da 11ª tentativa", async () => {
    const { limiteLogin } = await carregar();
    const status = await disparar(appCom(limiteLogin), 12);
    expect(status.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(status.slice(10)).toEqual([429, 429]);
  });

  it("e-mail (recuperação de senha): bloqueia a partir da 6ª", async () => {
    const { limiteEmail } = await carregar();
    const status = await disparar(appCom(limiteEmail), 7);
    expect(status.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(status[5]).toBe(429);
  });

  it("cadastro: bloqueia a partir da 11ª", async () => {
    const { limiteCadastro } = await carregar();
    const status = await disparar(appCom(limiteCadastro), 11);
    expect(status[9]).toBe(200);
    expect(status[10]).toBe(429);
  });

  it("a resposta de bloqueio é JSON com mensagem e traz cabeçalhos do limite", async () => {
    const { limiteLogin } = await carregar();
    const mini = appCom(limiteLogin);
    await disparar(mini, 10);
    const res = await request(mini).post("/x");
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/Muitas requisições/);
    expect(res.headers["ratelimit"] ?? res.headers["ratelimit-policy"]).toBeDefined();
  });

  it("cada IP tem a sua contagem", async () => {
    const { limiteLogin } = await carregar();
    const mini = express();
    mini.set("trust proxy", 1);
    mini.post("/x", limiteLogin, (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 10; i++) await request(mini).post("/x").set("X-Forwarded-For", "1.1.1.1");
    const bloqueado = await request(mini).post("/x").set("X-Forwarded-For", "1.1.1.1");
    const outro = await request(mini).post("/x").set("X-Forwarded-For", "2.2.2.2");
    expect(bloqueado.status).toBe(429);
    expect(outro.status).toBe(200);
  });
});

describe("CORS", () => {
  it("libera só a origem configurada", async () => {
    const ok = await request(app)
      .get("/api/cursos")
      .set("Origin", "http://localhost:3300");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3300");

    const bloqueada = await request(app)
      .get("/api/cursos")
      .set("Origin", "https://site-malicioso.com");
    expect(bloqueada.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("a pré-verificação (OPTIONS) também respeita a lista", async () => {
    const ok = await request(app)
      .options("/api/auth/login")
      .set("Origin", "http://localhost:3300")
      .set("Access-Control-Request-Method", "POST");
    const ruim = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://site-malicioso.com")
      .set("Access-Control-Request-Method", "POST");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3300");
    expect(ruim.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("cabeçalhos de segurança (helmet)", () => {
  it("responde com cabeçalhos protetores e sem x-powered-by", async () => {
    const res = await request(app).get("/api/cursos");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-frame-options"]).toBeDefined();
  });

  it("imagens podem ser carregadas por outra origem (front em outro domínio)", async () => {
    const res = await request(app).get("/api/cursos");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

describe("limite de tamanho do corpo JSON", () => {
  it("recusa corpo acima de 2 MB com 413", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "a", password: "x".repeat(3 * 1024 * 1024) });
    expect(res.status).toBe(413);
  });
});
