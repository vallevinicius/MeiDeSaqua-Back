import { Router } from "express";
import path from "path";
import CursoController from "../controllers/CursoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

router.get("/", CursoController.listarCursos);
router.post(
  "/",
  adminAuthMiddleware,
  ...receberArquivos(uploadSeguro.any(), { moverPara: UPLOADS_DIR }),
  CursoController.criarCurso,
);
router.put(
  "/:id",
  adminAuthMiddleware,
  ...receberArquivos(uploadSeguro.any(), { moverPara: UPLOADS_DIR }),
  CursoController.atualizarCurso,
);
router.delete("/:id", adminAuthMiddleware, CursoController.removerCurso);

export default router;
