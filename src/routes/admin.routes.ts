import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import { limiteLogin } from "../middlewares/rateLimit.middleware";
import { receberArquivos, uploadSeguro } from "../utils/secureUpload";

const router = Router();
const uploadAdmin = receberArquivos(uploadSeguro.any(), {
  camposPdf: ["ccmei"],
});

router.post("/login", limiteLogin, AdminController.login);
router.post("/logout", AdminController.logout);

router.get(
  "/estabelecimento/:id",
  adminAuthMiddleware,
  AdminController.getEstabelecimentoById,
);

router.get(
  "/users/:id/interacoes",
  adminAuthMiddleware,
  AdminController.getUserInteractions,
);

router.get(
  "/estabelecimento/:id/ccmei",
  adminAuthMiddleware,
  AdminController.baixarCcmei,
);

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

router.get(
  "/estabelecimentos-geral",
  adminAuthMiddleware,
  AdminController.getAllActiveEstabelecimentos,
);

router.get(
  "/estabelecimentos-inativos",
  adminAuthMiddleware,
  AdminController.getAllInactiveEstabelecimentos,
);

router.patch(
  "/estabelecimento/:id",
  adminAuthMiddleware,
  ...uploadAdmin,
  AdminController.adminUpdateEstabelecimento,
);

router.put(
  "/estabelecimento/:id/status",
  adminAuthMiddleware,
  AdminController.adminAlterarStatusEstabelecimento,
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
  "/users/:id/revoke-sessions",
  adminAuthMiddleware,
  AdminController.revogarSessoesUsuario,
);
router.post(
  "/users/:id/resend-confirmation",
  adminAuthMiddleware,
  AdminController.resendConfirmationEmail,
);
// =================================

export default router;
