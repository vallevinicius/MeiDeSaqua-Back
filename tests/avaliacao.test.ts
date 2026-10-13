import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { Avaliacao } from "../src/entities";
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

const cenario = async () => {
  const dono = await criarUsuario();
  const autor = await criarUsuario();
  const est = await criarEstabelecimento(dono.usuario.usuarioId);
  return { dono, autor, est, estId: est.estabelecimentoId };
};

describe("autenticação", () => {
  it.each([
    ["post", "/api/avaliacoes"],
    ["put", "/api/avaliacoes/1"],
    ["delete", "/api/avaliacoes/1"],
  ])("%s %s exige token", async (metodo, rota) => {
    const res = await (request(app) as any)[metodo](rota);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/avaliacoes", () => {
  it("cria avaliação principal com nota e notifica o estabelecimento por e-mail", async () => {
    const { autor, estId, est } = await cenario();
    const res = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota: 4, comentario: "Muito bom", estabelecimentoId: estId });
    expect(res.status).toBe(201);
    expect(res.body.nota).toBe(4);
    expect(res.body.usuarioId).toBe(autor.usuario.usuarioId);
    expect(emailMock.sendGenericEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: est.emailEstabelecimento }),
    );
  });

  it("usa o usuário do token, ignorando usuarioId enviado no corpo", async () => {
    const { autor, dono, estId } = await cenario();
    const res = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({
        nota: 5,
        comentario: "x",
        estabelecimentoId: estId,
        usuarioId: dono.usuario.usuarioId,
      });
    expect(res.status).toBe(201);
    expect(res.body.usuarioId).toBe(autor.usuario.usuarioId);
  });

  it("falha no e-mail não impede a avaliação", async () => {
    const { autor, estId } = await cenario();
    emailMock.sendGenericEmail.mockRejectedValue(new Error("SMTP"));
    const res = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota: 3, comentario: "ok", estabelecimentoId: estId });
    expect(res.status).toBe(201);
  });

  it("exige o id do estabelecimento", async () => {
    const { autor } = await cenario();
    const res = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota: 3, comentario: "ok" });
    expect(res.status).toBe(400);
  });

  it("recusa estabelecimento inexistente", async () => {
    const { autor } = await cenario();
    const res = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota: 3, comentario: "ok", estabelecimentoId: 99999 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/não encontrado/);
  });

  it("recusa palavrão e emoji no comentário", async () => {
    const { autor, estId } = await cenario();
    const a = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota: 3, comentario: "isso é uma merda", estabelecimentoId: estId });
    const b = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota: 3, comentario: "legal 😀", estabelecimentoId: estId });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
    expect(await Avaliacao.count()).toBe(0);
  });

  it.each([0, 6, null, undefined])("recusa nota inválida (%s)", async (nota) => {
    const { autor, estId } = await cenario();
    const res = await request(app)
      .post("/api/avaliacoes")
      .set(auth(autor.token))
      .send({ nota, comentario: "x", estabelecimentoId: estId });
    expect(res.status).toBe(400);
  });

  it("um usuário só avalia o mesmo estabelecimento uma vez", async () => {
    const { autor, estId } = await cenario();
    const corpo = { nota: 4, comentario: "x", estabelecimentoId: estId };
    await request(app).post("/api/avaliacoes").set(auth(autor.token)).send(corpo);
    const res = await request(app).post("/api/avaliacoes").set(auth(autor.token)).send(corpo);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/uma vez/);
  });

  describe("respostas", () => {
    it("responde a um comentário principal, sem nota", async () => {
      const { autor, dono, estId } = await cenario();
      const pai = await request(app)
        .post("/api/avaliacoes")
        .set(auth(autor.token))
        .send({ nota: 5, comentario: "bom", estabelecimentoId: estId });
      const res = await request(app)
        .post("/api/avaliacoes")
        .set(auth(dono.token))
        .send({ nota: 1, comentario: "obrigado", estabelecimentoId: estId, parent_id: pai.body.avaliacoesId });
      expect(res.status).toBe(201);
      expect(res.body.nota).toBeNull();
      expect(res.body.parentId).toBe(pai.body.avaliacoesId);
    });

    it("não responde a uma resposta", async () => {
      const { autor, dono, estId } = await cenario();
      const pai = await request(app).post("/api/avaliacoes").set(auth(autor.token))
        .send({ nota: 5, comentario: "bom", estabelecimentoId: estId });
      const resp = await request(app).post("/api/avaliacoes").set(auth(dono.token))
        .send({ comentario: "obrigado", estabelecimentoId: estId, parent_id: pai.body.avaliacoesId });
      const res = await request(app).post("/api/avaliacoes").set(auth(autor.token))
        .send({ comentario: "de nada", estabelecimentoId: estId, parent_id: resp.body.avaliacoesId });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/responder a uma resposta/);
    });

    it("recusa pai inexistente", async () => {
      const { autor, estId } = await cenario();
      const res = await request(app).post("/api/avaliacoes").set(auth(autor.token))
        .send({ comentario: "x", estabelecimentoId: estId, parent_id: 99999 });
      expect(res.status).toBe(400);
    });

    it("recusa resposta de outro estabelecimento", async () => {
      const { autor, dono, estId } = await cenario();
      const outroEst = await criarEstabelecimento(dono.usuario.usuarioId);
      const pai = await request(app).post("/api/avaliacoes").set(auth(autor.token))
        .send({ nota: 5, comentario: "bom", estabelecimentoId: estId });
      const res = await request(app).post("/api/avaliacoes").set(auth(dono.token))
        .send({ comentario: "x", estabelecimentoId: outroEst.estabelecimentoId, parent_id: pai.body.avaliacoesId });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/mesmo estabelecimento/);
    });
  });
});

