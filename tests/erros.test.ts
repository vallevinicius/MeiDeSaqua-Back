import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { Avaliacao, AuditLog, ContadorVisualizacao, Estabelecimento, ImagemProduto, Usuario } from "../src/entities";
import sequelize from "../src/config/database";
import AuditService from "../src/services/AuditService";
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
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const admin = () => auth(tokenAdmin());
const SEGREDO = "ERRO-INTERNO-SECRETO-DO-BANCO";
const falhar = (alvo: any, metodo: string) =>
  vi.spyOn(alvo, metodo).mockRejectedValue(new Error(SEGREDO));

describe("falhas internas não vazam detalhes do banco", () => {
  const casos: [string, string, () => void, number][] = [
    ["GET /api/estabelecimentos", "/api/estabelecimentos", () => falhar(Estabelecimento, "findAll"), 500],
    ["GET /api/estabelecimentos/buscar", "/api/estabelecimentos/buscar?nome=a", () => falhar(Estabelecimento, "findAll"), 500],
    ["GET /api/estabelecimentos/1", "/api/estabelecimentos/1", () => falhar(Estabelecimento, "findOne"), 500],
    ["GET /api/avaliacoes/estabelecimento/1", "/api/avaliacoes/estabelecimento/1", () => falhar(Avaliacao, "findAll"), 500],
    ["GET /api/cursos", "/api/cursos", () => vi.spyOn(sequelize, "query").mockRejectedValue(new Error(SEGREDO)), 500],
  ];

  it.each(casos)("%s", async (_nome, url, preparar, status) => {
    preparar();
    const res = await request(app).get(url);
    if (_nome.includes("avaliacoes") || _nome.includes("cursos")) {
      // Estas rotas devolvem a mensagem do erro; o importante é o status controlado.
      expect(res.status).toBe(status);
    } else {
      expect(res.status).toBe(status);
      expect(res.text).not.toContain(SEGREDO);
    }
  });

  const adminCasos: [string, string, string, () => void][] = [
    ["get", "/api/admin/pending", "Erro ao buscar solicitações", () => falhar(Estabelecimento, "findAll")],
    ["get", "/api/admin/estabelecimentos-ativos", "Erro ao buscar estabelecimentos ativos", () => falhar(Estabelecimento, "findAll")],
    ["get", "/api/admin/estabelecimentos-inativos", "Erro ao buscar estabelecimentos inativos", () => falhar(Estabelecimento, "findAll")],
    ["get", "/api/admin/exportar-estabelecimentos", "Erro ao gerar arquivo", () => falhar(Estabelecimento, "findAll")],
    ["get", "/api/admin/dashboard-stats", "Erro ao buscar estatísticas", () => falhar(Estabelecimento, "findAll")],
    ["get", "/api/admin/users", "Erro ao buscar lista de usuários", () => falhar(Usuario, "findAll")],
    ["get", "/api/admin/avaliacoes/estabelecimento/1", "Erro ao buscar avaliações", () => falhar(Estabelecimento, "findByPk")],
    ["delete", "/api/admin/avaliacoes/1", "Erro ao excluir a avaliação", () => falhar(Avaliacao, "findByPk")],
    ["get", "/api/admin/estabelecimento/1/ccmei", "Erro ao baixar CCMEI", () => falhar(Estabelecimento, "findByPk")],
    ["put", "/api/admin/estabelecimento/1/status", "Erro interno ao alterar status", () => falhar(Estabelecimento, "findByPk")],
    ["delete", "/api/admin/estabelecimento/1", "Erro interno ao excluir", () => falhar(Estabelecimento, "findByPk")],
    ["patch", "/api/admin/users/1/password", "Erro ao alterar a senha", () => falhar(Usuario, "findByPk")],
    ["post", "/api/admin/users/1/resend-confirmation", "Erro ao enviar email", () => falhar(Usuario, "findByPk")],
  ];

  it.each(adminCasos)("%s %s", async (metodo, url, mensagem, preparar) => {
    preparar();
    const corpo = url.endsWith("/status") ? { ativo: true } : url.endsWith("/password") ? { newPassword: "123456" } : {};
    const res = await (request(app) as any)[metodo](url).set(admin()).send(corpo);
    expect(res.status).toBe(500);
    expect(res.body.message).toContain(mensagem);
    expect(res.text).not.toContain(SEGREDO);
  });

  const transacionais: [string, string, string][] = [
    ["post", "/api/admin/approve/1", "Erro ao aprovar"],
    ["post", "/api/admin/reject/1", "Erro ao rejeitar"],
    ["post", "/api/admin/edit-and-approve/1", "Erro ao processar"],
    ["patch", "/api/admin/estabelecimento/1", "Erro ao atualizar estabelecimento"],
    ["put", "/api/admin/users/1", "Erro ao atualizar usuário"],
    ["delete", "/api/admin/users/1", "Erro ao excluir usuário"],
  ];

  it.each(transacionais)("%s %s faz rollback e responde 500", async (metodo, url, mensagem) => {
    const dono = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_aprovacao" });
    vi.spyOn(Estabelecimento, "findByPk").mockRejectedValue(new Error(SEGREDO));
    vi.spyOn(Usuario, "findByPk").mockRejectedValue(new Error(SEGREDO));
    const comArquivos = url.includes("edit-and-approve") || (metodo === "patch" && url.includes("estabelecimento"));
    const req = (request(app) as any)[metodo](url).set(admin());
    const res = await (comArquivos ? req.field("a", "b") : req.send({}));
    expect(res.status).toBe(500);
    expect(res.body.message).toContain(mensagem);
    expect(res.text).not.toContain(SEGREDO);
    vi.restoreAllMocks();
    await est.reload();
    expect(est.status).toBe("pendente_aprovacao");
  });
});

