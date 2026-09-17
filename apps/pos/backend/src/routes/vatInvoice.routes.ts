import { Router } from 'express';
import * as vatInvoiceController from '../controllers/vatInvoice.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/pending', vatInvoiceController.pending);
router.post('/:saleId/generate', vatInvoiceController.generate);
router.get('/', vatInvoiceController.list);
router.get('/:id', vatInvoiceController.getById);

export default router;
