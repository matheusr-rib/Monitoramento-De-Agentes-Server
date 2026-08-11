import { Router } from 'express';
import { ProceduresController } from '@/controllers/ProceduresController';

const router = Router();

router.post('/match-clicksign', ProceduresController.matchClicksign);
router.post('/calc-score', ProceduresController.calcScore);

export default router;
