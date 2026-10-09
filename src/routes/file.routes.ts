import { Router } from "express";
import path from "path";
import FileController from "../controllers/FileController";
import { authMiddleware } from "../middlewares/auth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();
const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

router.post(
  "/upload",
  authMiddleware,
  ...receberArquivos(uploadSeguro.single("file"), { moverPara: UPLOADS_DIR }),
  FileController.uploadFile
);

router.post(
  "/upload-multiple",
  authMiddleware,
  ...receberArquivos(uploadSeguro.array("files"), { moverPara: UPLOADS_DIR }),
  FileController.uploadMultipleFiles
);

export default router;
