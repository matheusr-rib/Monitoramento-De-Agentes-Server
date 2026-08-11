import { Request, Response } from 'express';
import { JobRunService } from '@/services/JobRunService';
import { JobRunLogService } from '@/services/JobRunLogService';
import { TaskExecutor } from '@/services/TaskExecutor';

export class JobsController {
  static async list(req: Request, res: Response) {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const jobs = await JobRunService.list(Number.isFinite(limit) ? limit : 50);
    return res.json({ data: jobs });
  }

  static async get(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const job = await JobRunService.getById(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    return res.json({ data: job });
  }

  
  static async logs(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const afterId = req.query.afterId ? Number(req.query.afterId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 500;

    const logs = await JobRunLogService.list(id, Number.isFinite(limit) ? limit : 500, Number.isFinite(afterId as any) ? afterId : undefined);
    return res.json({ data: logs });
  }

  static async stream(req: Request, res: Response) {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let lastId = req.query.afterId ? Number(req.query.afterId) : 0;
    let closed = false;

    req.on('close', () => {
      closed = true;
    });

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('hello', { jobId: id });

    while (!closed) {
      const logs = await JobRunLogService.list(id, 500, lastId > 0 ? lastId : undefined);
      if (logs.length) {
        lastId = Number((logs as any[])[logs.length - 1].id_job_run_log);
        send('logs', logs);
      } else {
        // heartbeat
        send('ping', { t: Date.now() });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }


  /**
   * POST /api/v1/jobs/test
   * body: { requestedBy?: string }
   */
  static async test(req: Request, res: Response) {
    const requestedBy =
      (req.body?.requestedBy as string | undefined) ??
      (req.headers['x-user'] as string | undefined) ??
      'system';

    const { jobId, result } = await TaskExecutor.run(
      {
        jobType: 'LOADER_TEST_PING', // ✅ passa na ck_job_run_type (LOADER_%)
        requestedBy,
        inputMeta: { hello: 'world' },
      },
      async (ctx) => {
        ctx.setStat('step', 'started');
        await new Promise((r) => setTimeout(r, 250));
        ctx.setStat('step', 'finished');
        return { ok: true };
      }
    );

    return res.status(201).json({ jobId, result });
  }
}