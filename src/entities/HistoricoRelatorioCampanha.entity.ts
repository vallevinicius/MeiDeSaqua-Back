import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class HistoricoRelatorioCampanha extends Model {
  public id!: number;
  public tipoCampanha!: string;
  public totalMei!: number;
  public totalUsuario!: number;
  public totalGeral!: number;
  public deltaMei!: number;
  public deltaUsuario!: number;
  public deltaGeral!: number;
  public destinatarios!: string;
  public statusEnvio!: string;
  public erro!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

HistoricoRelatorioCampanha.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    tipoCampanha: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "ANZOL",
      field: "tipo_campanha",
    },
    totalMei: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "total_mei",
    },
    totalUsuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "total_usuario",
    },
    totalGeral: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "total_geral",
    },
    deltaMei: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "delta_mei",
    },
    deltaUsuario: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "delta_usuario",
    },
    deltaGeral: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "delta_geral",
    },
    destinatarios: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    statusEnvio: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "SUCESSO",
      field: "status_envio",
    },
    erro: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      field: "created_at",
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: "updated_at",
    },
  },
  {
    sequelize,
    tableName: "historico_relatorios_campanha",
    timestamps: true,
    indexes: [
      {
        fields: ["tipo_campanha", "created_at"],
        name: "idx_hist_relatorio_tipo_data",
      },
    ],
  }
);

export default HistoricoRelatorioCampanha;
