import { Router } from 'express';
import * as kitchenStationController from '../controllers/kitchenStation.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', kitchenStationController.list);
router.post('/', requireRole('admin'), kitchenStationController.create);
router.put('/:id', requireRole('admin'), kitchenStationController.update);
router.delete('/:id', requireRole('admin'), kitchenStationController.remove);

export default router;
