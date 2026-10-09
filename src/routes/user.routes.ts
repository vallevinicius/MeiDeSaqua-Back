
import { Router } from 'express';
import UserController from '../controllers/UserController';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/profile', UserController.updateUserProfile);
router.delete('/profile', UserController.deleteUserProfile);
router.put('/password', UserController.updateUserPassword);
router.get('/profile/estabelecimentos', UserController.getOwnEstabelecimentos);
router.put('/profile/estabelecimentos/:id', UserController.updateOwnEstabelecimento);

export default router;