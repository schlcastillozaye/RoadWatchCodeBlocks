# RoadWatch — Railway Deployment Checklist

> Status of every step below is evidence-based. This document describes how to
> deploy the **intended target architecture** (PHP API + MySQL/TiDB + static
> vanilla-JS web app on Railway). Nothing here is claimed to be deployed or
> production-tested — the local verification that *was* performed is listed in
> §7 and in `docs/independent-verification-report.md`.

---

## 0. Target architecture

| Component | Technology | Deploy target |
|---|---|---|
| Mobile app | Flutter / Dart | store / APK (not Railway) |
| Web app | HTML + CSS + vanilla JS | Railway service (nginx static image) |
| API | PHP 8.2 (PDO, no Composer deps) | Railway service (PHP Docker image) |
| Database | MySQL 8 / MariaDB / TiDB Cloud | Railway MySQL plugin **or** TiDB Cloud |
| Maps | Leaflet + OpenStreetMap (web), flutter_map (mobile) | none (free, keyless) |
| Storage | Local disk on a Railway volume | Railway volume mounted at `/app/uploads` |

Two Railway services from this one repository:

1. **`roadwatch-api`** — root directory `backend/`
2. **`roadwatch-web`** — root directory `web/`

---

## 1. Prerequisites

- A Railway account and a project (`railway.app`).
- This repository pushed to GitHub (Railway deploys from a Git remote).
- A MySQL-compatible database:
  - **Option A (simplest):** Railway **MySQL** plugin in the same project.
  - **Option B:** **TiDB Cloud** Starter (MySQL-compatible, free tier).

> ⚠️ **Commit first.** The current working tree contains an *untracked* PHP
> backend (`backend/src/Http/`, `backend/router.php`, `public/`, `database/`,
> `seed.php`, …) and the untracked vanilla web app (`web/js/`, `web/config.js`,
> `web/css/`). If these files are not committed and pushed, Railway will build
> the legacy Node service and the React web app instead. See
> `docs/independent-verification-report.md` §"Git tracking".

---

## 2. Service 1 — API (`roadwatch-api`)

1. Railway → **New Service → Deploy from GitHub repo**.
2. Service → **Settings → Source → Root Directory** = `backend`.
3. Railway reads `backend/railway.json`, which selects the Dockerfile builder
   (`backend/Dockerfile.php`) and the health check.
4. **Variables** (Service → Variables). Set:

   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | enables generic 500 messages |
   | `PORT` | *(injected by Railway)* | do **not** set manually |
   | `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:PORT/DATABASE` | URL-encode special chars |
   | `JWT_ACCESS_SECRET` | 32+ random chars | generate, e.g. `openssl rand -base64 48` |
   | `JWT_REFRESH_SECRET` | 32+ random chars | must differ from access secret |
   | `JWT_ACCESS_TTL` | `15m` | |
   | `JWT_REFRESH_TTL` | `30d` | |
   | `CORS_ORIGINS` | `https://<web-service>.up.railway.app` | the web app origin, no trailing slash |
   | `PUBLIC_BASE_URL` | `https://<api-service>.up.railway.app` | used to build absolute photo URLs |
   | `STORAGE_DRIVER` | `local` | only `local` is implemented |
   | `STORAGE_LOCAL_DIR` | `/app/uploads` | must match the volume mount |
   | `MAX_UPLOAD_BYTES` | `8388608` | 8 MB |
   | `SEED_ON_START` | `false` | set `true` once only if you want demo data |

   **TiDB Cloud only:** append `?sslaccept=strict` (or `?ssl-mode=VERIFY_IDENTITY`)
   and use port `4000`, e.g.
   `mysql://user:pass@xxx.tidbcloud.com:4000/roadwatch?sslaccept=strict`.
   For the Railway MySQL plugin, use the referenced variables
   (`${{MySQL.MYSQLUSER}}`, `${{MySQL.MYSQLPASSWORD}}`, `${{MySQL.MYSQLHOST}}`,
   `${{MySQL.MYSQLPORT}}`, `${{MySQL.MYSQLDATABASE}}`) to build `DATABASE_URL`.

5. **Volume (required for uploads to survive redeploys):**
   Service → **Settings → Volumes → New Volume**, mount path **`/app/uploads`**.
   Without this, uploaded photos are lost on every redeploy.

6. **Apply the schema.** Choose ONE:
   - **Pre-deploy command** (recommended): Service → Settings → Deploy →
     **Pre-Deploy Command** = `php /app/database/migrate.php`.
     `migrate.php` is idempotent (`CREATE TABLE IF NOT EXISTS`) and safe on every deploy.
   - **One-off**: Service → **⋮ → Run a command** →
     `php /app/database/migrate.php` (add `--seed` to load demo data once).

7. Deploy. Verify: `curl https://<api-service>.up.railway.app/health` →
   `{"status":"ok","database":"up",...}`.

