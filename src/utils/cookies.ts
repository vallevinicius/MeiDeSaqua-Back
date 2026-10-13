import { CookieOptions, Request, Response } from "express";

export const COOKIE_ACESSO = "access_token";
export const COOKIE_RENOVACAO = "refresh_token";
export const COOKIE_ADMIN = "admin_token";

// Valor que o front manda no lugar do token quando a sessão está no cookie.
export const MARCADOR_SESSAO = "sessao-por-cookie";

export const MINUTOS_ACESSO = 15;
export const DIAS_RENOVACAO = 7;
export const HORAS_ADMIN = Number(process.env.ADMIN_SESSION_HOURS) || 4;

const base = (): CookieOptions => ({
  httpOnly: true,
  secure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
  sameSite: (process.env.COOKIE_SAMESITE as CookieOptions["sameSite"]) || "lax",
  domain: process.env.COOKIE_DOMAIN || undefined,
});

export const gravarCookieAcesso = (res: Response, token: string) =>
  res.cookie(COOKIE_ACESSO, token, { ...base(), path: "/", maxAge: MINUTOS_ACESSO * 60 * 1000 });

// O refresh token só viaja nas rotas de autenticação.
export const gravarCookieRenovacao = (res: Response, token: string) =>
  res.cookie(COOKIE_RENOVACAO, token, {
    ...base(),
    path: "/api/auth",
    maxAge: DIAS_RENOVACAO * 24 * 60 * 60 * 1000,
  });

export const gravarCookieAdmin = (res: Response, token: string) =>
  res.cookie(COOKIE_ADMIN, token, { ...base(), path: "/", maxAge: HORAS_ADMIN * 60 * 60 * 1000 });

export const limparCookies = (res: Response) => {
  res.clearCookie(COOKIE_ACESSO, { ...base(), path: "/" });
  res.clearCookie(COOKIE_RENOVACAO, { ...base(), path: "/api/auth" });
};

export const limparCookieAdmin = (res: Response) =>
  res.clearCookie(COOKIE_ADMIN, { ...base(), path: "/" });

// Token vindo do cabeçalho Bearer. O marcador do front não é um token.
export const tokenDoCabecalho = (req: Request): string | null => {
  const cabecalho = req.headers.authorization;
  if (!cabecalho || !cabecalho.startsWith("Bearer ")) return null;
  const token = cabecalho.substring(7).trim();
  return token && token !== MARCADOR_SESSAO ? token : null;
};

const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

// Requisição com cookie que altera dados só vale se vier de um site permitido (CSRF).
export const origemPermitida = (req: Request): boolean => {
  if (METODOS_SEGUROS.has(req.method)) return true;
  const permitidas = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  if (permitidas.length === 0) return true; // sem lista não há como validar
  const origem = req.headers.origin as string | undefined;
  if (origem) return permitidas.includes(origem);
  const referer = req.headers.referer as string | undefined;
  if (referer) {
    try {
      return permitidas.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
};
