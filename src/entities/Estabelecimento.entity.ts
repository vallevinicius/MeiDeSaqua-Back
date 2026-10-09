import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

// Enum para padronizar os status do estabelecimento
export enum StatusEstabelecimento {
  PENDENTE_APROVACAO = "pendente_aprovacao",
  ATIVO = "ativo",
  PENDENTE_ATUALIZACAO = "pendente_atualizacao",
  PENDENTE_EXCLUSAO = "pendente_exclusao",
  REJEITADO = "rejeitado",
}

class Estabelecimento extends Model {
  public estabelecimentoId!: number;
  public usuarioId!: number;
  public categoria!: string;
  public contatoEstabelecimento!: string;
  public cnpj!: string;
  public nomeFantasia!: string;
  public emailEstabelecimento!: string;
  public endereco!: string;
  public descricao!: string;
  public descricaoDiferencial!: string;
  public tagsInvisiveis!: string;
  public website!: string;
  public instagram!: string;
  public ativo!: boolean;
  public logoUrl!: string;
  public status!: StatusEstabelecimento;
  public dados_atualizacao!: object | null;
  public cnae!: string;
  public nomeResponsavel!: string;
  public cpfResponsavel!: string;
  public ccmeiUrl!: string;
  public venda!: string;
  public escala!: string;
}

Estabelecimento.init(
  {
    estabelecimentoId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "estabelecimento_id",
    },
    usuarioId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "usuario_id",
    },
    categoria: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    nomeResponsavel: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "nome_responsavel",
    },
    cpfResponsavel: {
      type: DataTypes.STRING(14),
      allowNull: false,
      field: "cpf_responsavel",
    },
    ccmeiUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "ccmeiUrl",
    },
    cnae: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: "cnae",
    },
    contatoEstabelecimento: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "contato_estabelecimento",
    },
    cnpj: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    nomeFantasia: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "nome_fantasia",
    },
    emailEstabelecimento: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "email_estabelecimento",
    },
    endereco: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    descricaoDiferencial: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "descricao_diferencial",
    },
    tagsInvisiveis: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "tags_invisiveis",
    },
    website: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    instagram: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false,
    },
    logoUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "logoUrl",
    },
    status: {
      type: DataTypes.ENUM(...Object.values(StatusEstabelecimento)),
      allowNull: false,
      defaultValue: StatusEstabelecimento.PENDENTE_APROVACAO,
      field: "status",
    },
    dados_atualizacao: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "dados_atualizacao",
    },
    areasAtuacao: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "area_atuacao",
    },
    venda: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "venda",
    },
    escala: {
      type: DataTypes.INTEGER, 
      allowNull: false,        
      defaultValue: 0,         
      field: 'escala',         
    },
  },
  {
    sequelize,
    tableName: "estabelecimentos",
    timestamps: true,
  }
);

export default Estabelecimento;