### Railway config files (already in the repo)
- `backend/Dockerfile.php` — PHP 8.2 CLI image; installs `pdo_mysql`, `mbstring`; runs
  `php -S 0.0.0.0:$PORT -t public router.php`.
- `backend/railway.json` — Dockerfile builder + `/health` health check.
- `backend/database/migrate.php` — schema migrator (verified locally, §7).

---

## 3. Service 2 — Web (`roadwatch-web`)

1. Railway → **New Service → Deploy from GitHub repo** (same repo).
2. Service → **Settings → Source → Root Directory** = `web`.
3. Railway reads `web/railway.json` → builds `web/Dockerfile` (nginx static image).
4. **Point the web app at the API.** Because the two services have different
   origins, edit **`web/config.js`** and set:

   ```js
   window.RW_API_BASE_URL = 'https://<api-service>.up.railway.app';
   ```

   (Leave it `''` only if the API and web are served from the same origin.)
5. Deploy. Verify the site loads and the browser dev-tools Network tab shows API
   calls going to the API service (not the web origin).

### Railway config files (already in the repo)
- `web/Dockerfile` — `nginx:alpine`, copies only the runtime static assets.
- `web/.dockerignore` — whitelists `index.html`, `config.js`, `js/`, `css/`,
  `brand/`, `vendor/`; excludes `src/` (React), `node_modules/`, `dist/`.
- `web/nginx.conf.template` — SPA fallback (`try_files … /index.html`) listening on `${PORT}`.
- `web/railway.json` — Dockerfile builder.

---

## 4. Database choice notes

- **Fresh install:** `backend/database/schema.sql` creates 9 tables
  (`User`, `RefreshToken`, `Report`, `ReportPhoto`, `Assignment`,
  `StatusHistory`, `AuditLog`, `ImageAnalysisResult`, `ReferenceCounter`) and is
  idempotent.
- **TiDB compatibility:** tables use `InnoDB`, `ENUM`, `JSON`, `DATETIME(3)`,
  `DOUBLE`, `TEXT`, `TINYINT(1)` and standard indexes/FKs — all supported by TiDB.
  TiDB does not support some MySQL features (e.g. stored procedures, `FULLTEXT`),
  none of which this schema uses.
- **Existing data:** the table/column names keep their Prisma PascalCase form, so
  a database created by the old Prisma migrations remains usable with no data
  migration. Verified read-only against MySQL 8.0.45 (§7).

---

## 5. Do NOT deploy these (legacy)

- `render.yaml` / `docs/DEPLOY_RENDER.md` — Render, not Railway.
- `backend/Dockerfile`, `backend/docker-entrypoint.sh`, `backend/package.json`,
  `backend/prisma/**` — the legacy **Node + Prisma** API. They are not used by
  the PHP service (which has its own `Dockerfile.php`).
- `web/src/**`, `web/vite.config.ts`, `web/package.json`, `web/dist/**` — the
  legacy **React** web app.

---

## 6. Post-deploy verification

```
curl https://<api>.up.railway.app/health          # database: "up"
curl https://<api>.up.railway.app/api/map/reports # public approved reports
```
- Log in on the web app as the seeded admin (only if you seeded) or register a citizen.
- Submit a report with a photo; confirm the photo URL loads.
- Redeploy the API; confirm uploaded photos still load (proves the volume persists).

---

## 7. What was actually verified locally (evidence)

| Step | Result | Evidence |
|---|---|---|
| `php -S 127.0.0.1:4000 -t public router.php` serves the API | **PASS** | `GET /health` → `database: up` |
| Full API integration suite (98 checks) | **PASS** | `node backend/tests/api_integration.mjs` → `98 passed, 0 failed` |
| Clean-install schema on an empty database | **PASS** | `php database/migrate.php` on a fresh DB → 9 tables |
| Migration idempotency (run twice) | **PASS** | second run exits 0, 9 tables |
| Seed + repeat-seed (no duplication) | **PASS** | 5 users / 6 reports both runs |
| PDO against MySQL **8.0.45** (Prisma-created data) | **PASS** | `database: up`; `/api/map/reports` → 4 items |
| CORS preflight (allowed vs disallowed origin) | **PASS** | 204 + ACAO for allowed, no ACAO for disallowed |
| Missing/bad DB config fails safely | **PASS** | `/health` → `database: down`; API → generic `DB_ERROR`, no secret leak |
| **Container image build** (`docker build`) | **NOT TESTED / BLOCKED** | Docker is not installed in this environment |
| **Actual Railway deployment** | **NOT TESTED** | requires a Railway account + GitHub push (manual) |

Everything from §2/§3 that could be expressed as a command that runs *without*
Docker was executed and passed. The two remaining unknowns are the Docker image
build and the live Railway run.
