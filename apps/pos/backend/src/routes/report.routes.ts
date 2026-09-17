import { Router } from 'express';
import * as reportController from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/dashboard', reportController.dashboard);
router.get('/inventory', reportController.inventoryReport);
router.get('/sales', reportController.salesReport);
router.get('/product-sales', reportController.productSalesReport);
router.get('/cashiers', reportController.cashierReport);
router.get('/stock-movements', reportController.stockMovementReport);
router.get('/promotions', reportController.promotionsReport);
router.get('/price-overrides', reportController.priceOverridesReport);
router.get('/credit', reportController.creditReport);

export default router;
