import { Router } from 'express';
import AuthController from '../controllers/AuthController';

const router = Router();

router.post('/cadastro', AuthController.cadastrar);
router.post('/login', AuthController.login);
router.get('/confirm-account', AuthController.confirmAccount);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.get('/confirm-email-change', AuthController.confirmEmailChange);

export default router;