// Inventário dos arquivos em /uploads (D23 e D24 do relatório 003).
//   npx ts-node scripts/inventariar-uploads.ts              -> só lista, por extensão
//   npx ts-node scripts/inventariar-uploads.ts --quarentena -> move os suspeitos para uploads-quarentena
// Nada é apagado: a quarentena é reversível. Guarde a saída como registro do incidente.
import fs from "fs";
import path from "path";

const UPLOADS = path.resolve(process.cwd(), "uploads");
const QUARENTENA = path.resolve(process.cwd(), "uploads-quarentena");
const PERMITIDAS = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif", ".pdf"]);
const mover = process.argv.includes("--quarentena");

const arquivos = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? arquivos(path.join(dir, e.name)) : [path.join(dir, e.name)],
      )
    : [];

const todos = arquivos(UPLOADS);
const porExtensao = new Map<string, number>();
const suspeitos: string[] = [];

for (const arquivo of todos) {
  const ext = path.extname(arquivo).toLowerCase() || "(sem extensão)";
  porExtensao.set(ext, (porExtensao.get(ext) ?? 0) + 1);
  if (!PERMITIDAS.has(ext)) suspeitos.push(arquivo);
}

console.log(`Pasta analisada: ${UPLOADS}`);
console.log(`Total de arquivos: ${todos.length}\n`);
console.log("Por extensão:");
for (const [ext, qtd] of [...porExtensao].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ext.padEnd(16)} ${qtd}${PERMITIDAS.has(ext) ? "" : "   <-- SUSPEITA"}`);
}

if (suspeitos.length === 0) {
  console.log("\nNenhum arquivo suspeito.");
  process.exit(0);
}

console.log(`\nArquivos suspeitos (${suspeitos.length}):`);
for (const arquivo of suspeitos) {
  const { size, mtime } = fs.statSync(arquivo);
  console.log(`  ${path.relative(UPLOADS, arquivo)}  ${size} bytes  ${mtime.toISOString()}`);
}

if (!mover) {
  console.log("\nSimulação. Use --quarentena para mover estes arquivos para uploads-quarentena/.");
  process.exit(0);
}

for (const arquivo of suspeitos) {
  const destino = path.join(QUARENTENA, path.relative(UPLOADS, arquivo));
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.renameSync(arquivo, destino);
}
console.log(`\n${suspeitos.length} arquivo(s) movido(s) para ${QUARENTENA}.`);
console.log("Trate como possível incidente: confira os logs de acesso a esses arquivos.");
