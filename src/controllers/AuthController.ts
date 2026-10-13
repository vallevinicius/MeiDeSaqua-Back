import { Request, Response } from "express";
import AuthService, { usuarioPublico } from "../services/AuthService";
import jwt from "jsonwebtoken";
import { AuthenticatedRequest } from "../interfaces/requests";
import Estabelecimento, {
  StatusEstabelecimento,
} from "../entities/Estabelecimento.entity";
import ImagemProduto from "../entities/ImagemProduto.entity"; // ADICIONAR IMPORT
import { Op } from "sequelize";
import SessionService from "../services/SessionService";
import Usuario from "../entities/Usuario.entity";
import EmailService from "../utils/EmailService";
import * as crypto from "crypto";
import {
  COOKIE_RENOVACAO,
  MINUTOS_ACESSO,
  gravarCookieAcesso,
  gravarCookieRenovacao,
  limparCookies,
  tokenDoCabecalho,
} from "../utils/cookies";

class AuthController {
  public async cadastrar(req: Request, res: Response): Promise<Response> {
    try {
      await AuthService.cadastrarUsuario(req.body);
      return res.status(201).json({
        message:
          "Cadastro realizado com sucesso! Por favor, verifique seu e-mail para ativar sua conta.",
      });
    } catch (error: any) {
      const message: string = error?.message ?? "";

      if (message.includes("já cadastrado")) {
        return res.status(409).json({ message });
      }

      // Erros de validação de negócio conhecidos: devolver a mensagem ao cliente.
      const erroValidacaoConhecido =
        message.includes("inapropriad") || message.includes("emoji");
      if (erroValidacaoConhecido) {
        return res.status(400).json({ message });
      }

      // Qualquer outra coisa (ex.: SMTP "Greeting never received", falha de DB):
      // logar internamente e devolver mensagem genérica, sem vazar detalhes.
      console.error("Erro inesperado no cadastro:", error);
      return res.status(500).json({
        message:
          "Não foi possível concluir o cadastro. Entre em contato conosco por e-mail.",
      });
    }
  }

  public async login(req: Request, res: Response): Promise<Response> {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res
          .status(400)
          .json({ message: "Utilizador e senha são obrigatórios." });
      }

      const { user, usuario } = await AuthService.login(username, password);

      // O token fica só em cookie httpOnly: o JavaScript da página nunca o enxerga.
      const { acesso, renovacao } = await SessionService.criarSessao(usuario, req);
      gravarCookieAcesso(res, acesso);
      gravarCookieRenovacao(res, renovacao);

      return res.status(200).json({
        user,
        expiresAt: Date.now() + MINUTOS_ACESSO * 60 * 1000,
      });
    } catch (error: any) {
      console.error("Erro no login:", error.message);
      if (
        error.message.includes("inválidos") ||
        error.message.includes("não foi verificada")
      ) {
        return res.status(401).json({ message: error.message });
      }
      return res.status(500).json({ message: "Ocorreu um erro inesperado." });
    }
  }

  // Resposta igual exista ou não a conta, para não revelar quem está cadastrado.
  public async resendConfirmation(req: Request, res: Response): Promise<Response> {
    const mensagem =
      "Se existir uma conta pendente de confirmação, um novo e-mail foi enviado.";
    try {
      const { username } = req.body ?? {};
      if (!username || typeof username !== "string") {
        return res.status(400).json({ message: "Usuário/E-mail é obrigatório." });
      }

      const usuario = await Usuario.findOne({
        where: { [Op.or]: [{ username }, { email: username }] },
      });

      if (usuario && !usuario.enabled) {
        usuario.confirmationToken = crypto.randomBytes(20).toString("hex");
        await usuario.save();
        await EmailService.sendConfirmationEmail(usuario.email, usuario.confirmationToken);
      }
      return res.status(200).json({ message: mensagem });
    } catch (error) {
      console.error("Erro ao reenviar confirmação:", error);
      return res.status(200).json({ message: mensagem });
    }
  }

  public async refresh(req: Request, res: Response): Promise<Response> {
    const atual = req.cookies?.[COOKIE_RENOVACAO] as string | undefined;
    if (!atual) {
      return res.status(401).json({ message: "Sessão expirada." });
    }
    try {
      const { acesso, renovacao } = await SessionService.renovar(atual, req);
      gravarCookieAcesso(res, acesso);
      gravarCookieRenovacao(res, renovacao);
      return res.status(200).json({ expiresAt: Date.now() + MINUTOS_ACESSO * 60 * 1000 });
    } catch {
      limparCookies(res);
      return res.status(401).json({ message: "Sessão expirada." });
    }
  }

  // Ponte para quem já estava logado antes da mudança para cookies: troca o token antigo
  // (guardado no navegador) por uma sessão em cookie, sem pedir senha de novo.
  // Só aceita tokens do formato antigo (sem "ver"): eles expiram em até 1 hora após o
  // deploy, então a rota se torna inútil sozinha e não permite prolongar um token novo.
  public async migrarSessao(req: AuthenticatedRequest, res: Response): Promise<Response> {
    try {
      const token = tokenDoCabecalho(req);
      const payload = token
        ? (jwt.decode(token) as { ver?: number } | null)
        : null;
      if (!payload || payload.ver !== undefined) {
        return res.status(401).json({ message: "Sessão não migrável." });
      }

      const usuario = await Usuario.findByPk(req.user!.id);
      if (!usuario || !usuario.enabled) {
        return res.status(401).json({ message: "Sessão inválida." });
      }

      const { acesso, renovacao } = await SessionService.criarSessao(usuario, req);
      gravarCookieAcesso(res, acesso);
      gravarCookieRenovacao(res, renovacao);
      return res.status(200).json({
        user: usuarioPublico(usuario),
        expiresAt: Date.now() + MINUTOS_ACESSO * 60 * 1000,
      });
    } catch (error) {
      console.error("Erro ao migrar sessão:", error);
      return res.status(500).json({ message: "Erro ao migrar a sessão." });
    }
  }

  public async logout(req: Request, res: Response): Promise<Response> {
    try {
      await SessionService.encerrar(req.cookies?.[COOKIE_RENOVACAO]);
    } catch (error) {
      console.error("Erro ao encerrar sessão:", error);
    }
    limparCookies(res);
    return res.status(204).send();
  }

  public async confirmAccount(req: Request, res: Response): Promise<Response> {
    try {
      await AuthService.confirmUserAccount(req.query.token as string);
      return res.json({
        message: "Conta ativada com sucesso. Você já pode fazer login.",
      });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  public async forgotPassword(req: Request, res: Response): Promise<Response> {
    try {
      await AuthService.forgotPassword(req.body.email);
      return res.json({
        message:
          "Se existir uma conta com o e-mail fornecido, um link de redefinição de senha foi enviado.",
      });
    } catch (error: any) {
      return res.json({
        message:
          "Se existir uma conta com o e-mail fornecido, um link de redefinição de senha foi enviado.",
      });
    }
  }

  public async resetPassword(req: Request, res: Response): Promise<Response> {
    try {
      const { token, newPassword } = req.body;
      await AuthService.resetPassword(token, newPassword);
      return res.json({ message: "Senha redefinida com sucesso." });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  public async confirmEmailChange(
    req: Request,
    res: Response,
  ): Promise<Response> {
    try {
      await AuthService.confirmEmailChange(req.query.token as string);
      return res.json({
        message: "Alteração de e-mail confirmada com sucesso.",
      });
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }
}

export default new AuthController();
