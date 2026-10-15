import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { asyncHandler } from './utils/asyncHandler';
import { prisma } from './config/prisma';
import { getImageProcessing } from './services/imageProcessing';
import { getStorage } from './services/storage';

import authRoutes from './modules/auth/routes';
import userRoutes from './modules/users/routes';
import reportRoutes from './modules/reports/routes';
import maintenanceRoutes from './modules/maintenance/routes';
import mapRoutes from './modules/map/routes';
import analyticsRoutes from './modules/analytics/routes';
import uploadRoutes from './modules/uploads/routes';

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Images are served cross-origin to the mobile app and web platform.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Mobile clients send no Origin header — allow them.
        if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (!env.isProd) app.use(morgan('dev'));

  // Baseline API rate limit (auth routes apply a stricter limit of their own).
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
    }),
  );

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      let database = 'unknown';
      try {
        await prisma.$queryRaw`SELECT 1`;
        database = 'up';
      } catch {
        database = 'down';
      }
      res.json({
        status: 'ok',
        service: 'roadwatch-api',
        database,
        storage: getStorage().name,
        imageProcessing: getImageProcessing().enabled ? getImageProcessing().name : 'disabled',
        time: new Date().toISOString(),
      });
    }),
  );

  app.get('/', (_req, res) => {
    res.json({ name: 'RoadWatch API', version: '1.0.0', docs: '/health' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/maintenance', maintenanceRoutes);
  app.use('/api/map', mapRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/files', uploadRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
