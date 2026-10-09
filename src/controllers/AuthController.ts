import { Request, Response } from "express";
import AuthService from "../services/AuthService";
import Estabelecimento, {
  StatusEstabelecimento,
} from "../entities/Estabelecimento.entity";
import ImagemProduto from "../entities/ImagemProduto.entity"; // ADICIONAR IMPORT
import * as jwt from "jsonwebtoken";
import { Op } from "sequelize";

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

      const data = await AuthService.login(username, password);

      return res.status(200).json(data);
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
