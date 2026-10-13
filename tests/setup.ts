import dotenv from "dotenv";
import fs from "fs";
import mysql from "mysql2/promise";
import os from "os";
import path from "path";
import { afterAll, vi } from "vitest";

// 1) Credenciais do MySQL local vêm do .env, mas o banco é SEMPRE o de teste.
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
process.env.DB_NAME = "meis_de_saqua_test";

const hostLocal = ["localhost", "127.0.0.1", "::1"].includes(
  process.env.DB_HOST || "localhost",
);
if (!hostLocal || !process.env.DB_NAME.endsWith("_test")) {
  throw new Error("Testes só podem rodar em um banco local terminado em _test.");
}

// 2) Segredos e variáveis fixos: nenhum teste usa os segredos reais.
process.env.JWT_SECRET = "segredo-de-teste";
process.env.ADMIN_JWT_SECRET = "segredo-admin-de-teste";
process.env.ADMIN_USER = "admin-teste";
process.env.ADMIN_PASSWORD = "senha-teste";
process.env.CORS_ORIGINS = "http://localhost:3300";
process.env.FRONTEND_URL = "http://localhost:3300";

// 3) Uploads em pasta temporária: nunca toca em uploads/ do projeto.
const pastaTemporaria = fs.mkdtempSync(path.join(os.tmpdir(), "meidesaqua-test-"));
process.chdir(pastaTemporaria);
afterAll(() => fs.rmSync(pastaTemporaria, { recursive: true, force: true }));

// 4) Cria o banco de teste se ainda não existir.
const conexao = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
await conexao.query(
  "CREATE DATABASE IF NOT EXISTS `meis_de_saqua_test` CHARACTER SET utf8mb4",
);
await conexao.end();

// 5) Serviços externos substituídos: nenhum e-mail ou consulta de CNPJ real.
vi.mock("../src/utils/EmailService", () => ({
  default: {
    verifyConnection: vi.fn(async () => {}),
    sendConfirmationEmail: vi.fn(async () => {}),
    sendPasswordResetEmail: vi.fn(async () => {}),
    sendEmailChangeConfirmationEmail: vi.fn(async () => {}),
    sendGenericEmail: vi.fn(async () => {}),
  },
}));

vi.mock("../src/services/CnpjService", () => ({
  default: { consultarCnpj: vi.fn() },
}));

// 6) Rate limit desligado nos testes de rota (há teste próprio do limitador).
vi.mock("../src/middlewares/rateLimit.middleware", () => {
  const livre = (_req: any, _res: any, next: any) => next();
  return {
    limiteGeral: livre,
    limiteLogin: livre,
    limiteCadastro: livre,
    limiteEmail: livre,
    limiteUpload: livre,
    limiteUploadPorUsuario: livre,
    limiteVisualizacao: livre,
  };
});
