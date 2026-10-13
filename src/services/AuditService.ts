import { Request } from "express";
import AuditLog from "../entities/AuditLog.entity";

class AuditService {
  // Nunca derruba a requisição: falha de auditoria só vai para o log.
  public registrar(req: Request, acao: string, recurso?: string | number): void {
    const ator = (req as any).admin?.username || "desconhecido";
    AuditLog.create({
      ator,
      acao,
      recurso: recurso === undefined ? null : String(recurso),
      ip: req.ip || null,
    }).catch((error) =>
      console.error("[AuditService] Falha ao registrar auditoria:", error.message),
    );
  }
}

export default new AuditService();
