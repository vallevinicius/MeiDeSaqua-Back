import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class Usuario extends Model {
  public usuarioId!: number;
  public nomeCompleto!: string;
  public username!: string;
  public email!: string;
  public password!: string;
  public enabled!: boolean;
  public confirmationToken!: string | null;
  public resetPasswordToken!: string | null;
  public resetPasswordTokenExpiry!: Date | null;
  public unconfirmedEmail!: string | null;
  public emailChangeToken!: string | null;
}

Usuario.init({
  usuarioId: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    field: 'usuario_id'
  },
  nomeCompleto: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'nome_completo_user'
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  confirmationToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'confirmation_token'
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'reset_password_token'
  },
  resetPasswordTokenExpiry: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'reset_password_token_expiry'
  },
  unconfirmedEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'unconfirmed_email'
  },
  emailChangeToken: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'email_change_token'
  }
}, {
  sequelize,
  tableName: 'usuarios',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default Usuario;