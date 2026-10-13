import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { Sessao, Usuario } from "../src/entities";
import SessionService from "../src/services/SessionService";
import {
  auth,
  criarEstabelecimento,
  criarUsuario,
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

const ORIGEM = "http://localhost:3300";
const cookies = (res: request.Response) => (res.headers["set-cookie"] ?? []) as unknown as string[];
const valorCookie = (res: request.Response, nome: string) =>
  cookies(res).find((c) => c.startsWith(`${nome}=`))?.split(";")[0].split("=")[1];

const entrar = async (extra: Record<string, any> = {}) => {
  const { usuario, senha } = await criarUsuario(extra);
  const agente = request.agent(app);
  const res = await agente.post("/api/auth/login").send({ username: usuario.username, password: senha });
  return { agente, usuario, senha, res };
};

describe("login por cookie", () => {
  it("define cookies httpOnly com os atributos de segurança", async () => {
    const { res } = await entrar();
    const acesso = cookies(res).find((c) => c.startsWith("access_token="))!;
    const renovacao = cookies(res).find((c) => c.startsWith("refresh_token="))!;
    expect(acesso).toMatch(/HttpOnly/i);
    expect(acesso).toMatch(/SameSite=Lax/i);
    expect(acesso).toMatch(/Path=\//);
    expect(acesso).toMatch(/Max-Age=900/);
    expect(renovacao).toMatch(/HttpOnly/i);
    expect(renovacao).toMatch(/Path=\/api\/auth/);
    expect(renovacao).toMatch(new RegExp(`Max-Age=${7 * 24 * 3600}`));
  });

  it("cookie Secure quando COOKIE_SECURE=true", async () => {
    process.env.COOKIE_SECURE = "true";
    try {
      const { res } = await entrar();
      expect(cookies(res).every((c) => /Secure/i.test(c))).toBe(true);
    } finally {
      delete process.env.COOKIE_SECURE;
    }
  });

  it("nenhum token aparece no corpo da resposta", async () => {
    const { res } = await entrar();
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain(valorCookie(res, "access_token")!);
    expect(texto).not.toContain(valorCookie(res, "refresh_token")!);
    expect(res.body.token).toBeUndefined();
  });

  it("o cookie autentica as rotas protegidas", async () => {
    const { agente } = await entrar();
    const res = await agente.get("/api/users/profile/estabelecimentos");
    expect(res.status).toBe(200);
  });

  it("sem cookie nem token a rota recusa", async () => {
    const res = await request(app).get("/api/users/profile/estabelecimentos");
    expect(res.status).toBe(401);
  });

  it("Bearer continua funcionando (scripts e clientes antigos)", async () => {
    const { usuario } = await entrar();
    const token = jwt.sign({ id: usuario.usuarioId, username: usuario.username, ver: 0 }, process.env.JWT_SECRET as string);
    const res = await request(app).get("/api/users/profile/estabelecimentos").set(auth(token));
    expect(res.status).toBe(200);
  });

  it("o marcador 'sessao-por-cookie' não é tratado como token e o cookie vale", async () => {
    const { agente } = await entrar();
    const res = await agente.get("/api/users/profile/estabelecimentos").set("Authorization", "Bearer sessao-por-cookie");
    expect(res.status).toBe(200);
    const semCookie = await request(app).get("/api/users/profile/estabelecimentos").set("Authorization", "Bearer sessao-por-cookie");
    expect(semCookie.status).toBe(401);
  });

  it("Bearer inválido não é salvo por um cookie válido (o cabeçalho tem prioridade)", async () => {
    const { agente } = await entrar();
    const res = await agente.get("/api/users/profile/estabelecimentos").set("Authorization", "Bearer lixo");
    expect(res.status).toBe(401);
  });

  it("a renovação não é enviada para rotas fora de /api/auth", async () => {
    const { res } = await entrar();
    const renovacao = cookies(res).find((c) => c.startsWith("refresh_token="))!;
    expect(renovacao).toMatch(/Path=\/api\/auth/);
    expect(cookies(res).find((c) => c.startsWith("access_token="))).not.toMatch(/Path=\/api\/auth/);
  });

  it("guarda só o hash do refresh token no banco", async () => {
    const { res } = await entrar();
    const bruto = valorCookie(res, "refresh_token")!;
    const sessoes = await Sessao.findAll();
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0].tokenHash).not.toBe(bruto);
    expect(sessoes[0].tokenHash).toHaveLength(64);
  });
});

