import sequelize from "./database";

const colunaExiste = async (tabela: string, coluna: string): Promise<boolean> => {
  const [linhas] = await sequelize.query(`SHOW COLUMNS FROM \`${tabela}\` LIKE '${coluna}'`);
  return (linhas as unknown[]).length > 0;
};

// O sync() cria tabelas novas, mas nunca acrescenta colunas em tabelas existentes.
// Estas migrações são seguras para rodar a cada inicialização: só alteram o que falta.
export async function garantirColunas(): Promise<void> {
  // Fase 3: invalidação de tokens.
  if (!(await colunaExiste("usuarios", "token_version"))) {
    await sequelize.query("ALTER TABLE usuarios ADD COLUMN token_version INT NOT NULL DEFAULT 0");
    console.log("Coluna usuarios.token_version criada.");
  }

  // Vínculo usuário <-> estabelecimento (já usado pelo código, mas ausente em bancos antigos).
  if (!(await colunaExiste("estabelecimentos", "usuario_id"))) {
    await sequelize.query("ALTER TABLE estabelecimentos ADD COLUMN usuario_id INT NULL, ADD INDEX idx_estabelecimentos_usuario (usuario_id)");
    console.log("Coluna estabelecimentos.usuario_id criada.");
  }

  // Preenche o dono dos estabelecimentos sem vínculo pelo e-mail igual ao do usuário.
  const [, resultado] = (await sequelize.query(`
    UPDATE estabelecimentos e
    JOIN usuarios u ON LOWER(u.email) = LOWER(e.email_estabelecimento)
    SET e.usuario_id = u.usuario_id
    WHERE e.usuario_id IS NULL
  `)) as [unknown, any];
  const vinculados = resultado?.affectedRows ?? 0;
  if (vinculados > 0) console.log(`${vinculados} estabelecimento(s) vinculado(s) ao usuário pelo e-mail.`);

  const [orfaos] = await sequelize.query("SELECT COUNT(*) AS n FROM estabelecimentos WHERE usuario_id IS NULL");
  const semDono = Number((orfaos as any[])[0]?.n ?? 0);
  if (semDono > 0) {
    console.warn(
      `AVISO: ${semDono} estabelecimento(s) sem usuário vinculado. O admin continua enxergando, mas o dono não consegue editar até haver vínculo.`,
    );
  }
}
