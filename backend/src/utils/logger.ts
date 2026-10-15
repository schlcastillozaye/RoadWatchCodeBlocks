/* eslint-disable no-console */
import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = order[env.isProd ? 'info' : 'debug'];

function emit(level: Level, message: string, meta?: unknown) {
  if (order[level] < threshold) return;
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${level.toUpperCase()} ${message}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) sink(line, meta);
  else sink(line);
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
