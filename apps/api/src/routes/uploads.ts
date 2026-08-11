import { Router } from 'express';
import { UploadsController } from '@/controllers/UploadsController';

const router = Router();
const controller = new UploadsController();

// Admin token já protege no index.ts (middleware global após /health)
router.post('/presign', (req, res, next) => controller.presign(req, res, next));
router.post('/confirm', (req, res, next) => controller.confirm(req, res, next));

export default router;