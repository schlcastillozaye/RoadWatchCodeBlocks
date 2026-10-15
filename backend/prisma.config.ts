import path from 'node:path';
import { defineConfig } from 'prisma/config';
import 'dotenv/config';

/**
 * Prisma configuration (Prisma 6+).
 * Replaces the deprecated `package.json#prisma` block.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
