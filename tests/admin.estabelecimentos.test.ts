import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { AuditLog, Estabelecimento, ImagemProduto } from "../src/entities";
import {
  auth,
  criarEstabelecimento,
  criarUsuario,
  emailMock,
  fecharBanco,
  htmlMalicioso,
  limparBanco,
  limparUploads,
  pdfFalso,
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
const esperar = () => new Promise((r) => setTimeout(r, 50));

const cenario = async (dados: Record<string, any> = {}) => {
  const dono = await criarUsuario();
  const est = await criarEstabelecimento(dono.usuario.usuarioId, dados);
  return { dono, est, id: est.estabelecimentoId };
};

describe("POST /api/admin/login", () => {
  it("entra com as credenciais corretas: token vai só em cookie httpOnly, nunca no corpo", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin-teste", password: "senha-teste" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeUndefined();
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("admin_token="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    const token = cookie.split(";")[0].split("=")[1];
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET as string) as any;
    expect(payload.role).toBe("admin");
    expect(payload.exp - payload.iat).toBe(4 * 3600);
  });

  it.each([
    [{ username: "admin-teste", password: "errada" }],
    [{ username: "outro", password: "senha-teste" }],
    [{}],
  ])("recusa credenciais inválidas %j", async (corpo) => {
    const res = await request(app).post("/api/admin/login").send(corpo);
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });
});

describe("proteção das rotas de admin", () => {
  const rotas: [string, string][] = [
    ["get", "/api/admin/pending"],
    ["post", "/api/admin/approve/1"],
    ["post", "/api/admin/edit-and-approve/1"],
    ["post", "/api/admin/reject/1"],
    ["get", "/api/admin/estabelecimentos-ativos"],
    ["get", "/api/admin/estabelecimentos-geral"],
    ["get", "/api/admin/estabelecimentos-inativos"],
    ["patch", "/api/admin/estabelecimento/1"],
    ["put", "/api/admin/estabelecimento/1/status"],
    ["delete", "/api/admin/estabelecimento/1"],
    ["get", "/api/admin/estabelecimento/1/ccmei"],
    ["get", "/api/admin/avaliacoes/estabelecimento/1"],
    ["delete", "/api/admin/avaliacoes/1"],
    ["get", "/api/admin/exportar-estabelecimentos"],
    ["get", "/api/admin/dashboard-stats"],
    ["get", "/api/admin/users"],
    ["put", "/api/admin/users/1"],
    ["delete", "/api/admin/users/1"],
    ["patch", "/api/admin/users/1/password"],
    ["post", "/api/admin/users/1/resend-confirmation"],
  ];

  it.each(rotas)("%s %s recusa sem token, com token de usuário e com token de admin falsificado", async (metodo, rota) => {
    const { token } = await criarUsuario();
    const falso = jwt.sign({ username: "x", role: "admin" }, "segredo-errado");
    const semRole = jwt.sign({ username: "x" }, process.env.ADMIN_JWT_SECRET as string);
    for (const cabecalho of [{}, auth(token), auth(falso), auth(semRole)]) {
      const res = await (request(app) as any)[metodo](rota).set(cabecalho);
      expect([401, 403]).toContain(res.status);
    }
  });

  it("token HS384 com o mesmo segredo é recusado (algoritmo fixo em HS256)", async () => {
    const hs384 = jwt.sign({ username: "a", role: "admin" }, process.env.ADMIN_JWT_SECRET as string, { algorithm: "HS384" });
    const res = await request(app).get("/api/admin/pending").set(auth(hs384));
    expect(res.status).toBe(401);
  });

  it("token de usuário comum não vale como admin e vice-versa", async () => {
    const res1 = await request(app).get("/api/admin/pending").set(auth((await criarUsuario()).token));
    const res2 = await request(app).get("/api/users/profile/estabelecimentos").set(admin());
    expect(res1.status).toBe(401);
    expect(res2.status).toBe(401);
  });
});

describe("GET /api/admin/pending", () => {
  it("separa cadastros, atualizações e exclusões", async () => {
    const dono = await criarUsuario();
    await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_aprovacao" });
    await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_atualizacao" });
    await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_exclusao" });
    await criarEstabelecimento(dono.usuario.usuarioId, { status: "ativo" });

    const res = await request(app).get("/api/admin/pending").set(admin());
    expect(res.status).toBe(200);
    expect(res.body.cadastros).toHaveLength(1);
    expect(res.body.atualizacoes).toHaveLength(1);
    expect(res.body.exclusoes).toHaveLength(1);
    expect(res.body.cadastros[0].cpfResponsavel).toBeTruthy();
  });

  it("registra auditoria da consulta a dado pessoal", async () => {
    await request(app).get("/api/admin/pending").set(admin());
    await esperar();
    const log = await AuditLog.findOne({ where: { acao: "listar_pendentes" } });
    expect(log?.ator).toBe("admin-teste");
  });
});

