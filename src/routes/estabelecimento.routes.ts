import { Router } from "express";
import EstabelecimentoController from "../controllers/EstabelecimentoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();

router.get("/", EstabelecimentoController.listarTodos);
router.get("/buscar", EstabelecimentoController.buscarPorNome);
router.get("/:id", EstabelecimentoController.buscarPorId);

router.post(
  "/",
  authMiddleware,
  ...receberArquivos(uploadSeguro.fields([
    { name: "logo", maxCount: 1 },
    { name: "produtos", maxCount: 5 },
    { name: "ccmei", maxCount: 1 },
  ]), { camposPdf: ["ccmei"] }),
  EstabelecimentoController.cadastrar
);

router.put(
  "/solicitar-atualizacao",
  ...receberArquivos(uploadSeguro.fields([
    { name: "logo", maxCount: 1 },
    { name: "produtos", maxCount: 5 },
    { name: "ccmei", maxCount: 1 },
  ]), { camposPdf: ["ccmei"] }),
  EstabelecimentoController.solicitarAtualizacao
);

router.post(
  "/solicitar-exclusao",
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
  EstabelecimentoController.registrarVisualizacao
);

export default router;
