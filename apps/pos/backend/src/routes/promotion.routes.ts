import { Router } from 'express';
import * as promotionController from '../controllers/promotion.controller';
import { authenticate, requirePermission } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', promotionController.list);
router.post('/apply', promotionController.apply);
router.post('/', requirePermission('promotions.create'), promotionController.create);
router.put('/:id', requirePermission('promotions.edit'), promotionController.update);
router.delete('/:id', requirePermission('promotions.delete'), promotionController.remove);

export default router;