describe("POST /api/auth/refresh", () => {
  it("troca o refresh token e emite novo acesso", async () => {
    const { agente, res: login } = await entrar();
    const res = await agente.post("/api/auth/refresh");
    expect(res.status).toBe(200);
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
    expect(valorCookie(res, "refresh_token")).toBeTruthy();
    expect(valorCookie(res, "refresh_token")).not.toBe(valorCookie(login, "refresh_token"));
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(200);
    expect(await Sessao.count()).toBe(2);
    expect(await Sessao.count({ where: { revogadaEm: null } })).toBe(1);
  });

  it("sem cookie recusa com 401", async () => {
    expect((await request(app).post("/api/auth/refresh")).status).toBe(401);
  });

  it("token inventado é recusado e os cookies são limpos", async () => {
    const res = await request(app).post("/api/auth/refresh").set("Cookie", "refresh_token=inventado");
    expect(res.status).toBe(401);
    expect(cookies(res).some((c) => /refresh_token=;/.test(c))).toBe(true);
  });

  it("reutilizar um refresh token já trocado encerra TODAS as sessões (roubo)", async () => {
    const { agente, usuario, res: login } = await entrar();
    const antigo = valorCookie(login, "refresh_token")!;
    const nova = await agente.post("/api/auth/refresh");
    expect(nova.status).toBe(200);

    const ladrao = await request(app).post("/api/auth/refresh").set("Cookie", `refresh_token=${antigo}`);
    expect(ladrao.status).toBe(401);

    // O token novo (da vítima) também morreu, e o acesso emitido antes.
    const vitima = await request(app).post("/api/auth/refresh").set("Cookie", `refresh_token=${valorCookie(nova, "refresh_token")}`);
    expect(vitima.status).toBe(401);
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);
    expect(await Sessao.count({ where: { usuarioId: usuario.usuarioId, revogadaEm: null } })).toBe(0);
  });

  it("sessão expirada é recusada", async () => {
    const { agente } = await entrar();
    await Sessao.update({ expiraEm: new Date(Date.now() - 1000) }, { where: {} });
    expect((await agente.post("/api/auth/refresh")).status).toBe(401);
  });

  it("conta desativada não renova", async () => {
    const { agente, usuario } = await entrar();
    await usuario.update({ enabled: false });
    expect((await agente.post("/api/auth/refresh")).status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("encerra a sessão: refresh token não serve mais e cookies são apagados", async () => {
    const { agente, res: login } = await entrar();
    const res = await agente.post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(cookies(res).some((c) => /access_token=;/.test(c))).toBe(true);
    expect(cookies(res).some((c) => /refresh_token=;/.test(c))).toBe(true);

    const reuso = await request(app).post("/api/auth/refresh").set("Cookie", `refresh_token=${valorCookie(login, "refresh_token")}`);
    expect(reuso.status).toBe(401);
  });

  it("sem sessão também responde 204 (idempotente)", async () => {
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });
});

describe("revogação de sessões", () => {
  it("troca de senha pelo usuário derruba os outros aparelhos e mantém este", async () => {
    const { agente: celular, usuario, senha } = await entrar();
    const notebook = request.agent(app);
    await notebook.post("/api/auth/login").send({ username: usuario.username, password: senha });

    const res = await celular.put("/api/users/password").set("Origin", ORIGEM).send({ currentPassword: senha, newPassword: "NovaSenha1" });
    expect(res.status).toBe(200);

    expect((await celular.get("/api/users/profile/estabelecimentos")).status).toBe(200);
    expect((await notebook.get("/api/users/profile/estabelecimentos")).status).toBe(401);
    expect((await notebook.post("/api/auth/refresh")).status).toBe(401);
  });

  it("redefinir a senha por e-mail derruba todas as sessões", async () => {
    const { agente, usuario } = await entrar();
    await usuario.update({ resetPasswordToken: "rst", resetPasswordTokenExpiry: new Date(Date.now() + 60000) });
    await request(app).post("/api/auth/reset-password").send({ token: "rst", newPassword: "Outra1234" });
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);
  });

  it("admin trocando a senha do usuário derruba as sessões dele", async () => {
    const { agente, usuario } = await entrar();
    await request(app).patch(`/api/admin/users/${usuario.usuarioId}/password`).set(auth(tokenAdmin())).send({ newPassword: "123456" });
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);
  });

  it("admin bloqueando a conta derruba a sessão na hora", async () => {
    const { agente, usuario } = await entrar();
    await request(app).put(`/api/admin/users/${usuario.usuarioId}`).set(auth(tokenAdmin())).send({ enabled: false });
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);
  });

  it("admin encerra as sessões de um usuário; usuário inexistente dá 404; exige admin", async () => {
    const { agente, usuario } = await entrar();
    const sem = await request(app).post(`/api/admin/users/${usuario.usuarioId}/revoke-sessions`);
    expect(sem.status).toBe(401);
    const ok = await request(app).post(`/api/admin/users/${usuario.usuarioId}/revoke-sessions`).set(auth(tokenAdmin()));
    expect(ok.status).toBe(200);
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);
    expect((await agente.post("/api/auth/refresh")).status).toBe(401);
    expect((await request(app).post("/api/admin/users/99999/revoke-sessions").set(auth(tokenAdmin()))).status).toBe(404);
  });

  it("token com versão antiga é recusado, com versão certa é aceito", async () => {
    const { usuario } = await criarUsuario();
    const assinar = (ver: number) => jwt.sign({ id: usuario.usuarioId, username: "x", ver }, process.env.JWT_SECRET as string);
    await SessionService.revogarTodas(usuario.usuarioId);
    expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(assinar(0)))).status).toBe(401);
    expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(assinar(1)))).status).toBe(200);
  });

  it("conta inexistente ou desativada não passa mesmo com token válido", async () => {
    const { usuario, token } = await criarUsuario();
    await usuario.update({ enabled: false });
    expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(token))).status).toBe(401);
    await usuario.destroy();
    expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(token))).status).toBe(401);
  });

  it("limparExpiradas apaga só sessões vencidas há mais de um dia", async () => {
    const { usuario } = await criarUsuario();
    const base = { usuarioId: usuario.usuarioId } as any;
    await Sessao.create({ ...base, tokenHash: "a".repeat(64), expiraEm: new Date(Date.now() - 3 * 86400000) });
    await Sessao.create({ ...base, tokenHash: "b".repeat(64), expiraEm: new Date(Date.now() + 86400000) });
    await SessionService.limparExpiradas();
    expect((await Sessao.findAll()).map((s) => s.tokenHash)).toEqual(["b".repeat(64)]);
  });
});

