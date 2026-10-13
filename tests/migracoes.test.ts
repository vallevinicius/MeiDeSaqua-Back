import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { garantirColunas } from "../src/config/migracoes";
import { criarEstabelecimento, criarUsuario, fecharBanco, limparBanco, prepararBanco, tokenUsuario } from "./helpers";

beforeAll(prepararBanco);
afterAll(fecharBanco);

const colunaExiste = async () => {
  const { default: sequelize } = await import("../src/config/database");
  const [c] = await sequelize.query("SHOW COLUMNS FROM usuarios LIKE 'token_version'");
  return (c as unknown[]).length > 0;
};

describe("migração da coluna token_version (banco criado antes da Fase 3)", () => {
  it("acrescenta a coluna quando falta, com padrão 0, preservando os usuários existentes", async () => {
    const { default: sequelize } = await import("../src/config/database");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { usuario } = await criarUsuario({ username: "antigo" });
    await sequelize.query("ALTER TABLE usuarios DROP COLUMN token_version");
    expect(await colunaExiste()).toBe(false);

    await garantirColunas();

    expect(await colunaExiste()).toBe(true);
    const [linhas] = await sequelize.query(`SELECT token_version FROM usuarios WHERE usuario_id = ${usuario.usuarioId}`);
    expect((linhas as any[])[0].token_version).toBe(0);
  });

  it("é idempotente: rodar de novo não altera nem falha", async () => {
    await garantirColunas();
    await garantirColunas();
    expect(await colunaExiste()).toBe(true);
  });

  it("tokens emitidos antes da Fase 3 (sem 'ver') continuam valendo até expirar", async () => {
    const { token } = await criarUsuario();
    const app = (await import("../src/app")).default;
    const request = (await import("supertest")).default;
    const res = await request(app).get("/api/users/profile/estabelecimentos").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    void tokenUsuario;
  });
});

describe("migração do vínculo estabelecimentos.usuario_id (banco criado antes do vínculo)", () => {
  const consultar = async (sql: string) => {
    const { default: sequelize } = await import("../src/config/database");
    const [linhas] = await sequelize.query(sql);
    return linhas as any[];
  };

  const recriarFormatoAntigo = async () => {
    await limparBanco();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const dono = await criarUsuario({ email: "dono@teste.com" });
    const outro = await criarUsuario({ email: "outro@teste.com" });
    const com = await criarEstabelecimento(dono.usuario.usuarioId, { emailEstabelecimento: "DONO@teste.com" });
    const orfao = await criarEstabelecimento(outro.usuario.usuarioId, { emailEstabelecimento: "ninguem@teste.com" });
    const { default: sequelize } = await import("../src/config/database");
    // O banco de teste nasce com chave estrangeira; o banco antigo não tinha a coluna.
    const chaves = await consultar(
      "SELECT CONSTRAINT_NAME AS nome FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'estabelecimentos' AND COLUMN_NAME = 'usuario_id' AND REFERENCED_TABLE_NAME IS NOT NULL",
    );
    for (const { nome } of chaves) await sequelize.query(`ALTER TABLE estabelecimentos DROP FOREIGN KEY \`${nome}\``);
    await sequelize.query("ALTER TABLE estabelecimentos DROP COLUMN usuario_id");
    return { dono, com, orfao };
  };

  it("cria a coluna e vincula pelo e-mail (sem diferenciar maiúsculas); sem correspondência fica sem dono", async () => {
    const { dono, com, orfao } = await recriarFormatoAntigo();
    expect(await consultar("SHOW COLUMNS FROM estabelecimentos LIKE 'usuario_id'")).toHaveLength(0);

    await garantirColunas();

    const linhas = await consultar("SELECT estabelecimento_id, usuario_id FROM estabelecimentos ORDER BY estabelecimento_id");
    const porId = Object.fromEntries(linhas.map((l) => [l.estabelecimento_id, l.usuario_id]));
    expect(porId[com.estabelecimentoId]).toBe(dono.usuario.usuarioId);
    expect(porId[orfao.estabelecimentoId]).toBeNull();
  });

  it("avisa quantos estabelecimentos ficaram sem dono", async () => {
    await recriarFormatoAntigo();
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    await garantirColunas();
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("1 estabelecimento(s) sem usuário"));
  });

  it("não sobrescreve vínculos que já existem e é idempotente", async () => {
    const { dono, com } = await recriarFormatoAntigo();
    await garantirColunas();
    const { default: sequelize } = await import("../src/config/database");
    const { usuario: terceiro } = await criarUsuario({ email: "terceiro@teste.com" });
    await sequelize.query(`UPDATE estabelecimentos SET usuario_id = ${terceiro.usuarioId} WHERE estabelecimento_id = ${com.estabelecimentoId}`);

    await garantirColunas();
    await garantirColunas();

    const [linha] = await consultar(`SELECT usuario_id FROM estabelecimentos WHERE estabelecimento_id = ${com.estabelecimentoId}`);
    expect(linha.usuario_id).toBe(terceiro.usuarioId);
    expect(linha.usuario_id).not.toBe(dono.usuario.usuarioId);
  });

  it("depois da migração as consultas do admin voltam a funcionar", async () => {
    await recriarFormatoAntigo();
    await garantirColunas();
    const app = (await import("../src/app")).default;
    const request = (await import("supertest")).default;
    const { tokenAdmin } = await import("./helpers");
    const res = await request(app).get("/api/admin/pending").set("Authorization", `Bearer ${tokenAdmin()}`);
    expect(res.status).toBe(200);
  });
});
