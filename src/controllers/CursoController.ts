import { Request, Response } from "express";
import CursoService from "../services/CursoService";
import FileStorageService from "../utils/FileStorageService";

class CursoController {
  private async extractPayload(req: Request) {
    const payload: any = { ...req.body };

    // Aceita aliases comuns vindos do front para evitar falhas de integração.
    payload.nome = payload.nome ?? payload.name ?? payload.titulo;
    payload.descricao = payload.descricao ?? payload.description;
    payload.link = payload.link ?? payload.url;

    if (typeof payload.ativo === "string") {
      const normalizedAtivo = payload.ativo.trim().toLowerCase();
      if (["true", "1", "on", "yes"].includes(normalizedAtivo)) {
        payload.ativo = true;
      } else if (["false", "0", "off", "no"].includes(normalizedAtivo)) {
        payload.ativo = false;
      }
    }

    let uploadFile: Express.Multer.File | undefined;

    if (req.file) {
      uploadFile = req.file;
    } else if (Array.isArray(req.files) && req.files.length > 0) {
      uploadFile = req.files[0] as Express.Multer.File;
    } else if (req.files && !Array.isArray(req.files)) {
      const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] };
      uploadFile = filesMap.imagem?.[0] || filesMap.file?.[0];
    }

    if (uploadFile) {
      payload.imagemUrl = await FileStorageService.save(uploadFile);
    }

    return payload;
  }

  private serialize(curso: any) {
    return {
      id: curso.cursoId,
      cursoId: curso.cursoId,
      nome: curso.nome,
      descricao: null,
      link: curso.link,
      imagemUrl: curso.imagemUrl,
      ativo: true,
      createdAt: curso.createdAt,
      updatedAt: curso.updatedAt,
    };
  }

  public listarCursos = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const cursos = await CursoService.listarTodos();
      return res.json(cursos.map((curso) => this.serialize(curso)));
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  };

  public criarCurso = async (req: Request, res: Response): Promise<Response> => {
    try {
      const payload = await this.extractPayload(req);
      const curso = await CursoService.criar(payload);
      return res.status(201).json(this.serialize(curso));
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  };

  public atualizarCurso = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const cursoId = Number(req.params.id);
      if (Number.isNaN(cursoId)) {
        return res.status(400).json({ message: "Parâmetro 'id' inválido." });
      }

      const payload = await this.extractPayload(req);
      const curso = await CursoService.atualizar(cursoId, payload);
      return res.json(this.serialize(curso));
    } catch (error: any) {
      const status = error.message === "Curso não encontrado." ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }
  };

  public removerCurso = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const cursoId = Number(req.params.id);
      if (Number.isNaN(cursoId)) {
        return res.status(400).json({ message: "Parâmetro 'id' inválido." });
      }

      await CursoService.remover(cursoId);
      return res.status(204).send();
    } catch (error: any) {
      const status = error.message === "Curso não encontrado." ? 404 : 400;
      return res.status(status).json({ message: error.message });
    }
  };
}

export default new CursoController();