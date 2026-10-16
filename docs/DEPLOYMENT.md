# RoadWatch — Deployment

This project is delivered with configuration and documentation rather than a live hosted
environment. Everything below is what you change to put it on real infrastructure.

---

## 1. Overview

| Component | What it is | Typical host |
| --- | --- | --- |
| `backend/` | Node + Express API, compiled with `tsc` | Render, Railway, Fly.io, a VPS, Azure App Service |
| MySQL 8.0 | Primary datastore | Managed MySQL (PlanetScale, Azure Database for MySQL, RDS) or a VPS |
| `web/` | Static React bundle in `web/dist` | Netlify, Vercel, Cloudflare Pages, nginx, S3 + CloudFront |
| Image storage | Local disk by default, S3-compatible optionally | S3, Cloudflare R2, MinIO, a mounted volume |
| `mobile/` | Flutter app | Google Play, Apple App Store, or internal distribution |

The backend is the only component that talks to the database and to the image store.

---

## 2. Backend

### Build and run

```bash
cd backend
npm ci
npm run build          # -> dist/
npm start              # node dist/index.js
```

Run it behind a process manager (systemd, PM2, or the platform's own supervisor) and
terminate TLS at a reverse proxy.

A production **Dockerfile** is included (`backend/Dockerfile`). It generates the Prisma
client, compiles the TypeScript, and uses an entrypoint (`backend/docker-entrypoint.sh`)
that applies pending migrations (`RUN_MIGRATIONS`, default on) and can optionally seed
demo data (`SEED_ON_START`, default off) before the server starts:

```bash
docker build -t roadwatch-api ./backend
docker run -p 4000:4000 --env-file backend/.env roadwatch-api
```

### Production environment variables

```ini
NODE_ENV=production
PORT=4000

# The public origins of the web platform (comma-separated, no trailing slashes)
CORS_ORIGINS=https://admin.roadwatch.example,https://roadwatch.example

# Managed MySQL. URL-encode special characters in the password.
DATABASE_URL="mysql://roadwatch:PASSWORD@db-host:3306/roadwatch"

# Generate strong secrets; never reuse the development values.
#   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_ACCESS_SECRET=<48-byte-random>
JWT_REFRESH_SECRET=<different-48-byte-random>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# Storage: local disk or S3-compatible object storage
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=/var/lib/roadwatch/uploads
PUBLIC_BASE_URL=https://api.roadwatch.example
MAX_UPLOAD_BYTES=8388608

# Optional image-processing module
IMAGE_PROCESSING_ENABLED=false

# Optional: prefer Google geocoding. Leave empty to use the free
# OpenStreetMap Nominatim geocoder (no key needed).
GOOGLE_MAPS_SERVER_API_KEY=
```

> **`PUBLIC_BASE_URL` should be the externally reachable API URL.** It is used to build the
> absolute image URLs returned to both clients. It is optional: when it is left empty the
> API returns image paths relative to itself, and both clients resolve them against their
> configured API base URL — the more portable default when hosting.

### Database migration

Prisma's `db push` is used during development. For production, an initial, reviewable
migration is **already committed** at
`backend/prisma/migrations/20260101000000_init/migration.sql`, generated from the schema.
Apply it on the server with:

```bash
npx prisma migrate deploy      # applies backend/prisma/migrations/*
```

The Docker image runs this automatically on boot (see `RUN_MIGRATIONS`). If you change the
schema later, create a new migration locally and commit it:

```bash
npx prisma migrate dev --name <change>   # create + apply locally, commit the new folder
```

Then seed only if you want the demo data (do **not** seed production):

```bash
npm run seed
```

### Seed accounts must not survive production

`prisma/seed.ts` creates demo users with known passwords. On a real deployment either
skip seeding or immediately change every password through `POST /api/users/:id/reset-password`.

### Health check

Point the platform's health probe at `GET /health`. It returns `database: "up"` only when
MySQL actually answers, so it is a genuine readiness check:

```json
{ "status": "ok", "database": "up", "storage": "local", "imageProcessing": "disabled" }
```

### Behind a reverse proxy

The app sets `trust proxy`, so `req.ip` and rate limiting use the real client IP as long
as your proxy sends `X-Forwarded-For`. Sample nginx block:

```nginx
server {
  listen 443 ssl;
  server_name api.roadwatch.example;

  client_max_body_size 12m;          # keep above MAX_UPLOAD_BYTES

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## 3. Images

### Local disk (default)

Uploads are written under `STORAGE_LOCAL_DIR`. **This directory must be persistent and
backed up** — it is not inside the database.

- On a VPS: mount a volume, and include it in your backup rotation.
- On a container platform with an ephemeral filesystem: mount a persistent volume, or
  switch to object storage.

### S3-compatible object storage

Set `STORAGE_DRIVER=s3` and fill in:

```ini
S3_BUCKET=roadwatch-media
S3_REGION=ap-southeast-1
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_ENDPOINT=            # leave empty for AWS, or set for R2/MinIO
```

The storage driver is selected in `src/services/storage/index.ts` behind a single
interface, so switching drivers does not touch any feature code.

Bucket policy: keep objects **private**. Images are served through
`GET /api/files/by-key/:key`, which applies the moderation-based authorization rules.

---

## 4. Web platform

```bash
cd web
npm ci
npm run build          # type-checks, then emits dist/
```

Deploy `web/dist` as static files. Because the app uses client-side routing, configure a
**SPA fallback** so deep links work:

- **Netlify** — `public/_redirects` containing `/*  /index.html  200` (already committed)
- **Render static site** — the `render.yaml` rewrite covers this; `_redirects` also works
- **Vercel** — a rewrite of all paths to `/index.html`
- **nginx** — `try_files $uri $uri/ /index.html;`
- **S3 + CloudFront** — set the error document to `index.html` (403 and 404)

Build-time environment:

```ini
VITE_API_BASE_URL=https://api.roadwatch.example
```

Vite inlines these at build time, so rebuild after changing them. There are no runtime
secrets in the web bundle, and no map key at all — the web map is **Leaflet on
OpenStreetMap tiles**, which needs no account or billing.

---

## 5. Maps and geocoding

**Nothing here requires a Google key.** The map stack is:

| Component | Provider | Key |
| --- | --- | --- |
| Web map | Leaflet on OpenStreetMap tiles | none |
| Mobile map | `flutter_map` on OpenStreetMap tiles | none |
| API geocoding (search + reverse) | OpenStreetMap Nominatim | none |

Nominatim's usage policy is respected automatically: requests carry a descriptive
`User-Agent`, are throttled to at most one per second, and results are cached in memory
for 10 minutes. OSM tile requests likewise carry a descriptive `User-Agent` on mobile,
and both maps display OpenStreetMap attribution.

### Optional: server-side Google geocoding

If you would rather geocode with Google, enable billing on the project and create a key
restricted to the **Geocoding API**:

| Key | Used by | Restriction |
| --- | --- | --- |
| Server key | Backend (`GOOGLE_MAPS_SERVER_API_KEY`) | No application restriction, **Geocoding API** only |

Setting `GOOGLE_MAPS_SERVER_API_KEY` makes the API use Google Geocoding instead of
Nominatim — no client change needed. Never reuse the server key in a client.

Client maps need no key at all, so there is nothing to restrict or rotate there.

---

## 6. Mobile

```bash
cd mobile
flutter build appbundle --dart-define=API_BASE_URL=https://api.roadwatch.example

# iOS
flutter build ipa --dart-define=API_BASE_URL=https://api.roadwatch.example
```

Maps need no key on either platform. `API_BASE_URL` defaults to
`http://localhost:4000`, which is useful for emulators but **must** be overridden for any
real build. Note that Android emulators rewrite `localhost` to `10.0.2.2` automatically;
physical devices need the machine's LAN IP or the public URL.

Store listings need the camera and location usage descriptions, which are already
declared in `android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist`.

---

## 7. Security checklist

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are long, random and different from dev.
- [ ] The `roadwatch` database user has rights **only** on the `roadwatch` schema.
- [ ] `CORS_ORIGINS` lists exactly your production web origins (no `*`).
- [ ] TLS everywhere; HSTS at the proxy.
- [ ] `PUBLIC_BASE_URL` is the HTTPS API URL.
- [ ] Image storage is private; images are only reachable through the API.
- [ ] Maps need no key; verify OSM tiles load and attribution is visible.
- [ ] Seeded demo accounts are removed or their passwords rotated.
- [ ] Database and the uploads volume are backed up, and a restore has been tested.
- [ ] Rate limits are appropriate for expected traffic (`src/app.ts` and `modules/auth/routes.ts`).
- [ ] Server clock is synchronised (JWT expiry depends on it).

Role-based access control is enforced **server-side** in `src/middleware/rbac.ts` and in
each module's service layer. In particular:

- approving/rejecting is `ADMIN` only,
- assigning is `ADMIN` only,
- officers can only change reports assigned to them,
- the override that completes a repair without a photo is `ADMIN` only and is audited.

Client-side hiding of buttons is cosmetic only — the server is the source of truth.

### Third-party data flows

Two outbound requests leave your infrastructure, both to OpenStreetMap:

| Call | Made by | What is sent |
| --- | --- | --- |
| Nominatim geocoding | Backend, on address search / reverse geocode | the search text or the coordinates being resolved |
| OSM raster tiles | Web and mobile clients, directly | standard HTTP request (IP address, `User-Agent`) |

Neither carries user identity, tokens or photos. Both are rate-limited per the OSM usage
policy. If your deployment handles location data with stricter requirements, set
`GOOGLE_MAPS_SERVER_API_KEY` to route geocoding through Google instead, or self-host
tiles/Nominatim.

---

## 8. Render quickstart

A `render.yaml` Blueprint at the repository root deploys both the API (Docker) and the web
platform (static site) in one go, plus the `backend/Dockerfile` it builds. A step-by-step
walkthrough — including the free managed MySQL database — is in
[`DEPLOY_RENDER.md`](./DEPLOY_RENDER.md).

In short:

1. Create a free MySQL database (Aiven or Railway) and copy its connection string.
2. In Render, **New +** → **Blueprint**, connect this repository, and apply.
3. When prompted, set `DATABASE_URL`, `CORS_ORIGINS` and `PUBLIC_BASE_URL` for the API, and
   `VITE_API_BASE_URL` for the web platform. Render generates the JWT secrets for you.
4. Optionally set `SEED_ON_START=true` once to create the demo accounts, then set it back
   to `false`.

> **Image storage on Render.** The free plan uses an ephemeral filesystem, so uploads are
> lost on redeploy. For durable photos either attach a persistent disk (paid instance — see
> the commented `disk:` block in `render.yaml`) or switch to S3-compatible object storage
> (`STORAGE_DRIVER=s3`, recommended; Cloudflare R2 has a generous free tier).
