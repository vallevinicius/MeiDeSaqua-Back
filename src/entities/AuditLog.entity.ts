import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class AuditLog extends Model {
  public id!: number;
  public ator!: string;
  public acao!: string;
  public recurso!: string | null;
  public ip!: string | null;
}

AuditLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    ator: { type: DataTypes.STRING, allowNull: false },
    acao: { type: DataTypes.STRING, allowNull: false },
    recurso: { type: DataTypes.STRING, allowNull: true },
    ip: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    tableName: "audit_logs",
    timestamps: true,
    updatedAt: false,
  },
);

export default AuditLog;
