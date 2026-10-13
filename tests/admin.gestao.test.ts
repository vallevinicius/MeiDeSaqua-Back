import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { AuditLog, Avaliacao, ContadorVisualizacao, Usuario } from "../src/entities";
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

describe("usuários (admin)", () => {
  it("lista todos sem senha nem tokens e registra auditoria", async () => {
    const { usuario } = await criarUsuario();
    await usuario.update({ confirmationToken: "seg1", resetPasswordToken: "seg2" });
    const res = await request(app).get("/api/admin/users").set(admin());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain("password");
    expect(texto).not.toContain("seg1");
    expect(texto).not.toContain("seg2");
    await esperar();
    expect(await AuditLog.count({ where: { acao: "listar_usuarios" } })).toBe(1);
  });

  it("atualiza nome, e-mail, username e habilitação", async () => {
    const { usuario } = await criarUsuario({ enabled: false });
    const res = await request(app)
      .put(`/api/admin/users/${usuario.usuarioId}`)
      .set(admin())
      .send({ nomeCompleto: "Novo", email: "novo@teste.com", username: "novo", enabled: true });
    expect(res.status).toBe(200);
    await usuario.reload();
    expect(usuario).toMatchObject({ nomeCompleto: "Novo", email: "novo@teste.com", username: "novo", enabled: true });
  });

  it("não altera a senha por esta rota", async () => {
    const { usuario, senha } = await criarUsuario();
    await request(app).put(`/api/admin/users/${usuario.usuarioId}`).set(admin()).send({ password: "invasor" });
    await usuario.reload();
    expect(await bcrypt.compare(senha, usuario.password)).toBe(true);
  });

  it("usuário inexistente dá 404", async () => {
    expect((await request(app).put("/api/admin/users/99999").set(admin()).send({})).status).toBe(404);
    expect((await request(app).delete("/api/admin/users/99999").set(admin())).status).toBe(404);
  });

  it("e-mail duplicado dá erro sem aplicar", async () => {
    await criarUsuario({ email: "ocupado@teste.com" });
    const { usuario } = await criarUsuario();
    const res = await request(app).put(`/api/admin/users/${usuario.usuarioId}`).set(admin()).send({ email: "ocupado@teste.com" });
    expect(res.status).toBe(500);
  });

  it("exclui o usuário com as avaliações dele e as respostas a elas", async () => {
    const alvo = await criarUsuario();
    const outro = await criarUsuario();
    const dono = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuario.usuarioId);
    const pai = await Avaliacao.create({ nota: 5, comentario: "x", usuarioId: alvo.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId } as any);
    await Avaliacao.create({ nota: null, comentario: "resp", usuarioId: outro.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId, parentId: pai.avaliacoesId } as any);
    await Avaliacao.create({ nota: 4, comentario: "de outro", usuarioId: outro.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId } as any);

    const res = await request(app).delete(`/api/admin/users/${alvo.usuario.usuarioId}`).set(admin());
    expect(res.status).toBe(200);
    expect(await Usuario.findByPk(alvo.usuario.usuarioId)).toBeNull();
    const restantes = await Avaliacao.findAll();
    expect(restantes.map((a) => a.comentario)).toEqual(["de outro"]);
  });

  describe("troca de senha", () => {
    it("define a nova senha e invalida tokens de recuperação", async () => {
      const { usuario } = await criarUsuario({ username: "ana" });
      await usuario.update({ resetPasswordToken: "t", resetPasswordTokenExpiry: new Date(Date.now() + 10000) });
      const res = await request(app).patch(`/api/admin/users/${usuario.usuarioId}/password`).set(admin()).send({ newPassword: "NovaSenha1" });
      expect(res.status).toBe(200);
      await usuario.reload();
      expect(await bcrypt.compare("NovaSenha1", usuario.password)).toBe(true);
      expect(usuario.resetPasswordToken).toBeNull();
      const login = await request(app).post("/api/auth/login").send({ username: "ana", password: "NovaSenha1" });
      expect(login.status).toBe(200);
    });

    it.each([undefined, "", "12345"])("recusa senha curta ou ausente (%s)", async (senha) => {
      const { usuario } = await criarUsuario();
      const res = await request(app).patch(`/api/admin/users/${usuario.usuarioId}/password`).set(admin()).send({ newPassword: senha });
      expect(res.status).toBe(400);
    });

    it("usuário inexistente dá 404", async () => {
      const res = await request(app).patch("/api/admin/users/99999/password").set(admin()).send({ newPassword: "123456" });
      expect(res.status).toBe(404);
    });
  });

  describe("reenvio de confirmação", () => {
    it("gera novo token e envia o link", async () => {
      const { usuario } = await criarUsuario({ enabled: false });
      const res = await request(app).post(`/api/admin/users/${usuario.usuarioId}/resend-confirmation`).set(admin());
      expect(res.status).toBe(200);
      await usuario.reload();
      expect(usuario.confirmationToken).toBeTruthy();
      expect(emailMock.sendGenericEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: usuario.email, html: expect.stringContaining(usuario.confirmationToken as string) }),
      );
    });

    it("conta já confirmada dá 400 e não envia e-mail", async () => {
      const { usuario } = await criarUsuario({ enabled: true });
      const res = await request(app).post(`/api/admin/users/${usuario.usuarioId}/resend-confirmation`).set(admin());
      expect(res.status).toBe(400);
      expect(emailMock.sendGenericEmail).not.toHaveBeenCalled();
    });

    it("inexistente dá 404 e falha de SMTP dá 500", async () => {
      expect((await request(app).post("/api/admin/users/99999/resend-confirmation").set(admin())).status).toBe(404);
      const { usuario } = await criarUsuario({ enabled: false });
      emailMock.sendGenericEmail.mockRejectedValue(new Error("SMTP"));
      expect((await request(app).post(`/api/admin/users/${usuario.usuarioId}/resend-confirmation`).set(admin())).status).toBe(500);
    });
  });
});

