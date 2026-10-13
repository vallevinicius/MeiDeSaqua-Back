import { Router } from 'express';
import AuthController from '../controllers/AuthController';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  limiteCadastro,
  limiteEmail,
  limiteLogin,
} from '../middlewares/rateLimit.middleware';

const router = Router();

router.post('/cadastro', limiteCadastro, AuthController.cadastrar);
router.post('/login', limiteLogin, AuthController.login);
router.post('/resend-confirmation', limiteEmail, AuthController.resendConfirmation);
router.post('/migrar-sessao', limiteLogin, authMiddleware, AuthController.migrarSessao);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);
router.get('/confirm-account', AuthController.confirmAccount);
router.post('/forgot-password', limiteEmail, AuthController.forgotPassword);
router.post('/reset-password', limiteEmail, AuthController.resetPassword);
router.get('/confirm-email-change', AuthController.confirmEmailChange);

export default router;