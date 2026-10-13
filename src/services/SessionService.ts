import crypto from "crypto";
import { Request } from "express";
import jwt from "jsonwebtoken";
import { Op } from "sequelize";
import Sessao from "../entities/Sessao.entity";
import Usuario from "../entities/Usuario.entity";
import { DIAS_RENOVACAO, MINUTOS_ACESSO } from "../utils/cookies";

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

class SessionService {
  public emitirAcesso(usuario: Usuario): string {
    return jwt.sign(
      { id: usuario.usuarioId, username: usuario.username, ver: usuario.tokenVersion ?? 0 },
      process.env.JWT_SECRET as string,
      { expiresIn: `${MINUTOS_ACESSO}m`, algorithm: "HS256" },
    );
  }

  public async criarSessao(usuario: Usuario, req: Request) {
    const renovacao = crypto.randomBytes(48).toString("hex");
    await Sessao.create({
      usuarioId: usuario.usuarioId,
      tokenHash: hash(renovacao),
      expiraEm: new Date(Date.now() + DIAS_RENOVACAO * 24 * 60 * 60 * 1000),
      ip: req.ip || null,
      userAgent: (req.headers["user-agent"] || "").slice(0, 255) || null,
    } as any);
    return { acesso: this.emitirAcesso(usuario), renovacao };
  }

  // Troca o refresh token por um novo. Reutilizar um token já trocado indica roubo:
  // todas as sessões do usuário são encerradas.
  public async renovar(renovacao: string, req: Request) {
    const sessao = await Sessao.findOne({ where: { tokenHash: hash(renovacao) } });
    if (!sessao) throw new Error("Sessão inválida.");

    if (sessao.revogadaEm) {
      await this.revogarTodas(sessao.usuarioId);
      throw new Error("Sessão inválida.");
    }
    if (sessao.expiraEm < new Date()) throw new Error("Sessão expirada.");

    const usuario = await Usuario.findByPk(sessao.usuarioId);
    if (!usuario || !usuario.enabled) throw new Error("Sessão inválida.");

    sessao.revogadaEm = new Date();
    await sessao.save();
    return { usuario, ...(await this.criarSessao(usuario, req)) };
  }

  public async encerrar(renovacao?: string) {
    if (!renovacao) return;
    await Sessao.update({ revogadaEm: new Date() }, { where: { tokenHash: hash(renovacao), revogadaEm: null } });
  }

  // Invalida tokens de acesso (versão) e todas as sessões renováveis.
  public async revogarTodas(usuarioId: number) {
    await Usuario.increment("tokenVersion", { by: 1, where: { usuarioId } });
    await Sessao.update({ revogadaEm: new Date() }, { where: { usuarioId, revogadaEm: null } });
  }

  public async limparExpiradas() {
    await Sessao.destroy({ where: { expiraEm: { [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
  }
}

export default new SessionService();
