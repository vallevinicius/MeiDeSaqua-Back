import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();
const uploadAdmin = receberArquivos(uploadSeguro.any(), {
  camposPdf: ["ccmei"],
});

router.post("/login", AdminController.login);

router.get("/pending", adminAuthMiddleware, AdminController.getPending);
router.post(
  "/approve/:id",
  adminAuthMiddleware,
  AdminController.approveRequest,
);
router.post(
  "/edit-and-approve/:id",
  adminAuthMiddleware,
  ...uploadAdmin,
  AdminController.editAndApproveRequest,
);
router.post(
  "/approve/:id",
  adminAuthMiddleware,
  AdminController.approveRequest,
);
router.post("/reject/:id", adminAuthMiddleware, AdminController.rejectRequest);

router.get(
  "/estabelecimentos-ativos",
  adminAuthMiddleware,
  AdminController.getAllActiveEstabelecimentos,
);

router.patch(
  "/estabelecimento/:id",
  adminAuthMiddleware,
  ...uploadAdmin,
  AdminController.adminUpdateEstabelecimento,
);

router.delete(
  "/estabelecimento/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteEstabelecimento,
);

router.get(
  "/avaliacoes/estabelecimento/:estabelecimentoId",
  adminAuthMiddleware,
  AdminController.getAvaliacoesByEstabelecimento,
);

// Rota para admin excluir uma avaliação
router.delete(
  "/avaliacoes/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteAvaliacao,
);
router.get(
  "/exportar-estabelecimentos",
  adminAuthMiddleware,
  AdminController.exportActiveEstabelecimentos,
);

router.get(
  "/dashboard-stats",
  adminAuthMiddleware,
  AdminController.getDashboardStats,
);

// ====== Rota para ADMIN gerenciar usuários=====
router.get("/users", adminAuthMiddleware, AdminController.getAllUsers);

router.put("/users/:id", adminAuthMiddleware, AdminController.adminUpdateUser);

router.delete(
  "/users/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteUser,
);

router.patch(
  "/users/:id/password",
  adminAuthMiddleware,
  AdminController.adminChangePassword,
);
router.post(
  "/users/:id/resend-confirmation",
  adminAuthMiddleware,
  AdminController.resendConfirmationEmail,
);

// Rota para buscar TODOS os estabelecimentos (Ativos e Inativos) para a aba "Geral"
router.get(
  "/estabelecimentos-geral",
  adminAuthMiddleware,
  AdminController.getAllEstabelecimentosGeral,
);

// Rota para o Admin ativar/desativar um estabelecimento manualmente
router.put(
  "/estabelecimento/:id/status",
  adminAuthMiddleware,
  AdminController.toggleEstabelecimentoStatus,
);

// =================================

export default router;