describe("proteção contra CSRF nas requisições com cookie", () => {
  it("POST com cookie e origem de site desconhecido é bloqueado", async () => {
    const { agente } = await entrar();
    const res = await agente.post("/api/avaliacoes").set("Origin", "https://site-malicioso.com").send({});
    expect(res.status).toBe(403);
  });

  it("POST com cookie e sem Origin nem Referer é bloqueado", async () => {
    const { agente } = await entrar();
    expect((await agente.post("/api/avaliacoes").send({})).status).toBe(403);
  });

  it("POST com cookie e origem permitida passa pela verificação", async () => {
    const { agente } = await entrar();
    const res = await agente.post("/api/avaliacoes").set("Origin", ORIGEM).send({});
    expect(res.status).toBe(400);
  });

  it("Referer da origem permitida também vale", async () => {
    const { agente } = await entrar();
    const res = await agente.post("/api/avaliacoes").set("Referer", `${ORIGEM}/pagina`).send({});
    expect(res.status).toBe(400);
  });

  it("Referer inválido ou de outro site é bloqueado", async () => {
    const { agente } = await entrar();
    expect((await agente.post("/api/avaliacoes").set("Referer", "nao-e-url").send({})).status).toBe(403);
    expect((await agente.post("/api/avaliacoes").set("Referer", "https://evil.com/x").send({})).status).toBe(403);
  });

  it("GET com cookie não exige Origin", async () => {
    const { agente } = await entrar();
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(200);
  });

  it("PUT e DELETE também são verificados", async () => {
    const { agente } = await entrar();
    expect((await agente.put("/api/users/password").set("Origin", "https://evil.com").send({})).status).toBe(403);
    expect((await agente.delete("/api/users/profile").set("Origin", "https://evil.com")).status).toBe(403);
  });

  it("Bearer não depende de Origin (não é enviado automaticamente pelo navegador)", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/avaliacoes").set(auth(token)).send({});
    expect(res.status).toBe(400);
  });

  it("o mesmo vale para o cookie de admin", async () => {
    const agente = request.agent(app);
    await agente.post("/api/admin/login").send({ username: "admin-teste", password: "senha-teste" });
    expect((await agente.delete("/api/admin/avaliacoes/1").set("Origin", "https://evil.com")).status).toBe(403);
    expect((await agente.delete("/api/admin/avaliacoes/1").set("Origin", ORIGEM)).status).toBe(404);
  });
});

