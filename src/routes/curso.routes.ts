import { Router } from "express";
import CursoController from "../controllers/CursoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();

// Rota pública
router.get("/", CursoController.index);

router.post(
  "/",
  adminAuthMiddleware,
  ...receberArquivos(uploadSeguro.single("file")),
  CursoController.store,
);
router.put(
  "/:id",
  adminAuthMiddleware,
  ...receberArquivos(uploadSeguro.single("file")),
  CursoController.update,
);
router.delete("/:id", adminAuthMiddleware, CursoController.delete);

export default router;
