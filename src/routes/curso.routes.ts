import { Router } from "express";
import CursoController from "../controllers/CursoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();

router.get("/", CursoController.listarCursos);
router.post(
  "/",
  adminAuthMiddleware,
  ...receberArquivos(uploadSeguro.any()),
  CursoController.criarCurso,
);
router.put(
  "/:id",
  adminAuthMiddleware,
  ...receberArquivos(uploadSeguro.any()),
  CursoController.atualizarCurso,
);
router.delete("/:id", adminAuthMiddleware, CursoController.removerCurso);

export default router;
