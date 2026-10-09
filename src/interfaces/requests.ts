import { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
  };
}

export interface IUpdateProfileRequest {
  nomeCompleto?: string;
  username?: string;
  email?: string;
}

export interface IUpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ICreateUpdateEstabelecimentoRequest {
  categoria?: string;
  contatoEstabelecimento?: string;
  cnpj?: string;
  nomeFantasia?: string;
  emailEstabelecimento?: string;
  endereco?: string;
  descricao?: string;
  descricaoDiferencial?: string;
  tagsInvisiveis?: string;
  website?: string;
  instagram?: string;
  ativo?: boolean;
  logoUrl?: string;
  areasAtuacao?: string;
}
