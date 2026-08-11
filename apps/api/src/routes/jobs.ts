import { Router } from 'express';
import { JobsController } from '@/controllers/JobsController';

const router = Router();

router.get('/', JobsController.list);
router.get('/:id', JobsController.get);
router.get('/:id/logs', JobsController.logs);
router.get('/:id/stream', JobsController.stream);
router.post('/test', JobsController.test);

export default router;