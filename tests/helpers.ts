import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { vi } from "vitest";
import CnpjService from "../src/services/CnpjService";
import EmailService from "../src/utils/EmailService";

export const tokenUsuario = (id = 1) =>
  jwt.sign({ id, username: "teste" }, process.env.JWT_SECRET as string, {
    algorithm: "HS256",
  });

export const tokenAdmin = () =>
  jwt.sign(
    { username: "admin-teste", role: "admin" },
    process.env.ADMIN_JWT_SECRET as string,
    { algorithm: "HS256" },
  );

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const pngReal = () =>
  sharp({
    create: { width: 20, height: 20, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();

export const jpegReal = () =>
  sharp({
    create: { width: 20, height: 20, channels: 3, background: "blue" },
  })
    .jpeg()
    .toBuffer();

export const pdfFalso = () => Buffer.from("%PDF-1.4 conteudo");
export const htmlMalicioso = () => Buffer.from("<script>alert(1)</script>");

export const cnpjAleatorio = () =>
  String(Math.floor(Math.random() * 1e14)).padStart(14, "0");

// ---- Banco ----------------------------------------------------------------

export const prepararBanco = async () => {
  const { default: sequelize } = await import("../src/config/database");
  await import("../src/entities");
  await sequelize.sync({ force: true });
  return sequelize;
};

export const limparBanco = async () => {
  const { default: sequelize } = await import("../src/config/database");
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
  const tabelas = (await sequelize.query("SHOW TABLES", {
    type: "SELECT" as any,
  })) as Record<string, string>[];
  for (const linha of tabelas) {
    await sequelize.query(`TRUNCATE TABLE \`${Object.values(linha)[0]}\``);
  }
  await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
};

// Esvazia as pastas de upload (ficam em diretório temporário, nunca no projeto).
export const limparUploads = () => {
  for (const pasta of ["uploads", "uploads-privados", "uploads-tmp"]) {
    fs.rmSync(path.resolve(pasta), { recursive: true, force: true });
  }
  // O multer grava aqui e o módulo só cria a pasta uma vez, ao ser importado.
  fs.mkdirSync(path.resolve("uploads-tmp"), { recursive: true });
};

export const fecharBanco = async () => {
  const { default: sequelize } = await import("../src/config/database");
  await sequelize.close();
};

// ---- Fábricas -------------------------------------------------------------

let contador = 0;
const proximo = () => ++contador;

export const criarUsuario = async (
  dados: Partial<{
    nomeCompleto: string;
    username: string;
    email: string;
    password: string;
    enabled: boolean;
  }> = {},
) => {
  const { Usuario } = await import("../src/entities");
  const n = proximo();
  const senha = dados.password ?? "senha123";
  const usuario = await Usuario.create({
    nomeCompleto: dados.nomeCompleto ?? `Usuario ${n}`,
    username: dados.username ?? `usuario${n}`,
    email: dados.email ?? `usuario${n}@teste.com`,
    password: await bcrypt.hash(senha, 4),
    enabled: dados.enabled ?? true,
  });
  return { usuario, senha, token: tokenUsuario(usuario.usuarioId) };
};

export const criarEstabelecimento = async (
  usuarioId: number,
  dados: Record<string, any> = {},
) => {
  const { Estabelecimento } = await import("../src/entities");
  const n = proximo();
  return Estabelecimento.create({
    usuarioId,
    nomeFantasia: `Negocio ${n}`,
    categoria: "Gastronomia e Alimentação",
    nomeResponsavel: `Responsavel ${n}`,
    cpfResponsavel: "12345678901",
    cnpj: cnpjAleatorio(),
    cnae: "5611201",
    emailEstabelecimento: `negocio${n}@teste.com`,
    contatoEstabelecimento: "22999999999",
    endereco: "Rua A, 1",
    descricao: "Descrição",
    venda: "loja",
    status: "ativo",
    ativo: true,
    ...dados,
  } as any);
};

// ---- Mocks de serviços externos ------------------------------------------

export const emailMock = EmailService as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;
export const cnpjMock = CnpjService as unknown as {
  consultarCnpj: ReturnType<typeof vi.fn>;
};

export const dadosCnpjValidos = {
  municipio: "Saquarema",
  uf: "RJ",
  situacao_cadastral: "ATIVA",
  porte: "MICRO EMPRESA",
  opcao_pelo_mei: true,
};

export const resetarMocks = () => {
  for (const fn of Object.values(emailMock)) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
  cnpjMock.consultarCnpj.mockReset();
  cnpjMock.consultarCnpj.mockResolvedValue({ ...dadosCnpjValidos });
};
