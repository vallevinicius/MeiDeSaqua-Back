import { NextFunction, Request, RequestHandler, Response } from "express";
import fs from "fs/promises";
import { mkdirSync } from "fs";
import multer from "multer";
import path from "path";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";

// Área privada: nada aqui é servido. O arquivo só sai daqui depois de validado.
const TMP_DIR = path.resolve(process.cwd(), "uploads-tmp");
mkdirSync(TMP_DIR, { recursive: true });

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export const uploadSeguro = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_DIR),
    filename: (_req, _file, cb) => cb(null, uuidv4()),
  }),
  limits: { fileSize: TAMANHO_MAXIMO, files: 10 },
});

type Tipo = "jpg" | "png" | "webp" | "pdf";

// O tipo vem da assinatura do conteúdo, nunca do nome ou mimetype do cliente.
const detectarTipo = (b: Buffer): Tipo | null => {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "jpg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP")
    return "webp";
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
};

const listarArquivos = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files) return Object.values(req.files).flat();
  return [];
};

const registrarEvento = (req: Request, evento: string, dados: object = {}) => {
  console.log(
    JSON.stringify({
      evento,
      rota: req.originalUrl,
      ip: req.ip,
      usuarioId: (req as any).user?.id ?? null,
      ...dados,
    }),
  );
};

const limpar = async (req: Request, extras: string[] = []) => {
  const caminhos = [...listarArquivos(req).map((f) => f.path), ...extras];
  await Promise.all(caminhos.map((p) => fs.unlink(p).catch(() => {})));
};

const lerCabecalho = async (caminho: string): Promise<Buffer> => {
  const handle = await fs.open(caminho, "r");
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, 16, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

interface OpcoesValidacao {
  // Campos que podem receber PDF além de imagem (ex.: ccmei).
  camposPdf?: string[];
  // Se informado, o arquivo validado é movido para este diretório.
  moverPara?: string;
}

const validarUploads =
  ({ camposPdf = [], moverPara }: OpcoesValidacao): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction) => {
    const criados: string[] = [];
    try {
      for (const file of listarArquivos(req)) {
        const tipo = detectarTipo(await lerCabecalho(file.path));
        if (!tipo || (tipo === "pdf" && !camposPdf.includes(file.fieldname))) {
          registrarEvento(req, "upload_rejeitado", {
            campo: file.fieldname,
            extensaoCliente: path.extname(file.originalname).toLowerCase(),
            tipoDetectado: tipo,
          });
          throw new Error("tipo-invalido");
        }

        const nome = `${uuidv4()}.${tipo === "pdf" ? "pdf" : "webp"}`;
        const destino = path.join(TMP_DIR, nome);
        criados.push(destino);

        if (tipo === "pdf") {
          await fs.rename(file.path, destino);
        } else {
          // Reprocessar descarta metadados e qualquer conteúdo embutido.
          await sharp(file.path)
            .rotate()
            .webp({ quality: 80 })
            .toFile(destino);
          await fs.unlink(file.path);
        }

        file.path = destino;
        file.filename = nome;
        file.mimetype = tipo === "pdf" ? "application/pdf" : "image/webp";
        file.size = (await fs.stat(destino)).size;
        registrarEvento(req, "upload_aceito", {
          campo: file.fieldname,
          tipo,
          tamanho: file.size,
        });

        if (moverPara) {
          await fs.mkdir(moverPara, { recursive: true });
          const final = path.join(moverPara, nome);
          await fs.rename(destino, final);
          criados[criados.length - 1] = final;
          file.path = final;
          file.destination = moverPara;
        }
      }
      next();
    } catch {
      await limpar(req, criados);
      res.status(415).json({ message: "Tipo de arquivo não permitido." });
    }
  };

// Recebe o multipart e valida. Usar no lugar de `upload.xxx(), compressImages`.
export const receberArquivos = (
  multerHandler: RequestHandler,
  opcoes: OpcoesValidacao = {},
): RequestHandler[] => [
  (req, res, next) => {
    multerHandler(req, res, async (err?: any) => {
      if (!err) return next();
      await limpar(req);
      const grande = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      return res.status(grande ? 413 : 400).json({
        message: grande ? "Arquivo acima do limite." : "Upload inválido.",
      });
    });
  },
  validarUploads(opcoes),
];
