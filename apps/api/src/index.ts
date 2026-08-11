import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import routes from '@/routes';
import { sequelize } from '@/db/sequelize';
import { initModels } from '@/models';
import { JobWorker } from '@/services/JobWorker';
import { adminToken } from '@/middlewares/adminToken';

function getCorsOrigins(): string[] {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;

  return ['http://127.0.0.1:3001', 'http://localhost:3001'];
}

async function bootstrap() {
  const app = express();

  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: false,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  initModels();

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }

  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api/v1', adminToken);

  routes(app);

  JobWorker.start();

  const PORT = Number(process.env.PORT) || 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 API running on port ${PORT}`);
  });
}

bootstrap();
