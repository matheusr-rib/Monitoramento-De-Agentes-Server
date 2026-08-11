import { Router } from 'express';
import { ClicksignController } from '@/controllers/ClicksignController';

const router = Router();

router.post('/backfill', ClicksignController.backfill);

export default router;
