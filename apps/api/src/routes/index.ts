import express, { Express } from 'express';
import { errorsMiddleware, notFoundMiddleware } from '@lewe-negocios/api-core';

import healthRouter from '@/routes/health';
import loadersRouter from '@/routes/loaders';
import jobsRouter from '@/routes/jobs';
import clicksignRouter from '@/routes/clicksign';
import proceduresRouter from '@/routes/procedures';
import uploadsRouter from '@/routes/uploads';
import pendenciasRouter from '@/routes/pendencias';
import agentesRouter from '@/routes/agentes';
import regrasRouter from "@/routes/regras";

export default function routes(app: Express) {
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/loaders', loadersRouter);
  app.use('/api/v1/jobs', jobsRouter);
  app.use('/api/v1/clicksign', clicksignRouter);
  app.use('/api/v1/procedures', proceduresRouter);
  app.use('/api/v1/uploads', uploadsRouter);
  app.use("/api/v1/pendencias", pendenciasRouter);
  app.use("/api/v1/agentes", agentesRouter);
  app.use("/api/v1/regras", regrasRouter);
  app.use(notFoundMiddleware);
  app.use(errorsMiddleware);
}