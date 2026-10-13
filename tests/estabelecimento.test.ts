import fs from "fs";
import path from "path";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  Avaliacao,
  ContadorVisualizacao,
  Estabelecimento,
  ImagemProduto,
} from "../src/entities";
import {
  auth,
  cnpjAleatorio,
  cnpjMock,
  criarEstabelecimento,
  criarUsuario,
  dadosCnpjValidos,
  fecharBanco,
  htmlMalicioso,
  jpegReal,
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

const CAMPOS_PROIBIDOS = [
  "cpfResponsavel",
  "cnpj",
  "emailEstabelecimento",
  "nomeResponsavel",
  "ccmeiUrl",
  "usuarioId",
  "dados_atualizacao",
  "cnae",
];

const arquivosEm = (pasta: string) =>
  fs.existsSync(pasta)
    ? fs.readdirSync(pasta, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    : [];

describe("vitrine pública", () => {
  it("lista só estabelecimentos ATIVOS e nunca expõe dado pessoal", async () => {
    const { usuario } = await criarUsuario();
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Ativo" });
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Pendente", status: "pendente_aprovacao" });
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "EmAtualizacao", status: "pendente_atualizacao" });
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Rejeitado", status: "rejeitado" });

    const res = await request(app).get("/api/estabelecimentos");
    expect(res.status).toBe(200);
    expect(res.body.map((e: any) => e.nomeFantasia)).toEqual(["Ativo"]);

    const registro = res.body[0];
    for (const campo of CAMPOS_PROIBIDOS) expect(registro).not.toHaveProperty(campo);
    expect(registro).toHaveProperty("contatoEstabelecimento");
    expect(registro).toHaveProperty("nomeFantasia");
  });

  it("o texto da resposta não contém CPF nem CNPJ de ninguém", async () => {
    const { usuario } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId, { cpfResponsavel: "98765432100" });
    const res = await request(app).get("/api/estabelecimentos");
    expect(res.text).not.toContain("98765432100");
    expect(res.text).not.toContain(est.cnpj);
    expect(res.text).not.toContain(est.emailEstabelecimento);
  });

  it("inclui as imagens de produto na listagem", async () => {
    const { usuario } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    await ImagemProduto.create({ url: "uploads/x/y/p1.webp", estabelecimentoId: est.estabelecimentoId } as any);
    const res = await request(app).get("/api/estabelecimentos");
    expect(res.body[0].produtosImg).toEqual([{ url: "uploads/x/y/p1.webp" }]);
  });

  it("busca por nome parcial, só ativos, sem dado pessoal", async () => {
    const { usuario } = await criarUsuario();
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Padaria do Zé" });
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Padaria Inativa", status: "rejeitado" });
    await criarEstabelecimento(usuario.usuarioId, { nomeFantasia: "Oficina" });

    const res = await request(app).get("/api/estabelecimentos/buscar?nome=padaria");
    expect(res.status).toBe(200);
    expect(res.body.map((e: any) => e.nomeFantasia)).toEqual(["Padaria do Zé"]);
    for (const campo of CAMPOS_PROIBIDOS) expect(res.body[0]).not.toHaveProperty(campo);
  });

  it("detalhe traz avaliações, média e imagens, sem dado pessoal", async () => {
    const { usuario } = await criarUsuario();
    const avaliador = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    await ImagemProduto.create({ url: "uploads/a.webp", estabelecimentoId: est.estabelecimentoId } as any);
    for (const [i, nota] of [5, 4].entries()) {
      const u = i === 0 ? avaliador : await criarUsuario();
      await Avaliacao.create({ nota, comentario: "c", usuarioId: u.usuario.usuarioId, estabelecimentoId: est.estabelecimentoId } as any);
    }

    const res = await request(app).get(`/api/estabelecimentos/${est.estabelecimentoId}`);
    expect(res.status).toBe(200);
    expect(res.body.media).toBe(4.5);
    expect(res.body.avaliacoes).toHaveLength(2);
    expect(res.body.produtosImg).toHaveLength(1);
    for (const campo of CAMPOS_PROIBIDOS) expect(res.body).not.toHaveProperty(campo);
  });

  it("detalhe sem avaliações tem média 0", async () => {
    const { usuario } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await request(app).get(`/api/estabelecimentos/${est.estabelecimentoId}`);
    expect(res.body.media).toBe(0);
  });

  it("detalhe de estabelecimento não ativo ou inexistente dá 404", async () => {
    const { usuario } = await criarUsuario();
    const pendente = await criarEstabelecimento(usuario.usuarioId, { status: "pendente_aprovacao" });
    expect((await request(app).get(`/api/estabelecimentos/${pendente.estabelecimentoId}`)).status).toBe(404);
    expect((await request(app).get("/api/estabelecimentos/99999")).status).toBe(404);
  });
});

