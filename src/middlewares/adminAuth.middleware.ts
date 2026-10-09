import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";


export const adminAuthMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET as string, {
      algorithms: ["HS256"],
    }) as any;
    if (decoded.role === "admin") {
      next();
    } else {
      return res.status(403).json({ message: "Acesso negado. Permissão insuficiente." });
    }
  } catch (error) {
    return res.status(401).json({ message: "Token inválido." });
  }
};