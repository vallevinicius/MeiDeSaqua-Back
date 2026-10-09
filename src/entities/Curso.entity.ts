import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Curso extends Model {
  public cursoId!: number;
  public nome!: string;
  public link!: string | null;
  public imagemUrl!: string | null;
}

Curso.init(
  {
    cursoId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "id",
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "titulo",
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    imagemUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "imagemUrl",
    },
  },
  {
    sequelize,
    tableName: "cursos",
    timestamps: true,
  },
);

export default Curso;