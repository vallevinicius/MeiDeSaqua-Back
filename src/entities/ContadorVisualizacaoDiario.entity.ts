import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class ContadorVisualizacaoDiario extends Model {
  public id!: number;
  public identificador!: string;
  public data!: string;
  public visualizacoes!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

ContadorVisualizacaoDiario.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    identificador: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    data: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    visualizacoes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: "contador_visualizacoes_diarias",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["identificador", "data"],
        name: "idx_contador_diario_identificador_data",
      },
    ],
  }
);

export default ContadorVisualizacaoDiario;