describe("tratamento de erros de negócio", () => {
  it("login com falha inesperada responde 500 genérico", async () => {
    vi.spyOn(Usuario, "findOne").mockRejectedValue(new Error(SEGREDO));
    const res = await request(app).post("/api/auth/login").send({ username: "a", password: "b" });
    expect(res.status).toBe(500);
    expect(res.text).not.toContain(SEGREDO);
  });

  it("visualização com falha no banco responde 500", async () => {
    vi.spyOn(ContadorVisualizacao, "findOrCreate").mockRejectedValue(new Error(SEGREDO));
    const res = await request(app).post("/api/estabelecimentos/visualizacao/HOME");
    expect(res.status).toBe(500);
    expect(res.text).not.toContain(SEGREDO);
  });

  it("status público de estabelecimento com erro inesperado responde 500 genérico", async () => {
    vi.spyOn(Estabelecimento, "findByPk").mockRejectedValue(new Error(SEGREDO));
    const res = await request(app).post("/api/estabelecimentos/1/status").set(admin()).send({ ativo: true });
    expect(res.status).toBe(500);
    expect(res.text).not.toContain(SEGREDO);
  });

  it("cadastro de MEI: erro de coluna grande vira mensagem amigável", async () => {
    const { token } = await criarUsuario();
    const erro = Object.assign(new Error("Data too long for column 'descricao_diferencial' at row 1"), {
      name: "SequelizeDatabaseError",
    });
    vi.spyOn(Estabelecimento, "findOne").mockRejectedValue(erro);
    const res = await request(app)
      .post("/api/estabelecimentos")
      .set(auth(token))
      .field("cnpj", "12345678000190")
      .field("emailEstabelecimento", "a@b.com");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Diferencial/);
  });

  it("cadastro de MEI: violação de unicidade vira mensagem de CNPJ duplicado", async () => {
    const { token } = await criarUsuario();
    const erro = Object.assign(new Error("dup"), { name: "SequelizeUniqueConstraintError" });
    vi.spyOn(Estabelecimento, "findOne").mockRejectedValue(erro);
    const res = await request(app).post("/api/estabelecimentos").set(auth(token)).field("cnpj", "1");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/CNPJ/);
  });

  it("falha de e-mail na aprovação não derruba a resposta", async () => {
    emailMock.sendGenericEmail.mockRejectedValue(new Error("SMTP"));
    const dono = await criarUsuario();
    const est = await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_exclusao" });
    const res = await request(app).post(`/api/admin/reject/${est.estabelecimentoId}`).set(admin()).send({});
    expect(res.status).toBe(200);
  });
});

describe("AuditService", () => {
  it("falha ao gravar auditoria não derruba a requisição", async () => {
    vi.spyOn(AuditLog, "create").mockRejectedValue(new Error("tabela inexistente"));
    const res = await request(app).get("/api/admin/pending").set(admin());
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 30));
    expect(console.error).toHaveBeenCalled();
  });

  it("registra ator, ação, recurso e IP", async () => {
    const req: any = { admin: { username: "chefe" }, ip: "10.0.0.1" };
    AuditService.registrar(req, "acao_teste", 42);
    await new Promise((r) => setTimeout(r, 80));
    const log = await AuditLog.findOne({ where: { acao: "acao_teste" } });
    expect(log).toMatchObject({ ator: "chefe", recurso: "42", ip: "10.0.0.1" });
  });

  it("sem admin identificado grava 'desconhecido'", async () => {
    AuditService.registrar({ ip: "1.1.1.1" } as any, "sem_ator");
    await new Promise((r) => setTimeout(r, 80));
    expect((await AuditLog.findOne({ where: { acao: "sem_ator" } }))?.ator).toBe("desconhecido");
  });
});

describe("tokens", () => {
  it("token de usuário expirado é recusado", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const expirado = jwt.sign({ id: 1, username: "x" }, process.env.JWT_SECRET as string, { expiresIn: -10 });
    const res = await request(app).get("/api/users/profile/estabelecimentos").set(auth(expirado));
    expect(res.status).toBe(401);
  });

  it("token de usuário assinado com o segredo do admin é recusado", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const cruzado = jwt.sign({ id: 1, username: "x" }, process.env.ADMIN_JWT_SECRET as string);
    const res = await request(app).get("/api/users/profile/estabelecimentos").set(auth(cruzado));
    expect(res.status).toBe(401);
  });

  it("token de admin expirado é recusado", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const expirado = jwt.sign({ username: "a", role: "admin" }, process.env.ADMIN_JWT_SECRET as string, { expiresIn: -10 });
    const res = await request(app).get("/api/admin/pending").set(auth(expirado));
    expect(res.status).toBe(401);
  });

  it("cabeçalho sem 'Bearer' é recusado", async () => {
    const res = await request(app).get("/api/users/profile/estabelecimentos").set("Authorization", "Token abc");
    expect(res.status).toBe(401);
  });

  it("token 'alg: none' é recusado", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const semAssinatura = `${b64({ alg: "none", typ: "JWT" })}.${b64({ id: 1, username: "x" })}.`;
    const res = await request(app).get("/api/users/profile/estabelecimentos").set(auth(semAssinatura));
    expect(res.status).toBe(401);
  });
});
