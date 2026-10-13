import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import Usuario from "../entities/Usuario.entity";
import { AuthenticatedRequest } from "../interfaces/requests";
import { COOKIE_ACESSO, origemPermitida, tokenDoCabecalho } from "../utils/cookies";

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const doCabecalho = tokenDoCabecalho(req);
  const doCookie = req.cookies?.[COOKIE_ACESSO] as string | undefined;
  const token = doCabecalho || doCookie;

  if (!token) {
    return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
  }

  // Cookie é enviado sozinho pelo navegador: exige origem confiável nas alterações.
  if (!doCabecalho && !origemPermitida(req)) {
    return res.status(403).json({ message: "Origem não permitida." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string, {
      algorithms: ["HS256"],
    }) as { id: number; username: string; ver?: number };

    // Garante que a conta existe, está ativa e que o token não foi revogado.
    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: ["usuarioId", "username", "enabled", "tokenVersion"],
    });
    if (!usuario || !usuario.enabled || (decoded.ver ?? 0) !== usuario.tokenVersion) {
      return res.status(401).json({ message: "Token inválido ou expirado." });
    }

    req.user = { id: usuario.usuarioId, username: usuario.username };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}