describe("POST /api/estabelecimentos (cadastro)", () => {
  const formulario = (cnpj = cnpjAleatorio(), extra: Record<string, string> = {}) => ({
    nomeFantasia: "Meu Negócio",
    cnpj,
    categoria: "Gastronomia e Alimentação",
    nome_responsavel: "João da Silva",
    cpf_responsavel: "12345678901",
    cnae: "5611201",
    emailEstabelecimento: "contato@negocio.com",
    contatoEstabelecimento: "22999998888",
    endereco: "Rua X, 10",
    descricao: "Descrição",
    venda: "loja",
    ...extra,
  });

  const enviar = async (token: string, campos: Record<string, string>, arquivos: Record<string, [Buffer, string][]> = {}) => {
    let req = request(app).post("/api/estabelecimentos").set(auth(token));
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    for (const [campo, lista] of Object.entries(arquivos))
      for (const [buf, nome] of lista) req = req.attach(campo, buf, nome);
    return req;
  };

  it("exige login", async () => {
    const res = await request(app).post("/api/estabelecimentos").send(formulario());
    expect(res.status).toBe(401);
  });

  it("cria pendente de aprovação, vinculado ao usuário do token, e devolve só o id", async () => {
    const { usuario, token } = await criarUsuario();
    const res = await enviar(token, formulario());
    expect(res.status).toBe(201);
    expect(Object.keys(res.body)).toEqual(["estabelecimentoId"]);

    const salvo = await Estabelecimento.findByPk(res.body.estabelecimentoId);
    expect(salvo?.status).toBe("pendente_aprovacao");
    expect(salvo?.usuarioId).toBe(usuario.usuarioId);
    expect(salvo?.cpfResponsavel).toBe("12345678901");
  });

  it("ignora usuarioId enviado no formulário", async () => {
    const { usuario, token } = await criarUsuario();
    const { usuario: outro } = await criarUsuario();
    const res = await enviar(token, formulario(cnpjAleatorio(), { usuarioId: String(outro.usuarioId) }));
    expect(res.status).toBe(201);
    const salvo = await Estabelecimento.findByPk(res.body.estabelecimentoId);
    expect(salvo?.usuarioId).toBe(usuario.usuarioId);
  });

  it("grava logo e produtos em /uploads como webp e o CCMEI em pasta privada", async () => {
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario(), {
      logo: [[await pngReal(), "logo.png"]],
      produtos: [[await jpegReal(), "p1.jpg"], [await pngReal(), "p2.png"]],
      ccmei: [[pdfFalso(), "ccmei.pdf"]],
    });
    expect(res.status).toBe(201);

    const salvo = await Estabelecimento.findByPk(res.body.estabelecimentoId, {
      include: [{ model: ImagemProduto, as: "produtosImg" }],
    });
    expect(salvo?.logoUrl).toMatch(/^uploads\/.+\.webp$/);
    expect(salvo?.ccmeiUrl).toMatch(/^uploads-privados\/.+\.pdf$/);
    expect((salvo as any).produtosImg).toHaveLength(2);

    expect(fs.existsSync(path.resolve(salvo!.logoUrl))).toBe(true);
    expect(fs.existsSync(path.resolve(salvo!.ccmeiUrl))).toBe(true);
    // O CCMEI não pode estar acessível pela URL pública.
    const publico = await request(app).get("/" + salvo!.ccmeiUrl.replace("uploads-privados", "uploads"));
    expect(publico.status).toBe(404);
  });

  it("recusa HTML no lugar do logo e não deixa arquivo nem registro", async () => {
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario(), { logo: [[htmlMalicioso(), "logo.html"]] });
    expect(res.status).toBe(415);
    expect(await Estabelecimento.count()).toBe(0);
    expect(arquivosEm(path.resolve("uploads"))).toHaveLength(0);
    expect(arquivosEm(path.resolve("uploads-tmp"))).toHaveLength(0);
  });

  it("recusa PDF como logo (PDF só vale para o CCMEI)", async () => {
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario(), { logo: [[pdfFalso(), "logo.pdf"]] });
    expect(res.status).toBe(415);
  });

  it("exige CNPJ", async () => {
    const { token } = await criarUsuario();
    const campos: any = formulario();
    delete campos.cnpj;
    const res = await enviar(token, campos);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/CNPJ/);
  });

  it("recusa CNPJ que não é MEI", async () => {
    cnpjMock.consultarCnpj.mockResolvedValue({ ...dadosCnpjValidos, opcao_pelo_mei: false, porte: "DEMAIS" });
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/não corresponde a um MEI/);
  });

  it.each(["SUSPENSA", "BAIXADA", "3", "8"])("recusa CNPJ com situação %s", async (situacao) => {
    cnpjMock.consultarCnpj.mockResolvedValue({ ...dadosCnpjValidos, situacao_cadastral: situacao });
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/situação/);
  });

  it("aceita situação cadastral '2' (ativa)", async () => {
    cnpjMock.consultarCnpj.mockResolvedValue({ ...dadosCnpjValidos, situacao_cadastral: "2" });
    const { token } = await criarUsuario();
    expect((await enviar(token, formulario())).status).toBe(201);
  });

  it("recusa CNPJ de outra cidade", async () => {
    cnpjMock.consultarCnpj.mockResolvedValue({ ...dadosCnpjValidos, municipio: "Niterói" });
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario());
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Apenas CNPJs de Saquarema/);
  });

  it("repassa o erro da consulta de CNPJ", async () => {
    cnpjMock.consultarCnpj.mockRejectedValue(new Error("Não foi possível validar este CNPJ."));
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario());
    expect(res.status).toBe(400);
  });

  it("recusa CNPJ já cadastrado", async () => {
    const { usuario, token } = await criarUsuario();
    const existente = await criarEstabelecimento(usuario.usuarioId);
    const res = await enviar(token, formulario(existente.cnpj));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/CNPJ já cadastrado/);
  });

  it("recusa e-mail de estabelecimento já cadastrado", async () => {
    const { usuario, token } = await criarUsuario();
    const existente = await criarEstabelecimento(usuario.usuarioId);
    const res = await enviar(token, formulario(cnpjAleatorio(), { emailEstabelecimento: existente.emailEstabelecimento }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/E-mail já cadastrado/);
  });

  it("descrição acima do limite devolve mensagem amigável", async () => {
    const { token } = await criarUsuario();
    const res = await enviar(token, formulario(cnpjAleatorio(), { descricaoDiferencial: "x".repeat(70000) }));
    expect([400, 413]).toContain(res.status);
  });
});

