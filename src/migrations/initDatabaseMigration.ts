import { DataTypes } from "sequelize";
import sequelize from "../config/database";
import ContadorVisualizacaoDiario from "../entities/ContadorVisualizacaoDiario.entity";
import HistoricoRelatorioCampanha from "../entities/HistoricoRelatorioCampanha.entity";

export async function runDatabaseMigrations(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const tabelas = await queryInterface.showAllTables();
    const tabelasNormalizadas = (Array.isArray(tabelas) ? tabelas : []).map((t: any) =>
      typeof t === "string" ? t.toLowerCase() : (t.tableName || "").toLowerCase()
    );

    // 1. Migração idempotente para tabela 'usuarios'
    if (tabelasNormalizadas.includes("usuarios")) {
      const colunasUsuarios = await queryInterface.describeTable("usuarios").catch(() => null);
      if (colunasUsuarios) {
        if (!colunasUsuarios["created_at"]) {
          await queryInterface.addColumn("usuarios", "created_at", {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
          });
          console.log("[MIGRATION] Coluna 'created_at' adicionada à tabela 'usuarios'.");
        }
        if (!colunasUsuarios["updated_at"]) {
          await queryInterface.addColumn("usuarios", "updated_at", {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
          });
          console.log("[MIGRATION] Coluna 'updated_at' adicionada à tabela 'usuarios'.");
        }
      }
    }

    // 2. Migração idempotente para tabela 'avaliacoes'
    if (tabelasNormalizadas.includes("avaliacoes")) {
      const colunasAvaliacoes = await queryInterface.describeTable("avaliacoes").catch(() => null);
      if (colunasAvaliacoes) {
        if (!colunasAvaliacoes["created_at"]) {
          await queryInterface.addColumn("avaliacoes", "created_at", {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
          });
          console.log("[MIGRATION] Coluna 'created_at' adicionada à tabela 'avaliacoes'.");
        }
        if (!colunasAvaliacoes["updated_at"]) {
          await queryInterface.addColumn("avaliacoes", "updated_at", {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize.literal("CURRENT_TIMESTAMP"),
          });
          console.log("[MIGRATION] Coluna 'updated_at' adicionada à tabela 'avaliacoes'.");
        }
      }
    }

    // 3. Garantir criação da tabela de contagem diária com índice composto
    await ContadorVisualizacaoDiario.sync();
    console.log("[MIGRATION] Tabela 'contador_visualizacoes_diarias' pronta.");

    // 4. Garantir criação da tabela de histórico de disparos de relatórios de campanha
    await HistoricoRelatorioCampanha.sync();
    console.log("[MIGRATION] Tabela 'historico_relatorios_campanha' pronta.");
  } catch (error) {
    console.error("[MIGRATION_ERROR] Falha ao executar migrações de banco:", error);
  }
}
