import { Router } from "express";
import path from "path";
import FileController from "../controllers/FileController";
import { authMiddleware } from "../middlewares/auth.middleware";
import { limiteUpload, limiteUploadPorUsuario } from "../middlewares/rateLimit.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

router.post(
  "/upload",
  limiteUpload,
  authMiddleware,
  limiteUploadPorUsuario,
  ...receberArquivos(uploadSeguro.any(), { moverPara: UPLOADS_DIR }),
  FileController.uploadFile
);

router.post(
  "/upload-multiple",
  limiteUpload,
  authMiddleware,
  limiteUploadPorUsuario,
  ...receberArquivos(uploadSeguro.array("files"), { moverPara: UPLOADS_DIR }),
  FileController.uploadMultipleFiles
);

export default router;
