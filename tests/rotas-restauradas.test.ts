import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { AuditLog, Avaliacao, Usuario } from "../src/entities";
import {
  auth,
  criarEstabelecimento,
  criarUsuario,
  emailMock,
  fecharBanco,
  limparBanco,
  prepararBanco,
  resetarMocks,
  tokenAdmin,
} from "./helpers";

beforeAll(prepararBanco);
afterAll(fecharBanco);
beforeEach(async () => {
  await limparBanco();
  resetarMocks();
});

const admin = () => auth(tokenAdmin());
const esperar = () => new Promise((r) => setTimeout(r, 50));

describe("POST /api/auth/resend-confirmation (público)", () => {
  it("gera novo token e envia e-mail para conta pendente (por username ou e-mail)", async () => {
    const { usuario } = await criarUsuario({ enabled: false, username: "novo", email: "novo@teste.com" });
    for (const identificador of ["novo", "novo@teste.com"]) {
      emailMock.sendConfirmationEmail.mockClear();
      const res = await request(app).post("/api/auth/resend-confirmation").send({ username: identificador });
      expect(res.status).toBe(200);
      await usuario.reload();
      expect(emailMock.sendConfirmationEmail).toHaveBeenCalledWith("novo@teste.com", usuario.confirmationToken);
    }
  });

  it("responde igual para conta inexistente, já confirmada e pendente (não revela cadastros)", async () => {
    await criarUsuario({ enabled: true, username: "ativo" });
    await criarUsuario({ enabled: false, username: "pendente" });
    const respostas = [];
    for (const username of ["fantasma", "ativo", "pendente"]) {
      respostas.push(await request(app).post("/api/auth/resend-confirmation").send({ username }));
    }
    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(respostas[0].body).toEqual(respostas[1].body);
    expect(respostas[1].body).toEqual(respostas[2].body);
  });

  it("não envia e-mail para conta já confirmada nem inexistente", async () => {
    await criarUsuario({ enabled: true, username: "ativo" });
    await request(app).post("/api/auth/resend-confirmation").send({ username: "ativo" });
    await request(app).post("/api/auth/resend-confirmation").send({ username: "fantasma" });
    expect(emailMock.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("exige o identificador", async () => {
    expect((await request(app).post("/api/auth/resend-confirmation").send({})).status).toBe(400);
    expect((await request(app).post("/api/auth/resend-confirmation").send({ username: { $ne: "" } })).status).toBe(400);
  });

  it("falha de SMTP não vaza erro nem revela a conta", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await criarUsuario({ enabled: false, username: "pendente" });
    emailMock.sendConfirmationEmail.mockRejectedValue(new Error("SMTP interno"));
    const res = await request(app).post("/api/auth/resend-confirmation").send({ username: "pendente" });
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("SMTP interno");
  });

  it("o token novo ativa a conta", async () => {
    const { usuario } = await criarUsuario({ enabled: false, username: "pendente" });
    await request(app).post("/api/auth/resend-confirmation").send({ username: "pendente" });
    await usuario.reload();
    const res = await request(app).get(`/api/auth/confirm-account?token=${usuario.confirmationToken}`);
    expect(res.status).toBe(200);
    expect((await Usuario.findByPk(usuario.usuarioId))?.enabled).toBe(true);
  });
});

describe("GET /api/admin/estabelecimento/:id", () => {
  it("exige admin", async () => {
    expect((await request(app).get("/api/admin/estabelecimento/1")).status).toBe(401);
    const { token } = await criarUsuario();
    expect((await request(app).get("/api/admin/estabelecimento/1").set(auth(token))).status).toBe(401);
  });

  it("devolve os dados completos com o dono, e registra auditoria", async () => {
    const dono = await criarUsuario({ username: "dona" });
    const est = await criarEstabelecimento(dono.usuario.usuarioId);
    const res = await request(app).get(`/api/admin/estabelecimento/${est.estabelecimentoId}`).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.cpfResponsavel).toBe(est.cpfResponsavel);
    expect(res.body.usuario.username).toBe("dona");
    expect(JSON.stringify(res.body)).not.toContain("password");
    await esperar();
    expect(await AuditLog.count({ where: { acao: "consultar_estabelecimento" } })).toBe(1);
  });

  it("inexistente dá 404", async () => {
    expect((await request(app).get("/api/admin/estabelecimento/99999").set(admin())).status).toBe(404);
  });
});

describe("GET /api/admin/users/:id/interacoes", () => {
  it("exige admin", async () => {
    expect((await request(app).get("/api/admin/users/1/interacoes")).status).toBe(401);
  });

  it("lista os MEIs do usuário e as avaliações/respostas dele no formato do front", async () => {
    const alvo = await criarUsuario();
    const dono = await criarUsuario({ nomeCompleto: "Dono Da Loja" });
    const meu = await criarEstabelecimento(alvo.usuario.usuarioId, { nomeFantasia: "Meu MEI", status: "ativo" });
    await criarEstabelecimento(alvo.usuario.usuarioId, { nomeFantasia: "Pendente", status: "pendente_aprovacao" });
    await criarEstabelecimento(alvo.usuario.usuarioId, { nomeFantasia: "Rejeitado", status: "rejeitado" });
    const alheio = await criarEstabelecimento(dono.usuario.usuarioId, { nomeFantasia: "Loja Alheia" });

    const pai = await Avaliacao.create({ nota: 5, comentario: "Do dono", usuarioId: dono.usuario.usuarioId, estabelecimentoId: alheio.estabelecimentoId } as any);
    await Avaliacao.create({ nota: 4, comentario: "Minha avaliação", usuarioId: alvo.usuario.usuarioId, estabelecimentoId: meu.estabelecimentoId } as any);
    await Avaliacao.create({ nota: null, comentario: "Minha resposta", usuarioId: alvo.usuario.usuarioId, estabelecimentoId: alheio.estabelecimentoId, parentId: pai.avaliacoesId } as any);

    const res = await request(app).get(`/api/admin/users/${alvo.usuario.usuarioId}/interacoes`).set(admin());
    expect(res.status).toBe(200);

    expect(res.body.estabelecimentos.map((e: any) => [e.nome, e.status]).sort()).toEqual([
      ["Meu MEI", "Ativo"],
      ["Pendente", "Pendente"],
      ["Rejeitado", "Inativo"],
    ]);
    expect(res.body.estabelecimentos[0]).toHaveProperty("cnpj");

    expect(res.body.avaliacoes).toHaveLength(2);
    const resposta = res.body.avaliacoes.find((a: any) => a.isReply);
    expect(resposta).toMatchObject({
      estabelecimento: "Loja Alheia",
      texto: "Minha resposta",
      parentTexto: "Do dono",
      parentAutor: "Dono Da Loja",
    });
    const principal = res.body.avaliacoes.find((a: any) => !a.isReply);
    expect(principal).toMatchObject({ nota: 4, texto: "Minha avaliação", estabelecimento: "Meu MEI", isReply: false });
    // Nada de outros usuários nas avaliações.
    expect(res.text).not.toContain(dono.usuario.email);
  });

  it("usuário sem atividade devolve listas vazias; inexistente ou id inválido dá 404", async () => {
    const { usuario } = await criarUsuario();
    const vazio = await request(app).get(`/api/admin/users/${usuario.usuarioId}/interacoes`).set(admin());
    expect(vazio.body).toEqual({ estabelecimentos: [], avaliacoes: [] });
    expect((await request(app).get("/api/admin/users/99999/interacoes").set(admin())).status).toBe(404);
    expect((await request(app).get("/api/admin/users/abc/interacoes").set(admin())).status).toBe(404);
  });

  it("registra auditoria da consulta", async () => {
    const { usuario } = await criarUsuario();
    await request(app).get(`/api/admin/users/${usuario.usuarioId}/interacoes`).set(admin());
    await esperar();
    expect(await AuditLog.count({ where: { acao: "consultar_interacoes_usuario" } })).toBe(1);
  });
});
