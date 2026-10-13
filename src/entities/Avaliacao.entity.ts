// ARQUIVO: src/entities/Avaliacao.entity.ts (CORRIGIDO)

import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";
import Usuario from "./Usuario.entity"; // Importação mantida caso você use em métodos de instância

class Avaliacao extends Model {
  public avaliacoesId!: number;
  public comentario!: string;
  public nota!: number | null;
  public usuarioId!: number;
  public estabelecimentoId!: number;
  public parentId!: number | null;

  // Tipagens para associações (definidas no index.ts)
  public readonly respostas?: Avaliacao[];
  public readonly pai?: Avaliacao;
  public readonly usuario?: Usuario;
}

Avaliacao.init(
  {
    avaliacoesId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "avaliacoes_id",
    },
    comentario: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nota: {
      type: DataTypes.DOUBLE,
      allowNull: true, // <-- CORRIGIDO (veio do seu 'notNull Violation' anterior)
    },
    usuarioId: {
      type: DataTypes.INTEGER,
      field: "usuario_id",
    },
    estabelecimentoId: {
      type: DataTypes.INTEGER,
      field: "estabelecimento_id",
    },
    parentId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "parent_id", // O nome da coluna no banco
      references: {
        model: "avaliacoes", // Nome da tabela
        key: "avaliacoes_id",
      },
    },
  },
  {
    sequelize,
    tableName: "avaliacoes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// REMOVA AS ASSOCIAÇÕES DAQUI
// Elas devem ficar APENAS no 'index.ts' para evitar o erro de alias duplicado

export default Avaliacao;
