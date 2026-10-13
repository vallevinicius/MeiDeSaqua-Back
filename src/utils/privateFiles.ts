import path from "path";

// Documentos com dado pessoal (CCMEI). Fora do /uploads, nunca servido estaticamente.
export const PRIVATE_DIR_NAME = "uploads-privados";
export const PRIVATE_UPLOADS_DIR = path.resolve(process.cwd(), PRIVATE_DIR_NAME);

const BASES_PERMITIDAS = [PRIVATE_UPLOADS_DIR, path.resolve(process.cwd(), "uploads")];

// Converte o caminho salvo no banco em caminho absoluto, só se estiver dentro
// de uma das pastas de arquivos (evita path traversal).
export const resolverArquivo = (caminhoSalvo: string): string | null => {
  const limpo = caminhoSalvo.replace(/^\/+/, "");
  const absoluto = path.resolve(process.cwd(), limpo);
  const dentro = BASES_PERMITIDAS.some((base) => absoluto.startsWith(base + path.sep));
  return dentro ? absoluto : null;
};
