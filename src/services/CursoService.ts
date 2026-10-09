import { QueryTypes } from "sequelize";
import sequelize from "../config/database";

type CursoPayload = {
  nome?: unknown;
  link?: unknown;
  imagemUrl?: unknown;
};

class CursoService {
  private schemaCache:
    | {
        idCol: string;
        nomeCol: string;
        linkCol: string | null;
        imagemCol: string | null;
        descricaoCol: string | null;
        ativoCol: string | null;
        createdAtCol: string | null;
        updatedAtCol: string | null;
      }
    | null = null;

  private normalizePayload(payload?: CursoPayload, isUpdate = false) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Corpo da requisição inválido.");
    }

    const normalized: {
      nome?: string;
      link?: string | null;
      imagemUrl?: string | null;
    } = {};

    if (!isUpdate || payload.nome !== undefined) {
      if (typeof payload.nome !== "string" || payload.nome.trim().length === 0) {
        throw new Error("O campo 'nome' é obrigatório.");
      }
      normalized.nome = payload.nome.trim();
    }

    if (payload.link !== undefined) {
      if (payload.link !== null && typeof payload.link !== "string") {
        throw new Error("O campo 'link' deve ser string ou null.");
      }
      normalized.link = payload.link;
    }

    if (payload.imagemUrl !== undefined) {
      if (payload.imagemUrl !== null && typeof payload.imagemUrl !== "string") {
        throw new Error("O campo 'imagemUrl' deve ser string ou null.");
      }
      normalized.imagemUrl = payload.imagemUrl;
    }

    return normalized;
  }

  private async resolveSchema() {
    if (this.schemaCache) {
      return this.schemaCache;
    }

    const columns = (await sequelize.query("SHOW COLUMNS FROM cursos", {
      type: QueryTypes.SELECT,
    })) as Array<{ Field: string }>;

    const fieldNames = new Set(columns.map((column) => column.Field));

    const pick = (candidates: string[]) =>
      candidates.find((candidate) => fieldNames.has(candidate)) ?? null;

    const idCol = pick(["id", "curso_id"]);
    const nomeCol = pick(["titulo", "nome"]);

    if (!idCol || !nomeCol) {
      throw new Error(
        "Tabela 'cursos' com schema incompatível (faltando id/curso_id ou titulo/nome).",
      );
    }

    this.schemaCache = {
      idCol,
      nomeCol,
      linkCol: pick(["link"]),
      imagemCol: pick(["imagemUrl", "imagem_url"]),
      descricaoCol: pick(["descricao"]),
      ativoCol: pick(["ativo"]),
      createdAtCol: pick(["createdAt", "created_at"]),
      updatedAtCol: pick(["updatedAt", "updated_at"]),
    };

    return this.schemaCache;
  }

  private async findById(cursoId: number) {
    const schema = await this.resolveSchema();

    const rows = (await sequelize.query(
      `
      SELECT
        \`${schema.idCol}\` AS cursoId,
        \`${schema.nomeCol}\` AS nome,
        ${schema.descricaoCol ? `\`${schema.descricaoCol}\`` : "NULL"} AS descricao,
        ${schema.linkCol ? `\`${schema.linkCol}\`` : "NULL"} AS link,
        ${schema.imagemCol ? `\`${schema.imagemCol}\`` : "NULL"} AS imagemUrl,
        ${schema.ativoCol ? `\`${schema.ativoCol}\`` : "1"} AS ativo,
        ${schema.createdAtCol ? `\`${schema.createdAtCol}\`` : "NULL"} AS createdAt,
        ${schema.updatedAtCol ? `\`${schema.updatedAtCol}\`` : "NULL"} AS updatedAt
      FROM cursos
      WHERE \`${schema.idCol}\` = :cursoId
      LIMIT 1
      `,
      {
        replacements: { cursoId },
        type: QueryTypes.SELECT,
      },
    )) as Array<any>;

    return rows[0] ?? null;
  }

  public async listarTodos() {
    const schema = await this.resolveSchema();
    const orderCol = schema.createdAtCol ?? schema.idCol;

    return sequelize.query(
      `
      SELECT
        \`${schema.idCol}\` AS cursoId,
        \`${schema.nomeCol}\` AS nome,
        ${schema.descricaoCol ? `\`${schema.descricaoCol}\`` : "NULL"} AS descricao,
        ${schema.linkCol ? `\`${schema.linkCol}\`` : "NULL"} AS link,
        ${schema.imagemCol ? `\`${schema.imagemCol}\`` : "NULL"} AS imagemUrl,
        ${schema.ativoCol ? `\`${schema.ativoCol}\`` : "1"} AS ativo,
        ${schema.createdAtCol ? `\`${schema.createdAtCol}\`` : "NULL"} AS createdAt,
        ${schema.updatedAtCol ? `\`${schema.updatedAtCol}\`` : "NULL"} AS updatedAt
      FROM cursos
      ORDER BY \`${orderCol}\` DESC
      `,
      {
        type: QueryTypes.SELECT,
      },
    );
  }

  public async criar(payload: CursoPayload) {
    const dados = this.normalizePayload(payload, false);
    const schema = await this.resolveSchema();

    const columns: string[] = [schema.nomeCol];
    const values: string[] = [":nome"];
    const replacements: Record<string, unknown> = { nome: dados.nome };

    if (schema.linkCol && dados.link !== undefined) {
      columns.push(schema.linkCol);
      values.push(":link");
      replacements.link = dados.link;
    }

    if (schema.imagemCol && dados.imagemUrl !== undefined) {
      columns.push(schema.imagemCol);
      values.push(":imagemUrl");
      replacements.imagemUrl = dados.imagemUrl;
    }

    await sequelize.query(
      `INSERT INTO cursos (${columns.map((c) => `\`${c}\``).join(", ")}) VALUES (${values.join(", ")})`,
      {
        replacements,
        type: QueryTypes.INSERT,
      },
    );

    const [insertResult] = (await sequelize.query("SELECT LAST_INSERT_ID() AS id", {
      type: QueryTypes.SELECT,
    })) as Array<{ id: number }>;

    const created = await this.findById(Number(insertResult.id));
    if (!created) {
      throw new Error("Falha ao criar curso.");
    }

    return created;
  }

  public async atualizar(cursoId: number, payload: CursoPayload) {
    const existing = await this.findById(cursoId);
    if (!existing) {
      throw new Error("Curso não encontrado.");
    }

    const dados = this.normalizePayload(payload, true);
    const schema = await this.resolveSchema();
    const updates: string[] = [];
    const replacements: Record<string, unknown> = { cursoId };

    if (dados.nome !== undefined) {
      updates.push(`\`${schema.nomeCol}\` = :nome`);
      replacements.nome = dados.nome;
    }

    if (schema.linkCol && dados.link !== undefined) {
      updates.push(`\`${schema.linkCol}\` = :link`);
      replacements.link = dados.link;
    }

    if (schema.imagemCol && dados.imagemUrl !== undefined) {
      updates.push(`\`${schema.imagemCol}\` = :imagemUrl`);
      replacements.imagemUrl = dados.imagemUrl;
    }

    if (updates.length === 0) {
      throw new Error("Nenhum campo válido foi informado para atualização.");
    }

    await sequelize.query(
      `UPDATE cursos SET ${updates.join(", ")} WHERE \`${schema.idCol}\` = :cursoId`,
      {
        replacements,
        type: QueryTypes.UPDATE,
      },
    );

    const updated = await this.findById(cursoId);
    if (!updated) {
      throw new Error("Curso não encontrado.");
    }

    return updated;
  }

  public async remover(cursoId: number) {
    const existing = await this.findById(cursoId);
    if (!existing) {
      throw new Error("Curso não encontrado.");
    }

    const schema = await this.resolveSchema();

    await sequelize.query(
      `DELETE FROM cursos WHERE \`${schema.idCol}\` = :cursoId`,
      {
        replacements: { cursoId },
        type: QueryTypes.DELETE,
      },
    );
  }
}

export default new CursoService();