describe("PUT /api/estabelecimentos/solicitar-atualizacao", () => {
  const solicitar = (token: string, campos: Record<string, string>) => {
    let req = request(app).put("/api/estabelecimentos/solicitar-atualizacao").set(auth(token));
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    return req;
  };

  it("o dono envia a solicitação: fica pendente e os dados novos ficam guardados à parte", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await solicitar(token, { cnpj: est.cnpj, descricao: "Nova" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Solicitação de atualização enviada para análise." });

    await est.reload();
    expect(est.status).toBe("pendente_atualizacao");
    expect((est.dados_atualizacao as any).descricao).toBe("Nova");
    expect(est.descricao).toBe("Descrição");
  });

  it("a resposta nunca devolve os dados do estabelecimento", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await solicitar(token, { cnpj: est.cnpj });
    expect(res.text).not.toContain(est.cpfResponsavel);
  });

  it("outro usuário recebe 404 e nada muda", async () => {
    const { usuario } = await criarUsuario();
    const { token: tokenOutro } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await solicitar(tokenOutro, { cnpj: est.cnpj, descricao: "Hack" });
    expect(res.status).toBe(404);
    await est.reload();
    expect(est.status).toBe("ativo");
    expect(est.dados_atualizacao).toBeNull();
  });

  it("CNPJ inexistente e CNPJ de outro dono têm a mesma resposta (não revela cadastros)", async () => {
    const { usuario } = await criarUsuario();
    const { token: tokenOutro } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const alheio = await solicitar(tokenOutro, { cnpj: est.cnpj });
    const inexistente = await solicitar(tokenOutro, { cnpj: "00000000000000" });
    expect(alheio.status).toBe(inexistente.status);
    expect(alheio.body).toEqual(inexistente.body);
  });

  it("exige CNPJ", async () => {
    const { token } = await criarUsuario();
    const res = await solicitar(token, { descricao: "x" });
    expect(res.status).toBe(400);
  });

  it("CCMEI novo vai para a pasta privada dentro dos dados pendentes", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await request(app)
      .put("/api/estabelecimentos/solicitar-atualizacao")
      .set(auth(token))
      .field("cnpj", est.cnpj)
      .attach("ccmei", pdfFalso(), "novo.pdf");
    expect(res.status).toBe(200);
    await est.reload();
    expect((est.dados_atualizacao as any).ccmei).toMatch(/^uploads-privados\/.+\.pdf$/);
  });

  it("arquivo inválido é recusado antes de alterar o estabelecimento", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await request(app)
      .put("/api/estabelecimentos/solicitar-atualizacao")
      .set(auth(token))
      .field("cnpj", est.cnpj)
      .attach("logo", htmlMalicioso(), "x.html");
    expect(res.status).toBe(415);
    await est.reload();
    expect(est.status).toBe("ativo");
  });
});

