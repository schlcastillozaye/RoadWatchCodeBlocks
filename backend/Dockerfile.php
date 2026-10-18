# ===========================================================================
#  RoadWatch PHP API — production image for Railway (and any Docker host).
# ===========================================================================
#  Runs the *exact* command verified locally:
#
#      php -S 0.0.0.0:$PORT -t public router.php
#
#  `router.php` serves real static files from public/ and forwards every other
#  request to public/index.php (the API front controller).
#
#  Build:  docker build -f backend/Dockerfile.php -t roadwatch-api backend
#  Run:    docker run -p 4000:4000 -e PORT=4000 --env-file backend/.env roadwatch-api
#
#  This file is separate from backend/Dockerfile (which still builds the legacy
#  Node + Prisma service) so the two entry points never collide.
# ===========================================================================
FROM php:8.2-cli

# ---------------------------------------------------------------------------
#  PHP extensions the PHP backend actually uses:
#    - pdo_mysql : all database access (Support/Db.php)
#    - mbstring  : mb_strlen / mb_substr (validation + search)
#    - curl      : outbound HTTP for OSM Nominatim / Google geocoding
#                  (Services/Geocoding.php) and the optional image-analysis API
#                  (Services/ImageProcessing.php). Without it both services
#                  degrade to "unavailable", so it MUST be installed.
#    - fileinfo  : MIME sniffing on upload (already in the base image)
#  No GD/Imagick: image dimensions use core getimagesizefromstring().
# ---------------------------------------------------------------------------
RUN apt-get update \
 && apt-get install -y --no-install-recommends libonig-dev libcurl4-openssl-dev \
 && docker-php-ext-install pdo_mysql mbstring curl \
 && docker-php-ext-enable pdo_mysql mbstring curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Application source (context = ./backend).
COPY . /app

# Upload limits must sit ABOVE the application's MAX_UPLOAD_BYTES (default
# 8 MB), which ReportService enforces so the client gets the documented 413
# "File too large" error. If PHP's own limits were lower, an oversized upload
# would be swallowed before the app ran and surface as a confusing
# "at least one photo is required" error instead.
COPY php.ini /usr/local/etc/php/conf.d/roadwatch-uploads.ini

# Uploads directory. On Railway this must be a mounted volume so files survive
# redeploys; see docs/deployment-checklist.md.
RUN mkdir -p /app/uploads && chmod -R 0777 /app/uploads

ENV PORT=4000 \
    NODE_ENV=production \
    STORAGE_DRIVER=local \
    STORAGE_LOCAL_DIR=/app/uploads \
    STORAGE_PERSISTENT_MOUNT_PATH=/app/uploads \
    RUN_MIGRATIONS=true \
    PHP_CLI_SERVER_WORKERS=4

EXPOSE 4000

# $PORT is injected by Railway. NODE_ENV=production requires real JWT secrets
# and DATABASE_URL to be provided as service variables.
#
# The schema is applied on boot: `database/migrate.php` is idempotent (CREATE
# TABLE IF NOT EXISTS plus guarded patches) and delivers additive migrations
# such as persistent assignment notifications to existing databases. A schema
# failure must prevent the API starting so requests cannot report success
# against an incomplete schema. Set RUN_MIGRATIONS=false only when migrations
# are managed externally and have already been applied.
CMD ["sh", "-c", "set -e; if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then echo '[entrypoint] Applying schema...'; php database/migrate.php; fi; exec php -S 0.0.0.0:${PORT:-4000} -t public router.php"]
