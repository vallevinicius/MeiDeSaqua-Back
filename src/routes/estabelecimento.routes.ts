import { Router } from "express";
import EstabelecimentoController from "../controllers/EstabelecimentoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";
import {
  limiteCadastro,
  limiteUpload,
  limiteUploadPorUsuario,
  limiteVisualizacao,
} from "../middlewares/rateLimit.middleware";

const router = Router();

router.get("/", EstabelecimentoController.listarTodos);
router.get("/buscar", EstabelecimentoController.buscarPorNome);
router.get("/:id", EstabelecimentoController.buscarPorId);

router.post(
  "/",
  limiteCadastro,
  authMiddleware,
  limiteUploadPorUsuario,
  ...receberArquivos(uploadSeguro.fields([
    { name: "logo", maxCount: 1 },
    { name: "produtos", maxCount: 5 },
    { name: "ccmei", maxCount: 1 },
  ]), { camposPdf: ["ccmei"] }),
  EstabelecimentoController.cadastrar
);

router.put(
  "/solicitar-atualizacao",
  limiteUpload,
  authMiddleware,
  limiteUploadPorUsuario,
  ...receberArquivos(uploadSeguro.fields([
    { name: "logo", maxCount: 1 },
    { name: "produtos", maxCount: 5 },
    { name: "ccmei", maxCount: 1 },
  ]), { camposPdf: ["ccmei"] }),
  EstabelecimentoController.solicitarAtualizacao
);

router.post(
  "/solicitar-exclusao",
  limiteUpload,
  authMiddleware,
  limiteUploadPorUsuario,
  ...receberArquivos(uploadSeguro.fields([{ name: "ccmei", maxCount: 1 }]), { camposPdf: ["ccmei"] }),
  EstabelecimentoController.solicitarExclusao
);

router.post(
  "/:id/status",
  adminAuthMiddleware,
  EstabelecimentoController.alterarStatus
);

router.post(
  "/visualizacao/:identificador",
  limiteVisualizacao,
  EstabelecimentoController.registrarVisualizacao
);

export default router;