describe("avaliações (admin)", () => {
  it("lista as avaliações do estabelecimento com respostas", async () => {
    const dono = await criarUsuario();
    const autor = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuario.usuarioId);
    const pai = await Avaliacao.create({ nota: 5, comentario: "bom", usuarioId: autor.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId } as any);
    await Avaliacao.create({ nota: null, comentario: "obrigado", usuarioId: dono.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId, parentId: pai.avaliacoesId } as any);

    const res = await request(app).get(`/api/admin/avaliacoes/estabelecimento/${est.estabelecimentoId}`).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.estabelecimento.nomeFantasia).toBe(est.nomeFantasia);
    expect(res.body.avaliacoes).toHaveLength(1);
    expect(res.body.avaliacoes[0].respostas).toHaveLength(1);
  });

  it("estabelecimento inexistente dá 404", async () => {
    expect((await request(app).get("/api/admin/avaliacoes/estabelecimento/99999").set(admin())).status).toBe(404);
  });

  it("exclui avaliação; inexistente dá 404", async () => {
    const dono = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuario.usuarioId);
    const av = await Avaliacao.create({ nota: 1, comentario: "ruim", usuarioId: dono.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId } as any);
    expect((await request(app).delete(`/api/admin/avaliacoes/${av.avaliacoesId}`).set(admin())).status).toBe(200);
    expect(await Avaliacao.count()).toBe(0);
    expect((await request(app).delete("/api/admin/avaliacoes/99999").set(admin())).status).toBe(404);
  });
});

describe("GET /api/admin/exportar-estabelecimentos", () => {
  it("sem estabelecimentos ativos dá 404", async () => {
    const res = await request(app).get("/api/admin/exportar-estabelecimentos").set(admin());
    expect(res.status).toBe(404);
  });

  it("gera CSV só com ativos, escapando aspas, ponto e vírgula e quebras de linha", async () => {
    const dono = await criarUsuario();
    await criarEstabelecimento(dono.usuario.usuarioId, {
      nomeFantasia: 'Loja "Boa"; Centro',
      descricao: "linha1\nlinha2",
    });
    await criarEstabelecimento(dono.usuario.usuarioId, { nomeFantasia: "Pendente", status: "pendente_aprovacao" });

    const res = await request(app).get("/api/admin/exportar-estabelecimentos").set(admin());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("estabelecimentos_ativos_meidesaqua.csv");
    expect(res.text.split("\n")[0]).toContain("CPF Responsável");
    expect(res.text).toContain('"Loja ""Boa""; Centro"');
    expect(res.text).toContain('"linha1\nlinha2"');
    expect(res.text).not.toContain("Pendente");
  });

  it("registra auditoria da exportação", async () => {
    const dono = await criarUsuario();
    await criarEstabelecimento(dono.usuario.usuarioId);
    await request(app).get("/api/admin/exportar-estabelecimentos").set(admin());
    await esperar();
    expect(await AuditLog.count({ where: { acao: "exportar_estabelecimentos" } })).toBe(1);
  });
});

