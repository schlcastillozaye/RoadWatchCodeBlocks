import 'dotenv/config';

function str(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: num('PORT', 4000),

  corsOrigins: str('CORS_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  databaseUrl: str('DATABASE_URL', 'mysql://roadwatch:RoadWatchDev2026@127.0.0.1:3306/roadwatch'),

  jwt: {
    accessSecret: str('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-please-32chars'),
    refreshSecret: str('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-please-32chars'),
    accessTtl: str('JWT_ACCESS_TTL', '15m'),
    refreshTtl: str('JWT_REFRESH_TTL', '30d'),
  },

  storage: {
    driver: (str('STORAGE_DRIVER', 'local') as 'local' | 's3'),
    localDir: str('STORAGE_LOCAL_DIR', 'uploads'),
    // Optional. When set, image URLs are absolute; when empty they are returned
    // relative (e.g. "/api/files/by-key/…") and both clients prefix their API
    // base URL. Leaving it empty is the most portable choice for hosting.
    publicBaseUrl: str('PUBLIC_BASE_URL', ''),
    maxUploadBytes: num('MAX_UPLOAD_BYTES', 8 * 1024 * 1024),
    s3: {
      bucket: process.env.S3_BUCKET ?? '',
      region: process.env.S3_REGION ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      endpoint: process.env.S3_ENDPOINT ?? '',
    },
  },

  imageProcessing: {
    enabled: bool('IMAGE_PROCESSING_ENABLED', false),
    provider: str('IMAGE_PROCESSING_PROVIDER', 'none'),
    apiUrl: process.env.IMAGE_PROCESSING_API_URL ?? '',
    apiKey: process.env.IMAGE_PROCESSING_API_KEY ?? '',
  },

  googleMaps: {
    serverApiKey: process.env.GOOGLE_MAPS_SERVER_API_KEY ?? '',
  },
} as const;

export type Env = typeof env;
