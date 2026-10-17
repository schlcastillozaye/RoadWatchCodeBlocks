#!/bin/sh
# ---------------------------------------------------------------------------
# RoadWatch web platform — generate the runtime API override at container start.
#
# nginx:alpine runs every executable file in /docker-entrypoint.d/ before nginx
# starts, so this lets the deployed API origin come from an environment variable
# (Railway service variable RW_API_BASE_URL) instead of being baked into the
# image at build time.
#
# If RW_API_BASE_URL is unset/empty the web app falls back to config.js's
# same-origin auto-detection (which is what you want when the API and the site
# are served from the same origin).
# ---------------------------------------------------------------------------
set -eu

target="/usr/share/nginx/html/rw-runtime-config.js"
base="${RW_API_BASE_URL:-}"

# Drop any trailing slashes so URL joins stay clean.
base="$(printf '%s' "$base" | sed 's:/*$::')"

if [ -n "$base" ]; then
  printf 'window.RW_API_BASE_URL = "%s";\nwindow.RW_API_BASE = "%s";\n' "$base" "$base" > "$target"
  echo "[roadwatch] runtime API base URL set to: $base"
else
  printf '/* RW_API_BASE_URL was not set at container start; using same-origin auto-detection. */\n' > "$target"
  echo "[roadwatch] RW_API_BASE_URL not set; web app will use same-origin auto-detection."
fi
