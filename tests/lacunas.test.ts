import fs from "fs";
import path from "path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { Estabelecimento, ImagemProduto } from "../src/entities";
import AvaliacaoController from "../src/controllers/AvaliacaoController";
import CursoController from "../src/controllers/CursoController";
import EstabelecimentoController from "../src/controllers/EstabelecimentoController";
import FileController from "../src/controllers/FileController";
import UserController from "../src/controllers/UserController";
import CursoService from "../src/services/CursoService";
import EstabelecimentoService from "../src/services/EstabelecimentoService";
import FileStorageService from "../src/utils/FileStorageService";
import {
  auth,
  criarEstabelecimento,
  criarUsuario,
  fecharBanco,
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
afterEach(() => vi.restoreAllMocks());

const admin = () => auth(tokenAdmin());

const fakeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = () => res;
  return res;
};

const gravar = (relativo: string, conteudo: Buffer | string = "x") => {
  const alvo = path.resolve(relativo);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, conteudo);
};

describe("troca de arquivos remove os antigos do disco", () => {
  it("admin troca a logo: o arquivo antigo é apagado", async () => {
    const dono = await criarUsuario();
    gravar("uploads/antiga/logo.webp");
    const est = await criarEstabelecimento(dono.usuario.usuarioId, { logoUrl: "uploads/antiga/logo.webp" });
    await request(app).patch(`/api/admin/estabelecimento/${est.estabelecimentoId}`).set(admin()).attach("logo", await pngReal(), "n.png");
    expect(fs.existsSync("uploads/antiga/logo.webp")).toBe(false);
    await est.reload();
    expect(fs.existsSync(est.logoUrl)).toBe(true);
  });

  it("admin troca o CCMEI: o antigo é apagado e o novo fica na pasta privada", async () => {
    const dono = await criarUsuario();
    gravar("uploads-privados/c/n/ccmei-velho.pdf", pdfFalso());
    const est = await criarEstabelecimento(dono.usuario.usuarioId, { ccmeiUrl: "uploads-privados/c/n/ccmei-velho.pdf" });
    await request(app).patch(`/api/admin/estabelecimento/${est.estabelecimentoId}`).set(admin()).attach("ccmei", pdfFalso(), "n.pdf");
    expect(fs.existsSync("uploads-privados/c/n/ccmei-velho.pdf")).toBe(false);
    await est.reload();
    expect(est.ccmeiUrl).toMatch(/^uploads-privados\//);
  });

  it("admin marca DELETE: arquivos antigos de logo e CCMEI somem do disco", async () => {
    const dono = await criarUsuario();
    gravar("uploads/a/logo.webp");
    gravar("uploads-privados/a/ccmei.pdf", pdfFalso());
    const est = await criarEstabelecimento(dono.usuario.usuarioId, { logoUrl: "uploads/a/logo.webp", ccmeiUrl: "uploads-privados/a/ccmei.pdf" });
    await request(app).patch(`/api/admin/estabelecimento/${est.estabelecimentoId}`).set(admin()).field("logoUrl", "DELETE").field("ccmeiUrl", "DELETE");
    expect(fs.existsSync("uploads/a/logo.webp")).toBe(false);
    expect(fs.existsSync("uploads-privados/a/ccmei.pdf")).toBe(false);
  });

  it("admin remove imagem de produto: o arquivo é apagado", async () => {
    const dono = await criarUsuario();
    gravar("uploads/p/a.webp");
    const est = await criarEstabelecimento(dono.usuario.usuarioId);
    await ImagemProduto.create({ url: "uploads/p/a.webp", estabelecimentoId: est.estabelecimentoId } as any);
    await request(app).patch(`/api/admin/estabelecimento/${est.estabelecimentoId}`).set(admin()).field("urlsParaExcluir", JSON.stringify(["uploads/p/a.webp"]));
    expect(fs.existsSync("uploads/p/a.webp")).toBe(false);
  });

  it("aprovar atualização com logo e produtos novos apaga os arquivos antigos", async () => {
    const dono = await criarUsuario();
    gravar("uploads/v/logo.webp");
    gravar("uploads/v/prod.webp");
    const est = await criarEstabelecimento(dono.usuario.usuarioId, {
      status: "pendente_atualizacao",
      logoUrl: "uploads/v/logo.webp",
      dados_atualizacao: { logo: "uploads/n/logo.webp", produtos: ["uploads/n/p.webp"] },
    });
    await ImagemProduto.create({ url: "uploads/v/prod.webp", estabelecimentoId: est.estabelecimentoId } as any);
    await request(app).post(`/api/admin/approve/${est.estabelecimentoId}`).set(admin());
    expect(fs.existsSync("uploads/v/logo.webp")).toBe(false);
    expect(fs.existsSync("uploads/v/prod.webp")).toBe(false);
  });

  it("edit-and-approve de atualização apaga arquivos antigos substituídos", async () => {
    const dono = await criarUsuario();
    gravar("uploads/v/logo.webp");
    gravar("uploads-privados/v/ccmei.pdf", pdfFalso());
    gravar("uploads/v/prod.webp");
    const est = await criarEstabelecimento(dono.usuario.usuarioId, {
      status: "pendente_atualizacao",
      logoUrl: "uploads/v/logo.webp",
      ccmeiUrl: "uploads-privados/v/ccmei.pdf",
      dados_atualizacao: { logo: "uploads/n/l.webp", ccmei: "uploads-privados/n/c.pdf", produtos: ["uploads/n/p.webp"] },
    });
    await ImagemProduto.create({ url: "uploads/v/prod.webp", estabelecimentoId: est.estabelecimentoId } as any);
    const res = await request(app).post(`/api/admin/edit-and-approve/${est.estabelecimentoId}`).set(admin()).field("urlsParaExcluir", "[]");
    expect(res.status).toBe(200);
    expect(fs.existsSync("uploads/v/logo.webp")).toBe(false);
    expect(fs.existsSync("uploads-privados/v/ccmei.pdf")).toBe(false);
    expect(fs.existsSync("uploads/v/prod.webp")).toBe(false);
  });

  it("edit-and-approve com arquivos novos substitui logo e CCMEI antigos", async () => {
    const dono = await criarUsuario();
    gravar("uploads/v/logo.webp");
    gravar("uploads-privados/v/ccmei.pdf", pdfFalso());
    const est = await criarEstabelecimento(dono.usuario.usuarioId, {
      status: "pendente_aprovacao",
      logoUrl: "uploads/v/logo.webp",
      ccmeiUrl: "uploads-privados/v/ccmei.pdf",
    });
    await request(app)
      .post(`/api/admin/edit-and-approve/${est.estabelecimentoId}`)
      .set(admin())
      .attach("logo", await pngReal(), "l.png")
      .attach("ccmei", pdfFalso(), "c.pdf");
    expect(fs.existsSync("uploads/v/logo.webp")).toBe(false);
    expect(fs.existsSync("uploads-privados/v/ccmei.pdf")).toBe(false);
  });
});

describe("EstabelecimentoService (chamadas diretas)", () => {
  it("cadastrar exige usuário", async () => {
    await expect(EstabelecimentoService.cadastrarEstabelecimentoComImagens({ cnpj: "1" })).rejects.toThrow(/Usuário responsável/);
  });

  it("solicitações por CNPJ inexistente lançam erro", async () => {
    await expect(EstabelecimentoService.solicitarAtualizacaoPorCnpj("0", {})).rejects.toThrow(/não encontrado/);
    await expect(EstabelecimentoService.solicitarExclusaoPorCnpj({ cnpj: "0" })).rejects.toThrow(/não encontrado/);
    await expect(EstabelecimentoService.alterarStatusAtivo(99999, true)).rejects.toThrow(/não encontrado/);
    await expect(EstabelecimentoService.deletarDefinitivamente(99999)).rejects.toThrow(/não encontrado/);
    await expect(EstabelecimentoService.solicitarAtualizacaoPorIdEUsuario(99999, 1, {})).rejects.toThrow(/não encontrado/);
  });

  it("listarPendentes separa por status", async () => {
    const dono = await criarUsuario();
    await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_aprovacao" });
    await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_exclusao" });
    const r = await EstabelecimentoService.listarPendentes();
    expect(r.cadastros).toHaveLength(1);
    expect(r.atualizacoes).toHaveLength(0);
    expect(r.exclusoes).toHaveLength(1);
  });
});

describe("CursoService (validação)", () => {
  it.each([
    [undefined, /inválido/],
    [null, /inválido/],
    [[], /inválido/],
    [{ nome: "" }, /nome/],
    [{ nome: 5 }, /nome/],
    [{ nome: "ok", link: 5 }, /link/],
    [{ nome: "ok", imagemUrl: 5 }, /imagemUrl/],
  ])("criar com payload %j é recusado", async (payload, mensagem) => {
    await expect(CursoService.criar(payload as any)).rejects.toThrow(mensagem);
  });

  it("atualizar curso inexistente lança 'não encontrado'", async () => {
    await expect(CursoService.atualizar(99999, { nome: "x" })).rejects.toThrow(/não encontrado/);
    await expect(CursoService.remover(99999)).rejects.toThrow(/não encontrado/);
  });

  it("atualização sem nenhum campo é recusada", async () => {
    const criado = await CursoService.criar({ nome: "A" });
    await expect(CursoService.atualizar(criado.cursoId, {})).rejects.toThrow(/Nenhum campo/);
  });

  it("aceita link e imagem nulos", async () => {
    const c = await CursoService.criar({ nome: "A", link: null, imagemUrl: null });
    expect(c.link).toBeNull();
  });
});

describe("controllers chamados diretamente (proteções que o middleware já cobre)", () => {
  it.each([
    ["updateUserProfile"],
    ["deleteUserProfile"],
    ["updateUserPassword"],
    ["getOwnEstabelecimentos"],
    ["updateOwnEstabelecimento"],
  ])("UserController.%s sem usuário no token responde 401", async (metodo) => {
    const res = fakeRes();
    await (UserController as any)[metodo]({ body: {}, params: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it.each([["submeterAvaliacao"], ["atualizarAvaliacao"], ["excluirAvaliacao"]])(
    "AvaliacaoController.%s sem usuário responde 401",
    async (metodo) => {
      const res = fakeRes();
      await (AvaliacaoController as any)[metodo]({ body: {}, params: { id: "1" } }, res);
      expect(res.statusCode).toBe(401);
    },
  );

  it("EstabelecimentoController.cadastrar sem usuário responde 401", async () => {
    const res = fakeRes();
    await EstabelecimentoController.cadastrar({ body: {}, files: {} } as any, res);
    expect(res.statusCode).toBe(401);
  });

  it("FileController aceita arquivo em mapa por campo e recusa quando não há arquivo", async () => {
    vi.spyOn(FileStorageService, "save").mockResolvedValue("/uploads/x.webp");
    const ok = fakeRes();
    await FileController.uploadFile({ files: { imagem: [{ filename: "x.webp" }] } } as any, ok);
    expect(ok.body).toEqual({ url: "/uploads/x.webp" });

    const vazio = fakeRes();
    await FileController.uploadFile({} as any, vazio);
    expect(vazio.statusCode).toBe(400);

    const multiplos = fakeRes();
    await FileController.uploadMultipleFiles({ files: [] } as any, multiplos);
    expect(multiplos.statusCode).toBe(400);

    const falha = fakeRes();
    vi.spyOn(FileStorageService, "save").mockRejectedValue(new Error("disco cheio"));
    await FileController.uploadMultipleFiles({ files: [{ filename: "a" }] } as any, falha);
    expect(falha.statusCode).toBe(400);
  });

  it("CursoController aceita apelidos (description/url), ativo em texto e arquivo em mapa", async () => {
    const criar = vi.spyOn(CursoService, "criar").mockResolvedValue({ cursoId: 1, nome: "x" } as any);
    vi.spyOn(FileStorageService, "save").mockResolvedValue("/uploads/c.webp");
    const res = fakeRes();
    await CursoController.criarCurso(
      { body: { name: "Curso", url: "https://x", description: "d", ativo: "off" }, files: { imagem: [{ filename: "c.webp" }] } } as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({ nome: "Curso", link: "https://x", ativo: false, imagemUrl: "/uploads/c.webp" }));

    await CursoController.criarCurso({ body: { nome: "C", ativo: "yes" } } as any, fakeRes());
    expect(criar).toHaveBeenLastCalledWith(expect.objectContaining({ ativo: true }));
  });

  it("EstabelecimentoController._handleError mapeia os erros conhecidos", () => {
    const tratar = (EstabelecimentoController as any)._handleError;
    spyErro();
    const casos: [Error, number][] = [
      [new Error("O CNPJ informado é inválido"), 400],
      [new Error("E-mail já cadastrado no sistema."), 400],
      [new Error("CNPJ já cadastrado no sistema."), 400],
      [new Error("Estabelecimento não encontrado."), 404],
      [new Error("qualquer outra coisa"), 500],
    ];
    for (const [erro, status] of casos) {
      const res = fakeRes();
      tratar(erro, res);
      expect(res.statusCode).toBe(status);
    }
    const generico = fakeRes();
    tratar(new Error("detalhe interno"), generico);
    expect(JSON.stringify(generico.body)).not.toContain("detalhe interno");
  });
});

const spyErro = () => vi.spyOn(console, "error").mockImplementation(() => {});

describe("FileStorageService.deleteFolder", () => {
  it("falha ao remover é registrada sem lançar erro", async () => {
    const erro = spyErro();
    vi.spyOn(fs.promises, "rm").mockRejectedValue(new Error("permissão"));
    await expect(FileStorageService.deleteFolder("a", "b")).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
  });
});

describe("configuração obrigatória", () => {
  const importarSemVariavel = async (nome: string) => {
    vi.resetModules();
    const antes = process.env[nome];
    delete process.env[nome];
    try {
      return await import("../src/app");
    } finally {
      process.env[nome] = antes;
    }
  };

  it.each(["JWT_SECRET", "ADMIN_JWT_SECRET"])("o servidor não sobe sem %s", async (nome) => {
    await expect(importarSemVariavel(nome)).rejects.toThrow(/não definida|não configurados/);
  });

  it("sem CORS_ORIGINS avisa e libera qualquer origem (comportamento de transição)", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const antes = process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;
    vi.resetModules();
    const { default: appAberto } = await import("../src/app");
    process.env.CORS_ORIGINS = antes;
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("CORS_ORIGINS não definido"));
    const res = await request(appAberto).get("/api/cursos").set("Origin", "https://qualquer.com");
    expect(res.headers["access-control-allow-origin"]).toBe("*");
  });
});
