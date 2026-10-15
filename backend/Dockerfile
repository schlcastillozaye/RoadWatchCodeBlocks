# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
#  RoadWatch API — production image
#  Build:  docker build -t roadwatch-api ./backend
#  Run:    docker run -p 4000:4000 --env-file backend/.env roadwatch-api
# ---------------------------------------------------------------------------

# ---------- build stage ----------
FROM node:22-slim AS build
WORKDIR /app

# Prisma needs OpenSSL; keep the layer cached across source changes.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client from the schema (no database connection needed).
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

# Full dependency tree (includes the Prisma CLI used for `migrate deploy`).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# `npm run seed` runs prisma/seed.ts directly through tsx, and that file imports
# from ../src/… (storage, reference counter, config). Without the TypeScript
# sources in the image those imports cannot resolve and seeding fails with
# MODULE_NOT_FOUND — dist/ alone is not enough.
COPY --from=build /app/src ./src
COPY prisma.config.ts package.json package-lock.json ./

# Entrypoint applies pending migrations before the server starts.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/uploads
ENV STORAGE_LOCAL_DIR=/app/uploads

EXPOSE 4000
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
