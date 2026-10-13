// Move os CCMEIs já gravados em /uploads (públicos) para uploads-privados e
// atualiza o banco. Uso: npx ts-node scripts/migrar-ccmei.ts [--aplicar]
// Sem --aplicar apenas lista o que seria movido.
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
dotenv.config();

import sequelize from "../src/config/database";
import Estabelecimento from "../src/entities/Estabelecimento.entity";
import { PRIVATE_DIR_NAME, PRIVATE_UPLOADS_DIR } from "../src/utils/privateFiles";

const aplicar = process.argv.includes("--aplicar");
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

const migrar = async (caminho: string | null | undefined) => {
  if (!caminho) return null;
  const relativo = caminho.replace(/^\/+/, "");
  if (!relativo.startsWith("uploads/")) return null;

  const origem = path.resolve(process.cwd(), relativo);
  if (!origem.startsWith(UPLOADS_DIR + path.sep)) return null;

  const destino = path.join(PRIVATE_UPLOADS_DIR, path.relative(UPLOADS_DIR, origem));
  console.log(`${aplicar ? "Movendo" : "[simulação]"} ${relativo} -> ${PRIVATE_DIR_NAME}/${path.relative(UPLOADS_DIR, origem)}`);
  if (aplicar) {
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.rename(origem, destino).catch((erro) => {
      if (erro.code !== "ENOENT") throw erro;
      console.warn(`  arquivo não encontrado em disco: ${relativo}`);
    });
  }
  return path.join(PRIVATE_DIR_NAME, path.relative(UPLOADS_DIR, origem)).replace(/\\/g, "/");
};

(async () => {
  const todos = await Estabelecimento.findAll();
  for (const est of todos) {
    const novoCcmei = await migrar(est.ccmeiUrl);
    const pendente = (est.dados_atualizacao || {}) as any;
    const novoPendente = await migrar(pendente.ccmei);

    if (aplicar && (novoCcmei || novoPendente)) {
      if (novoCcmei) est.ccmeiUrl = novoCcmei;
      if (novoPendente) est.dados_atualizacao = { ...pendente, ccmei: novoPendente };
      await est.save();
    }
  }
  await sequelize.close();
})();
