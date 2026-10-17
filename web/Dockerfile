# ===========================================================================
#  RoadWatch web platform — static image for Railway (and any Docker host).
# ===========================================================================
#  Serves the vanilla HTML/CSS/JS app with nginx, including SPA fallback so
#  client-side routes such as /admin and /reports resolve to index.html.
#
#  Build:  docker build -f web/Dockerfile -t roadwatch-web web
#  Run:    docker run -p 8080:8080 -e PORT=8080 roadwatch-web
# ===========================================================================
FROM nginx:alpine

# Only the runtime static assets are copied (see web/.dockerignore).
COPY . /usr/share/nginx/html

# nginx:alpine renders /etc/nginx/templates/*.template through envsubst at
# start-up, so ${PORT} (injected by Railway) is substituted automatically.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV PORT=8080
EXPOSE 8080
