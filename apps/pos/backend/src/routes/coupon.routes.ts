import { Router } from 'express';
import * as couponController from '../controllers/coupon.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', couponController.list);
router.post('/', requireRole('admin'), couponController.create);
router.post('/bulk-generate', requireRole('admin'), couponController.bulkGenerate);
router.put('/:id', requireRole('admin'), couponController.update);
router.delete('/:id', requireRole('admin'), couponController.remove);
router.post('/preview', couponController.preview);

export default router;
