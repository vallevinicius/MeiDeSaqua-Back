import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";

// É uma boa prática carregar as variáveis de ambiente o mais cedo possível
// Se você tem um .env.local, esta linha o carregará. Caso contrário, o dotenv.config() abaixo pegará o .env padrão.
dotenv.config({ path: path.resolve(__dirname, "..", ".env.local") });
dotenv.config();

// Rotas de usuário e MEI
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import avaliacaoRoutes from "./routes/avaliacao.routes";
import estabelecimentoRoutes from "./routes/estabelecimento.routes";
import fileRoutes from "./routes/file.routes";
import adminRoutes from "./routes/admin.routes";
import cursoRoutes from "./routes/curso.routes";
import { authMiddleware } from "./middlewares/auth.middleware";
import { limiteGeral } from "./middlewares/rateLimit.middleware";

for (const nome of ["JWT_SECRET", "ADMIN_JWT_SECRET"]) {
  if (!process.env[nome]) {
    throw new Error(`Variável de ambiente ${nome} não definida.`);
  }
}

const app = express();
const uploadsPath = path.resolve(process.cwd(), "uploads");

// Número de proxies confiáveis à frente da aplicação (para o IP real do cliente).
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));

// O frontend carrega as imagens de /uploads a partir de outra origem.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

const origensPermitidas = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origem) => origem.trim())
  .filter(Boolean);

if (origensPermitidas.length === 0) {
  console.warn(
    "AVISO: CORS_ORIGINS não definido. CORS aberto para qualquer origem.",
  );
}

// Cookies de sessão só viajam entre origens da lista. Sem lista, o CORS fica aberto
// e sem credenciais (a sessão por cookie não funciona entre origens diferentes).
app.use(
  cors(
    origensPermitidas.length > 0
      ? { origin: origensPermitidas, credentials: true }
      : undefined,
  ),
);
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

const EXTENSOES_IMAGEM = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

// Entrega inerte: nada em /uploads executa script na origem do portal.
app.use(
  "/uploads",
  express.static(uploadsPath, {
    dotfiles: "deny",
    index: false,
    setHeaders: (res, filePath) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      const ext = path.extname(filePath).toLowerCase();
      if (!EXTENSOES_IMAGEM.has(ext)) {
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader(
          "Content-Type",
          ext === ".pdf" ? "application/pdf" : "application/octet-stream",
        );
      }
    },
  }),
);

app.use("/api", limiteGeral);

app.use("/api/auth", authRoutes);
app.use("/api/estabelecimentos", estabelecimentoRoutes);
app.use("/api/avaliacoes", avaliacaoRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/cursos", cursoRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/users", authMiddleware, userRoutes);

export default app;