describe("POST /api/admin/approve/:id", () => {
  it("aprova cadastro novo: fica ativo, visível na vitrine, e avisa por e-mail", async () => {
    const { est, id } = await cenario({ status: "pendente_aprovacao", ativo: false });
    const res = await request(app).post(`/api/admin/approve/${id}`).set(admin());
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("ativo");
    expect(est.ativo).toBe(true);
    expect(emailMock.sendGenericEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: est.emailEstabelecimento, subject: expect.stringMatching(/Aprovado/) }),
    );
    expect((await request(app).get("/api/estabelecimentos")).body).toHaveLength(1);
  });

  it("aprova atualização: aplica só os campos permitidos, troca logo e produtos, limpa a solicitação", async () => {
    const { est, id } = await cenario({
      status: "pendente_atualizacao",
      logoUrl: "uploads/teste-logo-antigo-inexistente.webp",
      dados_atualizacao: {
        nomeFantasia: "Nome Novo",
        descricao: "Descrição nova",
        logo: "uploads/cat/nome/logo-novo.webp",
        produtos: ["uploads/cat/nome/p1.webp", "uploads/cat/nome/p2.webp"],
        status: "inativo",
        usuarioId: 9999,
        estabelecimentoId: 9999,
      },
    });
    await ImagemProduto.create({ url: "uploads/teste-produto-antigo-inexistente.webp", estabelecimentoId: id } as any);

    const res = await request(app).post(`/api/admin/approve/${id}`).set(admin());
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.nomeFantasia).toBe("Nome Novo");
    expect(est.descricao).toBe("Descrição nova");
    expect(est.logoUrl).toBe("uploads/cat/nome/logo-novo.webp");
    expect(est.status).toBe("ativo");
    expect(est.dados_atualizacao).toBeNull();
    // Campos fora da lista permitida não são aplicados (mass assignment).
    expect(est.usuarioId).not.toBe(9999);
    expect(est.estabelecimentoId).toBe(id);

    const imagens = await ImagemProduto.findAll({ where: { estabelecimentoId: id } });
    expect(imagens.map((i) => i.url).sort()).toEqual(["uploads/cat/nome/p1.webp", "uploads/cat/nome/p2.webp"]);
  });

  it("aprova atualização sem dados guardados: só volta a ficar ativo", async () => {
    const { est, id } = await cenario({ status: "pendente_atualizacao", dados_atualizacao: null });
    const res = await request(app).post(`/api/admin/approve/${id}`).set(admin());
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("aprova exclusão: remove o estabelecimento e avisa", async () => {
    const { id } = await cenario({ status: "pendente_exclusao" });
    const res = await request(app).post(`/api/admin/approve/${id}`).set(admin());
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/excluído/);
    expect(await Estabelecimento.findByPk(id)).toBeNull();
    expect(emailMock.sendGenericEmail).toHaveBeenCalled();
  });

  it("falha no e-mail não desfaz a aprovação", async () => {
    emailMock.sendGenericEmail.mockRejectedValue(new Error("SMTP"));
    const { est, id } = await cenario({ status: "pendente_aprovacao" });
    const res = await request(app).post(`/api/admin/approve/${id}`).set(admin());
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("estabelecimento inexistente dá 404", async () => {
    const res = await request(app).post("/api/admin/approve/99999").set(admin());
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/edit-and-approve/:id", () => {
  it("aprova aplicando as edições do admin", async () => {
    const { est, id } = await cenario({ status: "pendente_aprovacao" });
    const res = await request(app)
      .post(`/api/admin/edit-and-approve/${id}`)
      .set(admin())
      .field("descricao", "Editada pelo admin")
      .field("nomeFantasia", "Nome Revisado");
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.descricao).toBe("Editada pelo admin");
    expect(est.nomeFantasia).toBe("Nome Revisado");
    expect(est.status).toBe("ativo");
    expect(est.ativo).toBe(true);
    expect(est.dados_atualizacao).toBeNull();
  });

  it("envia o CCMEI novo para a pasta privada e a logo para /uploads", async () => {
    const { est, id } = await cenario({ status: "pendente_aprovacao" });
    const res = await request(app)
      .post(`/api/admin/edit-and-approve/${id}`)
      .set(admin())
      .field("nomeFantasia", "Loja")
      .attach("ccmei", pdfFalso(), "ccmei.pdf")
      .attach("logo", await pngReal(), "logo.png");
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.ccmeiUrl).toMatch(/^uploads-privados\/.+\/CCMEI\.pdf$/);
    expect(est.logoUrl).toMatch(/^uploads\/.+\.webp$/);
    expect(fs.existsSync(path.resolve(est.ccmeiUrl))).toBe(true);
    expect(fs.existsSync(path.resolve(est.logoUrl))).toBe(true);
  });

  it("recusa arquivo malicioso sem alterar o estabelecimento", async () => {
    const { est, id } = await cenario({ status: "pendente_aprovacao" });
    const res = await request(app)
      .post(`/api/admin/edit-and-approve/${id}`)
      .set(admin())
      .field("nomeFantasia", "Nome Que Nao Deve Aplicar")
      .attach("logo", htmlMalicioso(), "logo.html");
    expect(res.status).toBe(415);
    await est.reload();
    expect(est.status).toBe("pendente_aprovacao");
    expect(est.nomeFantasia).not.toBe("Nome Que Nao Deve Aplicar");
  });

  it("DELETE em logoUrl e ccmeiUrl remove as referências", async () => {
    const { est, id } = await cenario({ status: "pendente_aprovacao", logoUrl: "uploads/a.webp", ccmeiUrl: "uploads-privados/a.pdf" });
    const res = await request(app)
      .post(`/api/admin/edit-and-approve/${id}`)
      .set(admin())
      .field("logoUrl", "DELETE")
      .field("ccmeiUrl", "DELETE");
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.logoUrl).toBeNull();
    expect(est.ccmeiUrl).toBeNull();
  });

  it("em atualização pendente, traz logo e CCMEI da solicitação e ignora produtos marcados para excluir", async () => {
    const { est, id } = await cenario({
      status: "pendente_atualizacao",
      dados_atualizacao: {
        logo: "uploads/c/n/logo-nova.webp",
        ccmei: "uploads-privados/c/n/ccmei-novo.pdf",
        produtos: ["uploads/c/n/a.webp", "uploads/c/n/b.webp"],
      },
    });
    const res = await request(app)
      .post(`/api/admin/edit-and-approve/${id}`)
      .set(admin())
      .field("urlsParaExcluir", JSON.stringify(["uploads/c/n/b.webp"]));
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.logoUrl).toBe("uploads/c/n/logo-nova.webp");
    expect(est.ccmeiUrl).toBe("uploads-privados/c/n/ccmei-novo.pdf");
    const imagens = await ImagemProduto.findAll({ where: { estabelecimentoId: id } });
    expect(imagens.map((i) => i.url)).toEqual(["uploads/c/n/a.webp"]);
  });

  it("urlsParaExcluir com JSON inválido não quebra", async () => {
    const { id } = await cenario({ status: "pendente_aprovacao" });
    const res = await request(app)
      .post(`/api/admin/edit-and-approve/${id}`)
      .set(admin())
      .field("urlsParaExcluir", "{quebrado");
    expect(res.status).toBe(200);
  });

  it("inexistente dá 404", async () => {
    const res = await request(app).post("/api/admin/edit-and-approve/99999").set(admin()).field("a", "b");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/reject/:id", () => {
  it("cadastro rejeitado é removido e o motivo vai no e-mail", async () => {
    const { id } = await cenario({ status: "pendente_aprovacao" });
    const res = await request(app).post(`/api/admin/reject/${id}`).set(admin()).send({ motivoRejeicao: "Documento ilegível" });
    expect(res.status).toBe(200);
    expect(await Estabelecimento.findByPk(id)).toBeNull();
    expect(emailMock.sendGenericEmail).toHaveBeenCalledWith(
      expect.objectContaining({ html: expect.stringContaining("Documento ilegível") }),
    );
  });

  it("atualização rejeitada mantém os dados antigos e volta a ativo", async () => {
    const { est, id } = await cenario({
      status: "pendente_atualizacao",
      descricao: "Original",
      dados_atualizacao: { descricao: "Proposta" },
    });
    const res = await request(app).post(`/api/admin/reject/${id}`).set(admin()).send({});
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("ativo");
    expect(est.descricao).toBe("Original");
    expect(est.dados_atualizacao).toBeNull();
  });

  it("exclusão rejeitada mantém o estabelecimento ativo", async () => {
    const { est, id } = await cenario({ status: "pendente_exclusao" });
    const res = await request(app).post(`/api/admin/reject/${id}`).set(admin()).send({});
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("estabelecimento que não está pendente dá 400 e nada muda", async () => {
    const { est, id } = await cenario({ status: "ativo" });
    const res = await request(app).post(`/api/admin/reject/${id}`).set(admin()).send({});
    expect(res.status).toBe(400);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("inexistente dá 404", async () => {
    expect((await request(app).post("/api/admin/reject/99999").set(admin()).send({})).status).toBe(404);
  });
});

describe("listagens do admin", () => {
  it("estabelecimentos-ativos traz dados completos e só ativos, e registra auditoria", async () => {
    const { est } = await cenario({ status: "ativo" });
    await cenario({ status: "pendente_aprovacao" });
    const res = await request(app).get("/api/admin/estabelecimentos-ativos").set(admin());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].cpfResponsavel).toBe(est.cpfResponsavel);
    expect(res.body[0].ccmeiUrl).toBeDefined();
    await esperar();
    expect(await AuditLog.count({ where: { acao: "listar_estabelecimentos_ativos" } })).toBe(1);
  });

  it("estabelecimentos-inativos lista os rejeitados", async () => {
    await cenario({ status: "rejeitado" });
    await cenario({ status: "ativo" });
    const res = await request(app).get("/api/admin/estabelecimentos-inativos").set(admin());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe("rejeitado");
  });

  it("estabelecimentos-geral responde 200", async () => {
    await cenario();
    const res = await request(app).get("/api/admin/estabelecimentos-geral").set(admin());
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/admin/estabelecimento/:id/status", () => {
  it("inativa e reativa", async () => {
    const { est, id } = await cenario();
    const off = await request(app).put(`/api/admin/estabelecimento/${id}/status`).set(admin()).send({ ativo: false });
    expect(off.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("rejeitado");
    expect(est.ativo).toBe(false);

    const on = await request(app).put(`/api/admin/estabelecimento/${id}/status`).set(admin()).send({ ativo: true });
    expect(on.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("valida id, booleano e existência", async () => {
    const { id } = await cenario();
    expect((await request(app).put("/api/admin/estabelecimento/abc/status").set(admin()).send({ ativo: true })).status).toBe(400);
    expect((await request(app).put(`/api/admin/estabelecimento/${id}/status`).set(admin()).send({ ativo: "sim" })).status).toBe(400);
    expect((await request(app).put("/api/admin/estabelecimento/99999/status").set(admin()).send({ ativo: true })).status).toBe(404);
  });
});

describe("PATCH /api/admin/estabelecimento/:id", () => {
  it("edita campos e troca a logo (nome do arquivo vem do servidor)", async () => {
    const { est, id } = await cenario();
    const res = await request(app)
      .patch(`/api/admin/estabelecimento/${id}`)
      .set(admin())
      .field("descricao", "Nova")
      .attach("logo", await pngReal(), "../../hack.png");
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.descricao).toBe("Nova");
    expect(est.logoUrl).toMatch(/^uploads\/.+\.webp$/);
    expect(est.logoUrl).not.toContain("hack");
    expect(fs.existsSync(path.resolve(est.logoUrl))).toBe(true);
  });

  it("CCMEI vai para a pasta privada", async () => {
    const { est, id } = await cenario();
    await request(app).patch(`/api/admin/estabelecimento/${id}`).set(admin()).attach("ccmei", pdfFalso(), "c.pdf");
    await est.reload();
    expect(est.ccmeiUrl).toMatch(/^uploads-privados\//);
  });

  it("remove imagens de produto marcadas e não permite trocar o id", async () => {
    const { est, id } = await cenario();
    await ImagemProduto.create({ url: "uploads/x/a.webp", estabelecimentoId: id } as any);
    await ImagemProduto.create({ url: "uploads/x/b.webp", estabelecimentoId: id } as any);
    const res = await request(app)
      .patch(`/api/admin/estabelecimento/${id}`)
      .set(admin())
      .field("urlsParaExcluir", JSON.stringify(["uploads/x/a.webp"]))
      .field("estabelecimentoId", "999");
    expect(res.status).toBe(200);
    const imagens = await ImagemProduto.findAll({ where: { estabelecimentoId: id } });
    expect(imagens.map((i) => i.url)).toEqual(["uploads/x/b.webp"]);
    await est.reload();
    expect(est.estabelecimentoId).toBe(id);
  });

  it("recusa arquivo malicioso", async () => {
    const { id } = await cenario();
    const res = await request(app).patch(`/api/admin/estabelecimento/${id}`).set(admin()).attach("logo", htmlMalicioso(), "l.html");
    expect(res.status).toBe(415);
  });

  it("inexistente dá 404", async () => {
    const res = await request(app).patch("/api/admin/estabelecimento/99999").set(admin()).field("descricao", "x");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/estabelecimento/:id", () => {
  it("exclui definitivamente e remove as pastas de arquivos", async () => {
    const { est, id } = await cenario({ categoria: "Gastronomia", nomeFantasia: "Loja Teste" });
    const pubDir = path.resolve("uploads", "gastronomia", "loja_teste");
    const privDir = path.resolve("uploads-privados", "gastronomia", "loja_teste");
    fs.mkdirSync(pubDir, { recursive: true });
    fs.mkdirSync(privDir, { recursive: true });
    fs.writeFileSync(path.join(pubDir, "a.webp"), "x");
    fs.writeFileSync(path.join(privDir, "c.pdf"), "x");

    const res = await request(app).delete(`/api/admin/estabelecimento/${id}`).set(admin());
    expect(res.status).toBe(204);
    expect(await Estabelecimento.findByPk(id)).toBeNull();
    expect(fs.existsSync(pubDir)).toBe(false);
    expect(fs.existsSync(privDir)).toBe(false);
    void est;
  });

  it("id inválido dá 400 e inexistente dá 404", async () => {
    expect((await request(app).delete("/api/admin/estabelecimento/abc").set(admin())).status).toBe(400);
    expect((await request(app).delete("/api/admin/estabelecimento/99999").set(admin())).status).toBe(404);
  });
});

describe("GET /api/admin/estabelecimento/:id/ccmei", () => {
  const gravar = (relativo: string, conteudo: Buffer | string = pdfFalso()) => {
    const alvo = path.resolve(relativo);
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, conteudo);
  };

  it("entrega o CCMEI privado ao admin, sem cache, e registra auditoria", async () => {
    const { id } = await cenario({ ccmeiUrl: "uploads-privados/c/n/ccmei.pdf" });
    gravar("uploads-privados/c/n/ccmei.pdf");
    const res = await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(admin());
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    await esperar();
    const log = await AuditLog.findOne({ where: { acao: "baixar_ccmei" } });
    expect(log?.recurso).toBe(String(id));
  });

  it("entrega CCMEI antigo que ainda está em /uploads", async () => {
    const { id } = await cenario({ ccmeiUrl: "uploads/antigo/n/ccmei.pdf" });
    gravar("uploads/antigo/n/ccmei.pdf");
    const res = await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(admin());
    expect(res.status).toBe(200);
  });

  it("?pendente=1 entrega o CCMEI da solicitação em análise", async () => {
    const { id } = await cenario({
      ccmeiUrl: "uploads-privados/c/n/atual.pdf",
      dados_atualizacao: { ccmei: "uploads-privados/c/n/pendente.pdf" },
    });
    gravar("uploads-privados/c/n/atual.pdf", "ATUAL%PDF-");
    gravar("uploads-privados/c/n/pendente.pdf", "%PDF-PENDENTE");
    const atual = await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(admin()).buffer(true);
    const pendente = await request(app).get(`/api/admin/estabelecimento/${id}/ccmei?pendente=1`).set(admin()).buffer(true);
    expect(atual.body.toString()).toContain("ATUAL");
    expect(pendente.body.toString()).toContain("PENDENTE");
  });

  it.each([
    "../../../etc/passwd",
    "uploads-privados/../../fora.pdf",
    "/etc/passwd",
    "package.json",
    "uploads/../.env",
  ])("recusa caminho fora das pastas de arquivos (%s)", async (caminho) => {
    gravar("fora.pdf");
    const { id } = await cenario({ ccmeiUrl: caminho });
    const res = await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(admin());
    expect(res.status).toBe(404);
  });

  it("sem CCMEI, com arquivo ausente ou id inexistente dá 404", async () => {
    const semArquivo = await cenario({ ccmeiUrl: "uploads-privados/nao/existe.pdf" });
    const semCcmei = await cenario({ ccmeiUrl: null });
    expect((await request(app).get(`/api/admin/estabelecimento/${semArquivo.id}/ccmei`).set(admin())).status).toBe(404);
    expect((await request(app).get(`/api/admin/estabelecimento/${semCcmei.id}/ccmei`).set(admin())).status).toBe(404);
    expect((await request(app).get("/api/admin/estabelecimento/99999/ccmei").set(admin())).status).toBe(404);
  });

  it("arquivo de tipo desconhecido é entregue como download", async () => {
    const { id } = await cenario({ ccmeiUrl: "uploads/velho/n/ccmei.html" });
    gravar("uploads/velho/n/ccmei.html", "<script>1</script>");
    const res = await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(admin());
    expect(res.headers["content-disposition"]).toBe("attachment");
    expect(res.headers["content-type"]).toContain("application/octet-stream");
  });
});
