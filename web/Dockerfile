# ===========================================================================
#  RoadWatch web platform — static image for Railway (and any Docker host).
# ===========================================================================
#  Serves the vanilla HTML/CSS/JS app with nginx, including SPA fallback so
#  client-side routes such as /admin and /reports resolve to index.html.
#
#  Build:  docker build -f web/Dockerfile -t roadwatch-web web
#  Run:    docker run -p 8080:8080 -e PORT=8080 -e RW_API_BASE_URL=https://api.example.com roadwatch-web
#
#  RW_API_BASE_URL is optional. When the API lives on a different origin (the
#  usual two-service Railway setup) set it to the API's public origin; the
#  container writes it into rw-runtime-config.js at start-up. When the API is
#  served from the same origin, leave it unset.
# ===========================================================================
FROM nginx:alpine

# Only the runtime static assets are copied (see web/.dockerignore).
COPY . /usr/share/nginx/html

# nginx:alpine renders /etc/nginx/templates/*.template through envsubst at
# start-up, so ${PORT} (injected by Railway) is substituted automatically.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# The runtime-config generator must be executable: nginx's entrypoint only runs
# executable files in /docker-entrypoint.d/. The bit is set explicitly because
# it is not reliably preserved when building from a Windows checkout.
COPY docker-entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*.sh

ENV PORT=8080
EXPOSE 8080
