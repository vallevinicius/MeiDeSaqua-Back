import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { Usuario } from "../src/entities";
import {
  criarUsuario,
  emailMock,
  fecharBanco,
  limparBanco,
  prepararBanco,
  resetarMocks,
} from "./helpers";

beforeAll(prepararBanco);
afterAll(fecharBanco);
beforeEach(async () => {
  await limparBanco();
  resetarMocks();
});

const novoCadastro = (extra: Record<string, any> = {}) => ({
  nomeCompleto: "Maria Silva",
  username: "maria",
  email: "maria@teste.com",
  password: "senha123",
  ...extra,
});

describe("POST /api/auth/cadastro", () => {
  it("cria usuário desabilitado, com senha criptografada, e envia e-mail de confirmação", async () => {
    const res = await request(app).post("/api/auth/cadastro").send(novoCadastro());
    expect(res.status).toBe(201);

    const usuario = await Usuario.findOne({ where: { username: "maria" } });
    expect(usuario?.enabled).toBe(false);
    expect(usuario?.password).not.toBe("senha123");
    expect(await bcrypt.compare("senha123", usuario!.password)).toBe(true);
    expect(usuario?.confirmationToken).toBeTruthy();
    expect(emailMock.sendConfirmationEmail).toHaveBeenCalledWith(
      "maria@teste.com",
      usuario!.confirmationToken,
    );
  });

  it("não devolve a senha na resposta", async () => {
    const res = await request(app).post("/api/auth/cadastro").send(novoCadastro());
    expect(JSON.stringify(res.body)).not.toContain("senha123");
  });

  it("recusa nome de usuário com palavrão", async () => {
    const res = await request(app)
      .post("/api/auth/cadastro")
      .send(novoCadastro({ username: "merda" }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/inapropriadas/);
  });

  it("recusa nome de usuário com emoji", async () => {
    const res = await request(app)
      .post("/api/auth/cadastro")
      .send(novoCadastro({ username: "maria😀" }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/emojis/);
  });

  it("recusa username já usado por conta ativa com 409", async () => {
    await criarUsuario({ username: "maria", email: "outra@teste.com" });
    const res = await request(app).post("/api/auth/cadastro").send(novoCadastro());
    expect(res.status).toBe(409);
  });

  it("recusa e-mail já usado por conta ativa com 409", async () => {
    await criarUsuario({ username: "outro", email: "maria@teste.com" });
    const res = await request(app).post("/api/auth/cadastro").send(novoCadastro());
    expect(res.status).toBe(409);
  });

  it("substitui cadastro anterior não confirmado do mesmo e-mail", async () => {
    await criarUsuario({ username: "antigo", email: "maria@teste.com", enabled: false });
    const res = await request(app).post("/api/auth/cadastro").send(novoCadastro());
    expect(res.status).toBe(201);
    expect(await Usuario.count({ where: { email: "maria@teste.com" } })).toBe(1);
    expect(await Usuario.count({ where: { username: "antigo" } })).toBe(0);
  });

  it("desfaz o cadastro se o e-mail de confirmação falhar", async () => {
    emailMock.sendConfirmationEmail.mockRejectedValue(new Error("SMTP fora"));
    const res = await request(app).post("/api/auth/cadastro").send(novoCadastro());
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Não foi possível concluir o cadastro/);
    expect(await Usuario.count()).toBe(0);
  });
});

describe("POST /api/auth/login", () => {
  it("entra com username: sessão em cookies httpOnly, sem token nem senha no corpo", async () => {
    const { usuario, senha } = await criarUsuario({ username: "ana" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ana", password: senha });
    expect(res.status).toBe(200);
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.tokenVersion).toBeUndefined();
    expect(res.body.token).toBeUndefined();
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const acesso = cookies.find((c) => c.startsWith("access_token="))!;
    expect(acesso).toMatch(/HttpOnly/i);
    const payload = jwt.verify(acesso.split(";")[0].split("=")[1], process.env.JWT_SECRET as string) as any;
    expect(payload.id).toBe(usuario.usuarioId);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("a resposta nunca traz senha nem tokens de uso único (o front guarda esse objeto)", async () => {
    const { usuario, senha } = await criarUsuario({ username: "ana" });
    await usuario.update({
      confirmationToken: "TOKEN-CONFIRMACAO",
      resetPasswordToken: "TOKEN-RESET",
      resetPasswordTokenExpiry: new Date(Date.now() + 60000),
      emailChangeToken: "TOKEN-TROCA-EMAIL",
      unconfirmedEmail: "outro@teste.com",
    });
    const res = await request(app).post("/api/auth/login").send({ username: "ana", password: senha });
    expect(res.status).toBe(200);
    for (const segredo of ["TOKEN-CONFIRMACAO", "TOKEN-RESET", "TOKEN-TROCA-EMAIL", usuario.password]) {
      expect(res.text).not.toContain(segredo);
    }
    // Nenhum campo sensível, mesmo que o modelo ganhe colunas novas.
    for (const proibido of ["password", "tokenVersion", "token_version", "confirmationToken", "resetPasswordToken", "resetPasswordTokenExpiry", "emailChangeToken"]) {
      expect(res.body.user).not.toHaveProperty(proibido);
    }
    for (const esperado of ["usuarioId", "username", "email", "nomeCompleto", "enabled"]) {
      expect(res.body.user).toHaveProperty(esperado);
    }
  });

  it("entra também com o e-mail", async () => {
    const { senha } = await criarUsuario({ email: "ana@teste.com" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ana@teste.com", password: senha });
    expect(res.status).toBe(200);
  });

  it("recusa senha errada com 401", async () => {
    await criarUsuario({ username: "ana" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "ana", password: "errada" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/inválidos/);
  });

  it("não diferencia usuário inexistente de senha errada", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "fantasma", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/inválidos/);
  });

  it("recusa conta não verificada com 401", async () => {
    const { senha } = await criarUsuario({ username: "novo", enabled: false });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "novo", password: senha });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/não foi verificada/);
  });

  it("exige usuário e senha", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/confirm-account", () => {
  it("ativa a conta e apaga o token", async () => {
    const { usuario } = await criarUsuario({ enabled: false });
    await usuario.update({ confirmationToken: "tok-123" });
    const res = await request(app).get("/api/auth/confirm-account?token=tok-123");
    expect(res.status).toBe(200);
    await usuario.reload();
    expect(usuario.enabled).toBe(true);
    expect(usuario.confirmationToken).toBeNull();
  });

  it("recusa token inválido", async () => {
    const res = await request(app).get("/api/auth/confirm-account?token=nao-existe");
    expect(res.status).toBe(400);
  });

  it("o token não pode ser reutilizado", async () => {
    const { usuario } = await criarUsuario({ enabled: false });
    await usuario.update({ confirmationToken: "tok-uso-unico" });
    await request(app).get("/api/auth/confirm-account?token=tok-uso-unico");
    const segunda = await request(app).get("/api/auth/confirm-account?token=tok-uso-unico");
    expect(segunda.status).toBe(400);
  });
});

describe("recuperação de senha", () => {
  it("responde igual para e-mail existente e inexistente (sem vazar contas)", async () => {
    await criarUsuario({ email: "real@teste.com" });
    const a = await request(app).post("/api/auth/forgot-password").send({ email: "real@teste.com" });
    const b = await request(app).post("/api/auth/forgot-password").send({ email: "nao@teste.com" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body).toEqual(b.body);
  });

  it("gera token com validade de 1h e envia e-mail só para conta existente", async () => {
    const { usuario } = await criarUsuario({ email: "real@teste.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "real@teste.com" });
    await request(app).post("/api/auth/forgot-password").send({ email: "nao@teste.com" });
    await usuario.reload();
    expect(usuario.resetPasswordToken).toBeTruthy();
    const minutos = (usuario.resetPasswordTokenExpiry!.getTime() - Date.now()) / 60000;
    expect(minutos).toBeGreaterThan(55);
    expect(minutos).toBeLessThanOrEqual(60);
    expect(emailMock.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it("falha de e-mail não vaza erro", async () => {
    await criarUsuario({ email: "real@teste.com" });
    emailMock.sendPasswordResetEmail.mockRejectedValue(new Error("SMTP"));
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "real@teste.com" });
    expect(res.status).toBe(200);
  });

  it("redefine a senha com token válido e depois entra com a nova", async () => {
    const { usuario } = await criarUsuario({ username: "ana" });
    await usuario.update({
      resetPasswordToken: "reset-1",
      resetPasswordTokenExpiry: new Date(Date.now() + 60_000),
    });
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "reset-1", newPassword: "NovaSenha1" });
    expect(res.status).toBe(200);
    await usuario.reload();
    expect(usuario.resetPasswordToken).toBeNull();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ username: "ana", password: "NovaSenha1" });
    expect(login.status).toBe(200);
  });

  it("recusa token expirado", async () => {
    const { usuario } = await criarUsuario();
    await usuario.update({
      resetPasswordToken: "reset-velho",
      resetPasswordTokenExpiry: new Date(Date.now() - 1000),
    });
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "reset-velho", newPassword: "x12345" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expirado/);
  });

  it("recusa token inexistente", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "nada", newPassword: "x12345" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/confirm-email-change", () => {
  it("troca o e-mail pelo pendente e limpa os tokens", async () => {
    const { usuario } = await criarUsuario({ email: "velho@teste.com" });
    await usuario.update({ unconfirmedEmail: "novo@teste.com", emailChangeToken: "chg-1" });
    const res = await request(app).get("/api/auth/confirm-email-change?token=chg-1");
    expect(res.status).toBe(200);
    await usuario.reload();
    expect(usuario.email).toBe("novo@teste.com");
    expect(usuario.unconfirmedEmail).toBeNull();
    expect(usuario.emailChangeToken).toBeNull();
  });

  it("recusa token inválido", async () => {
    const res = await request(app).get("/api/auth/confirm-email-change?token=nada");
    expect(res.status).toBe(400);
  });
});
