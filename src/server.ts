import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
dotenv.config();

import app from "./app";
import sequelize from "./config/database";
import "./entities";
import EmailService from "./utils/EmailService";
import { runDatabaseMigrations } from "./migrations/initDatabaseMigration";

const PORT = Number(process.env.PORT) || 3000;

sequelize
  .authenticate()
  .then(async () => {
    console.log("Conexão com o banco estabelecida com sucesso!");
    await runDatabaseMigrations();
    return sequelize.sync();
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
    void EmailService.verifyConnection();
  })
  .catch((err) => {
    console.error("Erro ao iniciar servidor:", err);
  });
