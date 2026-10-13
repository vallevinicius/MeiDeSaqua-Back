import { NextFunction, Request, Response } from "express";
import * as jwt from "jsonwebtoken";
import { COOKIE_ADMIN, origemPermitida, tokenDoCabecalho } from "../utils/cookies";

export const adminAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const doCabecalho = tokenDoCabecalho(req);
  const doCookie = req.cookies?.[COOKIE_ADMIN] as string | undefined;
  const token = doCabecalho || doCookie;

  if (!token) {
    return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
  }

  if (!doCabecalho && !origemPermitida(req)) {
    return res.status(403).json({ message: "Origem não permitida." });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET as string, {
      algorithms: ["HS256"],
    }) as any;
    if (decoded.role === "admin") {
      (req as any).admin = { username: decoded.username };
      return next();
    }
    return res.status(403).json({ message: "Acesso negado. Permissão insuficiente." });
  } catch {
    return res.status(401).json({ message: "Token inválido." });
  }
};
