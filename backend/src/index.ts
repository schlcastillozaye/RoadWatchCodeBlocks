import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';

async function main() {
  // Try to connect, but do not die if the database is unreachable: the server
  // still starts so /health can report "database": "down" and operators can see
  // exactly what is wrong instead of a silent crash.
  try {
    await prisma.$connect();
    logger.info('Database connection established.');
  } catch (err) {
    logger.error(
      'Could not connect to the database. The API will start, but database-backed ' +
        'endpoints will fail and /health will report "database": "down". ' +
        'Have you run db/setup.sql and set DATABASE_URL in backend/.env?',
      err,
    );
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`RoadWatch API listening on http://localhost:${env.port}`);
    logger.info(`Environment: ${env.nodeEnv}`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully.`);
    server.close(async () => {
      await prisma.$disconnect().catch(() => undefined);
      process.exit(0);
    });
    // Force-exit if graceful close hangs.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', reason));
  process.on('uncaughtException', (err) => logger.error('Uncaught exception', err));
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