describe("POST /api/estabelecimentos/solicitar-exclusao", () => {
  const corpo = (cnpj: string) => ({
    cnpj,
    nome_responsavel: "João",
    cpf_responsavel: "12345678901",
    emailEstabelecimento: "a@b.com",
  });

  const enviar = (token: string, campos: Record<string, string>) => {
    let req = request(app).post("/api/estabelecimentos/solicitar-exclusao").set(auth(token));
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    return req;
  };

  it("o dono solicita: vira pendente_exclusao e os dados ficam guardados", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await enviar(token, corpo(est.cnpj));
    expect(res.status).toBe(200);
    await est.reload();
    expect(est.status).toBe("pendente_exclusao");
    expect((est.dados_atualizacao as any).cnpj).toBe(est.cnpj);
  });

  it("exige todos os campos", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const { nome_responsavel, ...incompleto } = corpo(est.cnpj);
    const res = await enviar(token, incompleto);
    expect(res.status).toBe(400);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("não-dono recebe 404 e o estabelecimento continua ativo", async () => {
    const { usuario } = await criarUsuario();
    const { token: tokenOutro } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const res = await enviar(tokenOutro, corpo(est.cnpj));
    expect(res.status).toBe(404);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("exige login", async () => {
    const res = await request(app).post("/api/estabelecimentos/solicitar-exclusao").send({});
    expect(res.status).toBe(401);
  });
});

describe("POST /api/estabelecimentos/:id/status", () => {
  it("só admin altera", async () => {
    const { usuario, token } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const semToken = await request(app).post(`/api/estabelecimentos/${est.estabelecimentoId}/status`).send({ ativo: false });
    const comoUsuario = await request(app).post(`/api/estabelecimentos/${est.estabelecimentoId}/status`).set(auth(token)).send({ ativo: false });
    expect(semToken.status).toBe(401);
    expect(comoUsuario.status).toBe(401);
    await est.reload();
    expect(est.status).toBe("ativo");
  });

  it("admin inativa e reativa, e a resposta não vaza dados pessoais", async () => {
    const { usuario } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const url = `/api/estabelecimentos/${est.estabelecimentoId}/status`;

    const off = await request(app).post(url).set(auth(tokenAdmin())).send({ ativo: false });
    expect(off.status).toBe(200);
    expect(off.body.ativo).toBe(false);
    expect(off.text).not.toContain(est.cpfResponsavel);
    await est.reload();
    expect(est.status).not.toBe("ativo");
    expect((await request(app).get("/api/estabelecimentos")).body).toHaveLength(0);

    const on = await request(app).post(url).set(auth(tokenAdmin())).send({ ativo: true });
    expect(on.body.status).toBe("ativo");
    expect((await request(app).get("/api/estabelecimentos")).body).toHaveLength(1);
  });

  it("exige booleano e estabelecimento existente", async () => {
    const { usuario } = await criarUsuario();
    const est = await criarEstabelecimento(usuario.usuarioId);
    const invalido = await request(app).post(`/api/estabelecimentos/${est.estabelecimentoId}/status`).set(auth(tokenAdmin())).send({ ativo: "sim" });
    const inexistente = await request(app).post("/api/estabelecimentos/99999/status").set(auth(tokenAdmin())).send({ ativo: true });
    expect(invalido.status).toBe(400);
    expect(inexistente.status).toBe(404);
  });
});

describe("POST /api/estabelecimentos/visualizacao/:identificador", () => {
  const contar = async (id: string) =>
    (await ContadorVisualizacao.findOne({ where: { identificador: id } }))?.visualizacoes;

  it("incrementa o contador a cada chamada", async () => {
    await request(app).post("/api/estabelecimentos/visualizacao/HOME");
    await request(app).post("/api/estabelecimentos/visualizacao/home");
    expect(await contar("HOME")).toBe(2);
  });

  it.each([
    ["ESPACO_MEI", "ESPACO_MEI"],
    ["PROFILE_SHARE", "PROFILE_SHARE"],
    ["CAT_GASTRONOMIA", "CAT_GASTRONOMIA"],
    ["CURSO_EXCEL", "CURSO_EXCEL"],
    ["LINK_WPP", "LINK_WPP"],
    ["REDIRECIONAMENTO_ANZOL_MEI", "REDIRECIONAMENTO_ANZOL_MEI"],
  ])("mantém o identificador %s", async (entrada, esperado) => {
    const res = await request(app).post(`/api/estabelecimentos/visualizacao/${entrada}`);
    expect(res.status).toBe(200);
    expect(await contar(esperado)).toBe(1);
  });

  it("categoria sem prefixo recebe CAT_ e é normalizada (sem acento)", async () => {
    await request(app).post(`/api/estabelecimentos/visualizacao/${encodeURIComponent("Saúde e Bem-Estar")}`);
    expect(await contar("CAT_SAUDE_E_BEM_ESTAR")).toBe(1);
  });
});
