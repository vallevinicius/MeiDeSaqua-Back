import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

// Sessão de login renovável. Guarda só o hash do refresh token.
class Sessao extends Model {
  public id!: number;
  public usuarioId!: number;
  public tokenHash!: string;
  public expiraEm!: Date;
  public revogadaEm!: Date | null;
  public ip!: string | null;
  public userAgent!: string | null;
}

Sessao.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    usuarioId: { type: DataTypes.INTEGER, allowNull: false, field: "usuario_id" },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: "token_hash" },
    expiraEm: { type: DataTypes.DATE, allowNull: false, field: "expira_em" },
    revogadaEm: { type: DataTypes.DATE, allowNull: true, field: "revogada_em" },
    ip: { type: DataTypes.STRING, allowNull: true },
    userAgent: { type: DataTypes.STRING, allowNull: true, field: "user_agent" },
  },
  { sequelize, tableName: "sessoes", timestamps: true, updatedAt: false },
);

export default Sessao;