describe("cookie de admin", () => {
  it("autentica as rotas de admin e o logout apaga o cookie", async () => {
    const agente = request.agent(app);
    await agente.post("/api/admin/login").send({ username: "admin-teste", password: "senha-teste" });
    expect((await agente.get("/api/admin/pending")).status).toBe(200);

    const saida = await agente.post("/api/admin/logout");
    expect(saida.status).toBe(204);
    expect(cookies(saida).some((c) => /admin_token=;/.test(c))).toBe(true);
    expect((await agente.get("/api/admin/pending")).status).toBe(401);
  });

  it("o cookie de admin não vale como sessão de usuário e vice-versa", async () => {
    const agente = request.agent(app);
    await agente.post("/api/admin/login").send({ username: "admin-teste", password: "senha-teste" });
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);

    const { agente: usuario } = await entrar();
    expect((await usuario.get("/api/admin/pending")).status).toBe(401);
  });

  it("senha de admin é comparada sem diferenciar tamanho (sem exceção para tipos inesperados)", async () => {
    for (const corpo of [{ username: 123, password: 456 }, { username: ["a"], password: {} }, { username: null }]) {
      expect((await request(app).post("/api/admin/login").send(corpo)).status).toBe(401);
    }
  });
});

describe("CORS com credenciais", () => {
  it("origem permitida recebe Allow-Credentials; outra não recebe nada", async () => {
    const ok = await request(app).get("/api/cursos").set("Origin", ORIGEM);
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const ruim = await request(app).get("/api/cursos").set("Origin", "https://evil.com");
    // Sem Allow-Origin o navegador descarta a resposta, mesmo que venha Allow-Credentials.
    expect(ruim.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("integração: dono acessa os próprios dados pela sessão de cookie", () => {
  it("lista os próprios estabelecimentos sem enviar token", async () => {
    const { agente, usuario } = await entrar();
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Meu" });
    const res = await agente.get("/api/users/profile/estabelecimentos");
    expect(res.body.map((e: any) => e.nomeFantasia)).toEqual(["Meu"]);
  });

  it("usuário não encontrado no banco após login apagado não consegue renovar", async () => {
    const { agente, usuario } = await entrar();
    await Usuario.destroy({ where: { usuarioId: usuario.usuarioId } });
    expect((await agente.post("/api/auth/refresh")).status).toBe(401);
  });
});

describe("migração de quem já estava logado (token antigo -> cookies)", () => {
  const tokenAntigo = (usuario: Usuario, opcoes: jwt.SignOptions = { expiresIn: "1h" }) =>
    // Formato emitido antes da Fase 3: sem o campo "ver".
    jwt.sign({ id: usuario.usuarioId, username: usuario.username }, process.env.JWT_SECRET as string, {
      algorithm: "HS256",
      ...opcoes,
    });

  it("o token antigo ainda vale nas requisições (ninguém é deslogado no deploy)", async () => {
    const { usuario } = await criarUsuario();
    const res = await request(app).get("/api/users/profile/estabelecimentos").set(auth(tokenAntigo(usuario)));
    expect(res.status).toBe(200);
  });

  it("troca o token antigo por sessão em cookies httpOnly, sem pedir senha", async () => {
    const { usuario } = await criarUsuario();
    const res = await request(app).post("/api/auth/migrar-sessao").set(auth(tokenAntigo(usuario)));
    expect(res.status).toBe(200);
    expect(res.body.user.usuarioId).toBe(usuario.usuarioId);
    expect(res.body.token).toBeUndefined();
    expect(cookies(res).find((c) => c.startsWith("access_token="))).toMatch(/HttpOnly/i);
    expect(cookies(res).find((c) => c.startsWith("refresh_token="))).toMatch(/HttpOnly/i);

    const agente = request.agent(app);
    await agente.post("/api/auth/migrar-sessao").set(auth(tokenAntigo(usuario)));
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(200);
    expect((await agente.post("/api/auth/refresh")).status).toBe(200);
  });

  it("a resposta não traz senha nem tokens de uso único", async () => {
    const { usuario } = await criarUsuario();
    await usuario.update({ resetPasswordToken: "SEGREDO-RESET" });
    const res = await request(app).post("/api/auth/migrar-sessao").set(auth(tokenAntigo(usuario)));
    expect(res.text).not.toContain("SEGREDO-RESET");
    expect(res.text).not.toContain(usuario.password);
  });

  it("token antigo expirado não migra (a pessoa já teria que logar de novo)", async () => {
    const { usuario } = await criarUsuario();
    const res = await request(app).post("/api/auth/migrar-sessao").set(auth(tokenAntigo(usuario, { expiresIn: -10 })));
    expect(res.status).toBe(401);
    expect(cookies(res)).toHaveLength(0);
  });

  it("token NOVO não pode ser trocado por uma sessão de 7 dias (impede prolongar token roubado)", async () => {
    const { usuario, token } = await criarUsuario();
    const novo = jwt.sign({ id: usuario.usuarioId, username: usuario.username, ver: 0 }, process.env.JWT_SECRET as string);
    expect((await request(app).post("/api/auth/migrar-sessao").set(auth(novo))).status).toBe(401);
    expect((await request(app).post("/api/auth/migrar-sessao").set(auth(token))).status).toBe(200); // helper = formato antigo
    expect(await Sessao.count({ where: { usuarioId: usuario.usuarioId } })).toBe(1);
  });

  it("sem token, com marcador do front ou com conta desativada: 401 e nenhuma sessão criada", async () => {
    const { usuario } = await criarUsuario();
    expect((await request(app).post("/api/auth/migrar-sessao")).status).toBe(401);
    expect((await request(app).post("/api/auth/migrar-sessao").set("Authorization", "Bearer sessao-por-cookie")).status).toBe(401);
    await usuario.update({ enabled: false });
    expect((await request(app).post("/api/auth/migrar-sessao").set(auth(tokenAntigo(usuario)))).status).toBe(401);
    expect(await Sessao.count()).toBe(0);
  });

  it("token antigo de conta que teve a senha trocada depois da migração não vale mais", async () => {
    const { usuario } = await criarUsuario();
    const antigo = tokenAntigo(usuario);
    await request(app).post("/api/auth/migrar-sessao").set(auth(antigo));
    await SessionService.revogarTodas(usuario.usuarioId);
    expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(antigo))).status).toBe(401);
  });

  it("sessão de admin antiga (cookie do front) continua valendo", async () => {
    const antigo = jwt.sign({ username: "admin-teste", role: "admin" }, process.env.ADMIN_JWT_SECRET as string, { expiresIn: "8h" });
    const res = await request(app).get("/api/admin/pending").set("Cookie", `admin_token=${antigo}`);
    expect(res.status).toBe(200);
  });
});
