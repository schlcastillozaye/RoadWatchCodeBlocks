/*
 * RoadWatch web platform — runtime API base URL override.
 *
 * This file is loaded by index.html *after* config.js and *before* js/app.js.
 *
 *   - Local development: this file is a no-op. config.js already auto-detects
 *     the API (same origin, or http://localhost:4000 when served from a static
 *     dev server).
 *
 *   - Docker / Railway: at container start, docker-entrypoint.d/40-roadwatch-config.sh
 *     regenerates this file from the RW_API_BASE_URL environment variable, so the
 *     deployed API origin is configured *without* rebuilding the image.
 *
 * Set RW_API_BASE_URL on the web service to the API's public origin, e.g.
 *   RW_API_BASE_URL=https://roadwatch-api-production.up.railway.app
 */

/* No override by default — config.js auto-detection applies. */
