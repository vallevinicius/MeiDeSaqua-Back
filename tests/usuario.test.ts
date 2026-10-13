import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { Avaliacao, Estabelecimento, Usuario } from "../src/entities";
import {
  auth,
  criarEstabelecimento,
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

describe("autenticação das rotas /api/users", () => {
  it.each([
    ["post", "/api/users/profile"],
    ["delete", "/api/users/profile"],
    ["put", "/api/users/password"],
    ["get", "/api/users/profile/estabelecimentos"],
    ["put", "/api/users/profile/estabelecimentos/1"],
  ])("%s %s exige token", async (metodo, rota) => {
    const res = await (request(app) as any)[metodo](rota);
    expect(res.status).toBe(401);
  });

  it("recusa token adulterado", async () => {
    const res = await request(app)
      .get("/api/users/profile/estabelecimentos")
      .set("Authorization", "Bearer abc.def.ghi");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/users/profile", () => {
  it("atualiza o nome completo e não devolve a senha", async () => {
    const { usuario, token } = await criarUsuario();
    const res = await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ nomeCompleto: "Novo Nome" });
    expect(res.status).toBe(200);
    expect(res.body.nomeCompleto).toBe("Novo Nome");
    expect(res.body.password).toBeUndefined();
    await usuario.reload();
    expect(usuario.nomeCompleto).toBe("Novo Nome");
  });

  it("a resposta não traz o token de confirmação do novo e-mail", async () => {
    const { token } = await criarUsuario({ email: "velho@teste.com" });
    const res = await request(app).post("/api/users/profile").set(auth(token)).send({ email: "novo@teste.com" });
    expect(res.status).toBe(200);
    expect(res.body.emailChangeToken).toBeUndefined();
    expect(res.body.confirmationToken).toBeUndefined();
    expect(res.body.resetPasswordToken).toBeUndefined();
    expect(res.body.tokenVersion).toBeUndefined();
    expect(res.body.unconfirmedEmail).toBe("novo@teste.com");
  });

  it("troca o username", async () => {
    const { token } = await criarUsuario({ username: "velho" });
    const res = await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ username: "novo" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("novo");
  });

  it("recusa username já em uso", async () => {
    await criarUsuario({ username: "ocupado" });
    const { token } = await criarUsuario({ username: "meu" });
    const res = await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ username: "ocupado" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/em uso/);
  });

  it("recusa username com palavrão", async () => {
    const { token } = await criarUsuario();
    const res = await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ username: "merda" });
    expect(res.status).toBe(400);
  });

  it("e-mail novo fica pendente de confirmação e o antigo continua valendo", async () => {
    const { usuario, token } = await criarUsuario({ email: "velho@teste.com" });
    const res = await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ email: "novo@teste.com" });
    expect(res.status).toBe(200);
    await usuario.reload();
    expect(usuario.email).toBe("velho@teste.com");
    expect(usuario.unconfirmedEmail).toBe("novo@teste.com");
    expect(emailMock.sendEmailChangeConfirmationEmail).toHaveBeenCalledWith(
      "novo@teste.com",
      usuario.emailChangeToken,
    );
  });

  it("recusa e-mail que já pertence a outra conta", async () => {
    await criarUsuario({ email: "ocupado@teste.com" });
    const { token } = await criarUsuario();
    const res = await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ email: "ocupado@teste.com" });
    expect(res.status).toBe(400);
    expect(emailMock.sendEmailChangeConfirmationEmail).not.toHaveBeenCalled();
  });

  it("não deixa alterar o perfil de outro usuário (usa sempre o id do token)", async () => {
    const { usuario: outro } = await criarUsuario({ nomeCompleto: "Outro" });
    const { token } = await criarUsuario();
    await request(app)
      .post("/api/users/profile")
      .set(auth(token))
      .send({ usuarioId: outro.usuarioId, nomeCompleto: "Invadido" });
    await outro.reload();
    expect(outro.nomeCompleto).toBe("Outro");
  });
});

describe("PUT /api/users/password", () => {
  it("troca a senha quando a atual está correta", async () => {
    const { usuario, token, senha } = await criarUsuario();
    const res = await request(app)
      .put("/api/users/password")
      .set(auth(token))
      .send({ currentPassword: senha, newPassword: "Nova12345" });
    expect(res.status).toBe(200);
    await usuario.reload();
    expect(await bcrypt.compare("Nova12345", usuario.password)).toBe(true);
  });

  it("recusa quando a senha atual está errada e mantém a antiga", async () => {
    const { usuario, token, senha } = await criarUsuario();
    const res = await request(app)
      .put("/api/users/password")
      .set(auth(token))
      .send({ currentPassword: "errada", newPassword: "Nova12345" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/atual/);
    await usuario.reload();
    expect(await bcrypt.compare(senha, usuario.password)).toBe(true);
  });
});

describe("DELETE /api/users/profile", () => {
  it("exclui a conta e as avaliações do usuário", async () => {
    const { usuario, token } = await criarUsuario();
    const { usuario: dono } = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuarioId);
    await Avaliacao.create({
      nota: 5,
      comentario: "ótimo",
      usuarioId: usuario.usuarioId,
      estabelecimentoId: est.estabelecimentoId,
    } as any);

    const res = await request(app).delete("/api/users/profile").set(auth(token));
    expect(res.status).toBe(200);
    expect(await Usuario.findByPk(usuario.usuarioId)).toBeNull();
    expect(await Avaliacao.count()).toBe(0);
  });

  it("depois de excluir a conta o token deixa de valer (401)", async () => {
    const { token } = await criarUsuario();
    await request(app).delete("/api/users/profile").set(auth(token));
    const res = await request(app).delete("/api/users/profile").set(auth(token));
    expect(res.status).toBe(401);
  });
});

describe("/api/users/profile/estabelecimentos", () => {
  it("lista só os estabelecimentos do próprio usuário, com dados completos", async () => {
    const { usuario, token } = await criarUsuario();
    const { usuario: outro } = await criarUsuario();
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Meu" });
    await criarEstabelecimento(outro.usuarioId, { nomeFantasia: "Alheio" });

    const res = await request(app)
      .get("/api/users/profile/estabelecimentos")
      .set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nomeFantasia).toBe("Meu");
    expect(res.body[0].cnpj).toBeTruthy();
  });

  it("pede atualização do próprio: vira pendente e guarda os dados", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await request(app)
      .put(`/api/users/profile/estabelecimentos/${est.estabelecimentoId}`)
      .set(auth(token))
      .send({ descricao: "Nova descrição" });
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("pendente_atualizacao");
    expect((est.dados_atualizacao as any).descricao).toBe("Nova descrição");
    expect(est.descricao).toBe("Descrição");
  });

  it("não deixa pedir atualização de estabelecimento alheio (404)", async () => {
    const { usuario: dono } = await criarUsuario();
    const { token } = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuarioId);
    const res = await request(app)
      .put(`/api/users/profile/estabelecimentos/${est.estabelecimentoId}`)
      .set(auth(token))
      .send({ descricao: "Hack" });
    expect(res.status).toBe(404);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("id não numérico dá 400", async () => {
    const { token } = await criarUsuario();
    const res = await request(app)
      .put("/api/users/profile/estabelecimentos/abc")
      .set(auth(token))
      .send({});
    expect(res.status).toBe(400);
  });
});
