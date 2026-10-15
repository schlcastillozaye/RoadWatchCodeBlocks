#!/bin/sh
# ---------------------------------------------------------------------------
#  RoadWatch API container entrypoint.
#
#  Applies any pending Prisma migrations, optionally seeds demo data, then
#  starts the server. Both steps are controlled by environment variables so the
#  image behaves predictably in every environment.
#
#    RUN_MIGRATIONS   default "true"   — run `prisma migrate deploy` on boot
#    SEED_ON_START    default "false"  — run the demo seed (never in real prod)
#    RESET_DATABASE   default "false"  — DANGER: drop & recreate the schema first
# ---------------------------------------------------------------------------
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "[entrypoint] DATABASE_URL is not set — skipping migrations."
  else
    if [ "${RESET_DATABASE:-false}" = "true" ]; then
      echo "[entrypoint] RESET_DATABASE=true — pushing a clean schema (destructive)."
      npx prisma db push --force-reset --skip-generate || \
        echo "[entrypoint] WARN: prisma db push failed; continuing."
    else
      echo "[entrypoint] Applying database migrations..."
      npx prisma migrate deploy || \
        echo "[entrypoint] WARN: prisma migrate deploy failed; starting anyway so /health can report the problem."
    fi
  fi
fi

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] Seeding demo data..."
  npm run seed || echo "[entrypoint] WARN: seeding failed; continuing."
fi

exec "$@"