describe("GET /api/admin/dashboard-stats", () => {
  it("zerado quando não há dados", async () => {
    const res = await request(app).get("/api/admin/dashboard-stats").set(admin());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalMeis: 0, totalUsuarios: 0, totalAvaliacoes: 0, mediaAvaliacao: 0 });
  });

  it("calcula totais, média, distribuição, categorias, escala e vendas", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    const e1 = await criarEstabelecimento(a.usuario.usuarioId, { categoria: "Gastronomia", escala: 2, venda: "loja, online" });
    await criarEstabelecimento(a.usuario.usuarioId, { categoria: "Gastronomia", escala: 2, venda: "Loja" });
    await criarEstabelecimento(a.usuario.usuarioId, { categoria: "Beleza", escala: 1, venda: "online" });
    await criarEstabelecimento(a.usuario.usuarioId, { categoria: "Fora", status: "pendente_aprovacao" });
    await Avaliacao.create({ nota: 5, comentario: "a", usuarioId: a.usuario.usuarioId, estabelecimentoId: e1.estabelecimentoId } as any);
    await Avaliacao.create({ nota: 3, comentario: "b", usuarioId: b.usuario.usuarioId, estabelecimentoId: e1.estabelecimentoId } as any);

    const res = await request(app).get("/api/admin/dashboard-stats").set(admin());
    expect(res.body.totalMeis).toBe(3);
    expect(res.body.totalUsuarios).toBe(2);
    expect(res.body.totalAvaliacoes).toBe(2);
    expect(res.body.mediaAvaliacao).toBe("4.0");
    expect(res.body.chartDistribuicaoNotas.find((n: any) => n.nota === "5 Estrelas").qtd).toBe(1);
    expect(res.body.chartDistribuicaoNotas.find((n: any) => n.nota === "3 Estrelas").qtd).toBe(1);
    expect(res.body.chartMeisPorCategoria[0]).toEqual({ categoria: "Gastronomia", qtd: 2 });
    expect(res.body.chartVendas).toEqual(
      expect.arrayContaining([{ canal: "Loja", qtd: 2 }, { canal: "Online", qtd: 2 }]),
    );
    expect(res.body.chartEscalaNegocio[0].label).toBe("Escala 2");
  });

  it("não conta respostas nas avaliações e mapeia os contadores de visualização", async () => {
    const a = await criarUsuario();
    const e = await criarEstabelecimento(a.usuario.usuarioId);
    const pai = await Avaliacao.create({ nota: 4, comentario: "p", usuarioId: a.usuario.usuarioId, estabelecimentoId: e.estabelecimentoId } as any);
    await Avaliacao.create({ nota: null, comentario: "r", usuarioId: a.usuario.usuarioId, estabelecimentoId: e.estabelecimentoId, parentId: pai.avaliacoesId } as any);
    for (const [identificador, visualizacoes] of Object.entries({
      HOME: 10, ESPACO_MEI: 5, CAT_GASTRONOMIA: 7, CURSO_EXCEL: 3, LINK_GOV: 1, LINK_WPP: 2, LINK_EMAIL: 4,
      PROFILE_SHARE: 6, REDIRECIONAMENTO_ANZOL_MEI: 8, REDIRECIONAMENTO_ANZOL_USUARIO: 9,
    })) await ContadorVisualizacao.create({ identificador, visualizacoes } as any);

    const res = await request(app).get("/api/admin/dashboard-stats").set(admin());
    expect(res.body.totalAvaliacoes).toBe(1);
    expect(res.body.pageViews).toEqual({
      home: 10, espacoMei: 5, categoriasTotal: 7, redirecionamentoMei: 8, redirecionamentoUsuario: 9,
    });
    expect(res.body.espacoMeiClicks).toEqual({ gov: 1, wpp: 2, email: 4 });
    expect(res.body.perfilCompartilhado).toBe(6);
    expect(res.body.chartCursos).toEqual([{ curso: "Excel", qtd: 3 }]);
    expect(res.body.chartVisualizacoesPorCategoria).toEqual([{ categoria: "Gastronomia", views: 7 }]);
  });
});