describe("PUT /api/avaliacoes/:id", () => {
  const criar = async (autor: any, estId: number, extra = {}) =>
    Avaliacao.create({ nota: 3, comentario: "original", usuarioId: autor.usuario.usuarioId, estabelecimentoId: estId, ...extra } as any);

  it("o autor edita nota e comentário", async () => {
    const { autor, estId } = await cenario();
    const av = await criar(autor, estId);
    const res = await request(app).put(`/api/avaliacoes/${av.avaliacoesId}`).set(auth(autor.token))
      .send({ nota: 5, comentario: "editado" });
    expect(res.status).toBe(200);
    await av.reload();
    expect(av.nota).toBe(5);
    expect(av.comentario).toBe("editado");
  });

  it("outro usuário não edita", async () => {
    const { autor, dono, estId } = await cenario();
    const av = await criar(autor, estId);
    const res = await request(app).put(`/api/avaliacoes/${av.avaliacoesId}`).set(auth(dono.token))
      .send({ comentario: "hack" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/permissão/);
    await av.reload();
    expect(av.comentario).toBe("original");
  });

  it("recusa nota fora de 1 a 5 e palavrão", async () => {
    const { autor, estId } = await cenario();
    const av = await criar(autor, estId);
    const a = await request(app).put(`/api/avaliacoes/${av.avaliacoesId}`).set(auth(autor.token)).send({ nota: 9 });
    const b = await request(app).put(`/api/avaliacoes/${av.avaliacoesId}`).set(auth(autor.token)).send({ comentario: "merda" });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
  });

  it("resposta mantém nota nula mesmo se enviarem nota", async () => {
    const { autor, dono, estId } = await cenario();
    const pai = await criar(autor, estId);
    const resp = await Avaliacao.create({ nota: null, comentario: "r", usuarioId: dono.usuario.usuarioId, estabelecimentoId: estId, parentId: pai.avaliacoesId } as any);
    await request(app).put(`/api/avaliacoes/${resp.avaliacoesId}`).set(auth(dono.token)).send({ nota: 5, comentario: "r2" });
    await resp.reload();
    expect(resp.nota).toBeNull();
    expect(resp.comentario).toBe("r2");
  });

  it("avaliação inexistente dá 400", async () => {
    const { autor } = await cenario();
    const res = await request(app).put("/api/avaliacoes/99999").set(auth(autor.token)).send({ nota: 3 });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/avaliacoes/:id", () => {
  it("o autor exclui (204)", async () => {
    const { autor, estId } = await cenario();
    const av = await Avaliacao.create({ nota: 3, comentario: "x", usuarioId: autor.usuario.usuarioId, estabelecimentoId: estId } as any);
    const res = await request(app).delete(`/api/avaliacoes/${av.avaliacoesId}`).set(auth(autor.token));
    expect(res.status).toBe(204);
    expect(await Avaliacao.count()).toBe(0);
  });

  it("outro usuário não exclui", async () => {
    const { autor, dono, estId } = await cenario();
    const av = await Avaliacao.create({ nota: 3, comentario: "x", usuarioId: autor.usuario.usuarioId, estabelecimentoId: estId } as any);
    const res = await request(app).delete(`/api/avaliacoes/${av.avaliacoesId}`).set(auth(dono.token));
    expect(res.status).toBe(400);
    expect(await Avaliacao.count()).toBe(1);
  });
});

describe("GET /api/avaliacoes/estabelecimento/:id (público)", () => {
  it("lista só comentários principais com respostas aninhadas, sem dados sensíveis do autor", async () => {
    const { autor, dono, estId } = await cenario();
    const pai = await Avaliacao.create({ nota: 5, comentario: "bom", usuarioId: autor.usuario.usuarioId, estabelecimentoId: estId } as any);
    await Avaliacao.create({ nota: null, comentario: "resp", usuarioId: dono.usuario.usuarioId, estabelecimentoId: estId, parentId: pai.avaliacoesId } as any);

    const res = await request(app).get(`/api/avaliacoes/estabelecimento/${estId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].respostas).toHaveLength(1);

    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain(autor.usuario.email);
    expect(texto).not.toContain("password");
    expect(texto).not.toContain("confirmationToken");
    expect(res.body[0].usuario.usuarioId).toBe(autor.usuario.usuarioId);
  });

  it("estabelecimento sem avaliações devolve lista vazia", async () => {
    const { estId } = await cenario();
    const res = await request(app).get(`/api/avaliacoes/estabelecimento/${estId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
