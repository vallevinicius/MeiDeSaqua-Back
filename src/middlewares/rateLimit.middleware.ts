import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const criarLimite = (janelaMinutos: number, max: number) =>
  rateLimit({
    windowMs: janelaMinutos * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { message: "Muitas requisições. Tente novamente mais tarde." },
  });

export const limiteGeral = criarLimite(15, 600);
export const limiteLogin = criarLimite(15, 10);
export const limiteCadastro = criarLimite(60, 10);
export const limiteEmail = criarLimite(60, 5);
export const limiteUpload = criarLimite(15, 30);
export const limiteVisualizacao = criarLimite(1, 60);

// D15: limite de upload por usuário autenticado (além do limite por IP). Precisa vir
// depois do authMiddleware; sem usuário identificado, cai para o IP.
export const limiteUploadPorUsuario = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const id = (req as any).user?.id;
    return id ? `usuario:${id}` : ipKeyGenerator(req.ip ?? "");
  },
  message: { message: "Muitos envios de arquivos. Tente novamente mais tarde." },
});
