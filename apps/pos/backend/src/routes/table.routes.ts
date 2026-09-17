import { Router } from 'express';
import * as tableController from '../controllers/table.controller';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', tableController.list);
router.post('/', requireRole('admin'), tableController.create);
router.put('/:id', requireRole('admin'), tableController.update);
router.delete('/:id', requireRole('admin'), tableController.remove);

export default router;
