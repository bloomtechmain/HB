import { Router } from 'express';
import * as whatsappController from '../controllers/whatsapp.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/status', whatsappController.status);
router.post('/pair', requireRole('admin'), whatsappController.pair);
router.post('/logout', requireRole('admin'), whatsappController.logout);
router.post('/test', requireRole('admin'), whatsappController.test);

export default router;
