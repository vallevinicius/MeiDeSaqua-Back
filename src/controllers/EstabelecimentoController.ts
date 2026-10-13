// Copie e cole TUDO isto no seu arquivo: src/controllers/EstabelecimentoController.ts

import { Request, Response } from "express";
import EstabelecimentoService from "../services/EstabelecimentoService";
import fs from "fs/promises";
import path from "path";
import Estabelecimento from "../entities/Estabelecimento.entity";
import ContadorVisualizacao from "../entities/ContadorVisualizacao.entity";
import { sanitizeFilename } from "../utils/stringUtils";
import { AuthenticatedRequest } from "../interfaces/requests";
import { PRIVATE_DIR_NAME, PRIVATE_UPLOADS_DIR } from "../utils/privateFiles";

class EstabelecimentoController {
  private _deleteUploadedFilesOnFailure = async (req: Request) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    if (!files) return;
    const filesToDelete = Object.values(files).flat();
    await Promise.all(
      filesToDelete.map((file) =>
        fs
          .unlink(file.path)
          .catch((err) =>
            console.error(
              `Falha ao deletar arquivo ${file.path} durante rollback: ${err.message}`,
            ),
          ),
      ),
    );
  };

  private _handleError = (error: any, res: Response): Response => {
    if (error.message && error.message.includes("CNPJ")) {
      return res.status(400).json({ message: error.message });
    }

    if (error.message === "E-mail já cadastrado no sistema.") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message === "CNPJ já cadastrado no sistema.") {
      return res.status(400).json({ message: error.message });
    }
    if (
      error.name === "SequelizeDatabaseError" &&
      error.message.includes("Data too long for column")
    ) {
      let friendlyMessage =
        "Um dos campos de texto excedeu o limite de caracteres.";
      if (error.message.includes("'descricao_diferencial'")) {
        friendlyMessage =
          "O campo 'Diferencial' excedeu o limite de 130 caracteres.";
      } else if (error.message.includes("'descricao'")) {
        friendlyMessage =
          "O campo 'Descrição' excedeu o limite de 500 caracteres.";
      }
      return res.status(400).json({ message: friendlyMessage });
    }
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(400)
        .json({ message: "O CNPJ informado já está cadastrado no sistema." });
    }
    if (error.message.includes("não encontrado")) {
      return res.status(404).json({ message: error.message });
    }
    console.error("ERRO NÃO TRATADO:", error);
    return res
      .status(500)
      .json({ message: "Ocorreu um erro interno no servidor." });
  };

  private _moveFilesAndPrepareData = async (
    req: Request,
    existingInfo?: { categoria: string; nomeFantasia: string },
  ): Promise<any> => {
    const dadosDoFormulario = req.body;
    const arquivos = req.files as {
      [fieldname: string]: Express.Multer.File[];
    };

    const categoria = existingInfo?.categoria || dadosDoFormulario.categoria;
    const nomeFantasia =
      existingInfo?.nomeFantasia || dadosDoFormulario.nomeFantasia;

    const sanitize = (name: string) =>
      (name || "").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const safeCategoria = sanitizeFilename(categoria || "geral");
    const safeNomeFantasia = sanitizeFilename(nomeFantasia || "mei_sem_nome");

    const targetDir = path.resolve("uploads", safeCategoria, safeNomeFantasia);
    await fs.mkdir(targetDir, { recursive: true });

    const moveFile = async (
      file?: Express.Multer.File,
    ): Promise<string | undefined> => {
      if (!file) return undefined;
      const oldPath = file.path;
      const newPath = path.join(targetDir, file.filename);
      await fs.rename(oldPath, newPath);
      return path
        .join("uploads", safeCategoria, safeNomeFantasia, file.filename)
        .replace(/\\/g, "/");
    };

    const logoPath = await moveFile(arquivos["logo"]?.[0]);
    const ccmeiPath = await this._moveCcmei(
      arquivos["ccmei"]?.[0],
      safeCategoria,
      safeNomeFantasia,
    );

    const produtosPaths: string[] = [];
    if (arquivos["produtos"]) {
      for (const file of arquivos["produtos"]) {
        const newPath = await moveFile(file);
        if (newPath) produtosPaths.push(newPath);
      }
    }

    return {
      ...dadosDoFormulario,
      ...(logoPath && { logo: logoPath }),
      ...(produtosPaths.length > 0 && { produtos: produtosPaths }),
      ...(ccmeiPath && { ccmei: ccmeiPath }),
    };
  };

  // CCMEI contém dado pessoal: vai para a pasta privada, fora do /uploads público.
  private _moveCcmei = async (
    file: Express.Multer.File | undefined,
    categoria: string,
    nomeFantasia: string,
  ): Promise<string | undefined> => {
    if (!file) return undefined;
    const dir = path.join(PRIVATE_UPLOADS_DIR, categoria, nomeFantasia);
    await fs.mkdir(dir, { recursive: true });
    await fs.rename(file.path, path.join(dir, file.filename));
    return path
      .join(PRIVATE_DIR_NAME, categoria, nomeFantasia, file.filename)
      .replace(/\\/g, "/");
  };

  public cadastrar = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<Response> => {
    try {
      const usuarioId = req.user?.id;
      if (!usuarioId) {
        return res.status(401).json({ message: "Não autorizado." });
      }

      const dadosCompletos = await this._moveFilesAndPrepareData(req);
      dadosCompletos.usuarioId = usuarioId;

      const novoEstabelecimento =
        await EstabelecimentoService.cadastrarEstabelecimentoComImagens(
          dadosCompletos,
        );
      return res.status(201).json({
        estabelecimentoId: novoEstabelecimento.estabelecimentoId,
      });
    } catch (error: any) {
      await this._deleteUploadedFilesOnFailure(req);
      return this._handleError(error, res);
    }
  };

  public solicitarAtualizacao = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<Response> => {
    try {
      const { cnpj } = req.body;
      if (!cnpj) {
        return res.status(400).json({
          message: "O CNPJ é obrigatório para solicitar uma atualização.",
        });
      }

      const estabelecimentoExistente = await Estabelecimento.findOne({
        where: { cnpj },
      });
      if (
        !estabelecimentoExistente ||
        estabelecimentoExistente.usuarioId !== req.user?.id
      ) {
        await this._deleteUploadedFilesOnFailure(req);
        return res.status(404).json({
          message:
            "Estabelecimento não encontrado para atualização, verifique o CNPJ e tente novamente.",
        });
      }

      const dadosCompletos = await this._moveFilesAndPrepareData(req, {
        categoria: estabelecimentoExistente.categoria,
        nomeFantasia: estabelecimentoExistente.nomeFantasia,
      });

      await EstabelecimentoService.solicitarAtualizacaoPorCnpj(
        cnpj,
        dadosCompletos,
      );

      return res.status(200).json({
        message: "Solicitação de atualização enviada para análise.",
      });
    } catch (error: any) {
      await this._deleteUploadedFilesOnFailure(req);
      return this._handleError(error, res);
    }
  };

  public solicitarExclusao = async (
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<Response> => {
    try {
      const { cnpj, nome_responsavel, cpf_responsavel, emailEstabelecimento } =
        req.body;
      if (
        !cnpj ||
        !nome_responsavel ||
        !cpf_responsavel ||
        !emailEstabelecimento
      ) {
        await this._deleteUploadedFilesOnFailure(req);
        return res.status(400).json({
          message:
            "CNPJ, nome, CPF do responsável e e-mail são obrigatórios para a exclusão.",
        });
      }

      const estabelecimentoExistente = await Estabelecimento.findOne({
        where: { cnpj },
      });
      if (
        !estabelecimentoExistente ||
        estabelecimentoExistente.usuarioId !== req.user?.id
      ) {
        await this._deleteUploadedFilesOnFailure(req);
        return res.status(404).json({
          message:
            "Estabelecimento não encontrado para exclusão, verifique o CNPJ e tente novamente.",
        });
      }

      const dadosCompletos = await this._moveFilesAndPrepareData(req, {
        categoria: estabelecimentoExistente.categoria,
        nomeFantasia: estabelecimentoExistente.nomeFantasia,
      });

      await EstabelecimentoService.solicitarExclusaoPorCnpj(dadosCompletos);

      return res
        .status(200)
        .json({ message: "Solicitação de exclusão enviada para análise." });
    } catch (error: any) {
      await this._deleteUploadedFilesOnFailure(req);
      return this._handleError(error, res);
    }
  };

  public listarTodos = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const estabelecimentos = await EstabelecimentoService.listarTodos();
      return res.status(200).json(estabelecimentos);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public buscarPorNome = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const nome = req.query.nome as string;
      const estabelecimentos = await EstabelecimentoService.buscarPorNome(nome);
      return res.status(200).json(estabelecimentos);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public buscarPorId = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const id = parseInt(req.params.id);

      const estabelecimento = await EstabelecimentoService.buscarPorId(id);

      if (!estabelecimento) {
        return res.status(404).json({
          message: "Estabelecimento não encontrado.",
        });
      }
      return res.status(200).json(estabelecimento);
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };
  public alterarStatus = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const id = parseInt(req.params.id);
      const { ativo } = req.body;
      if (typeof ativo !== "boolean") {
        return res.status(400).json({
          message:
            "O corpo da requisição deve conter a chave 'ativo' com um valor booleano (true/false).",
        });
      }
      const estabelecimento = await EstabelecimentoService.alterarStatusAtivo(
        id,
        ativo,
      );
      return res.status(200).json({
        estabelecimentoId: estabelecimento.estabelecimentoId,
        status: estabelecimento.status,
        ativo: estabelecimento.ativo,
      });
    } catch (error: any) {
      return this._handleError(error, res);
    }
  };

  public registrarVisualizacao = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { identificador } = req.params;

      if (!identificador) {
        return res
          .status(400)
          .json({ message: "Identificador é obrigatório." });
      }

      let chaveFormatada = identificador.trim().toUpperCase();

      // --- AQUI ESTÁ A CORREÇÃO ---
      if (
        chaveFormatada !== "HOME" &&
        chaveFormatada !== "ESPACO_MEI" &&
        chaveFormatada !== "PROFILE_SHARE" && // <--- NOVO: Permite o compartilhamento de perfil
        !chaveFormatada.startsWith("CAT_") &&
        !chaveFormatada.startsWith("CURSO_") &&
        !chaveFormatada.startsWith("LINK_") &&  // <--- NOVO: Permite LINK_EMAIL, LINK_GOV, LINK_WPP
        !chaveFormatada.startsWith("REDIRECIONAMENTO_ANZOL_") // Permite links de redirecionamento
      ) {
        chaveFormatada =
          "CAT_" +
          chaveFormatada
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Z0-9]/g, "_");
      }
      // ----------------------------

      const [registro] = await ContadorVisualizacao.findOrCreate({
        where: { identificador: chaveFormatada },
        defaults: { visualizacoes: 0 },
      });

      await registro.increment("visualizacoes");

      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Erro ao registrar visualização:", error);
      return res
        .status(500)
        .json({ message: "Erro interno ao registrar visualização." });
    }
  };
}

export default new EstabelecimentoController();
