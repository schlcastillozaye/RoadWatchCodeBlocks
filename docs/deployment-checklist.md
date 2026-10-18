# RoadWatch — Railway Deployment Checklist

> Every status below is evidence-based. This document describes how to deploy the
> **target architecture** — a PHP 8.2 API + a MySQL/MariaDB database + a static
> vanilla-JS web app — on **Railway**.
>
> Nothing here is claimed to be deployed: the image build and the live Railway run
> have **not** been performed (Docker is not available in the verification
> environment). The local verification that *was* performed is listed in §8 and in
> [`independent-verification-report.md`](independent-verification-report.md).
>
> TiDB Cloud is **no longer part of the architecture**; use a MySQL 8 / MariaDB
> server (Railway's MySQL plugin is the simplest).

---

## 0. Target architecture

| Component | Technology | Deploy target |
|---|---|---|
| Mobile app | Flutter / Dart | store / APK (not Railway) |
| Web app | HTML + CSS + vanilla JS | Railway service (nginx static image) |
| API | PHP 8.2 (PDO, no Composer deps) | Railway service (PHP Docker image) |
| Database | **MySQL 8 / MariaDB** | Railway MySQL plugin (or any managed MySQL) |
| Maps | Leaflet + OpenStreetMap (web), flutter_map (mobile) | none (free, keyless) |
| Storage | Local disk on a Railway volume | Railway volume mounted at `/app/uploads` |

Two Railway services from this one repository:

1. **`roadwatch-api`** — root directory `backend/`
2. **`roadwatch-web`** — root directory `web/`

---

## 1. Prerequisites

- A Railway account and a project (`railway.app`).
- **This repository pushed to GitHub.** Railway deploys from a Git remote. The
  verified migration commits must be on the branch Railway tracks — see §9.
- A MySQL-compatible database:
  - **Option A (simplest, recommended):** the Railway **MySQL** plugin in the same
    project. Railway injects its connection values as project variables.
  - **Option B:** any external managed MySQL 8 / MariaDB (TLS as your provider requires).

---

## 2. Service 1 — API (`roadwatch-api`)

1. Railway → **New Service → Deploy from GitHub repo**.
2. Service → **Settings → Source → Root Directory** = `backend`.
3. Railway reads `backend/railway.json` → Dockerfile builder (`backend/Dockerfile.php`)
   + `/health` health check.
4. **Variables** (Service → Variables):

   | Variable | Value | Notes |
   |---|---|---|
   | `NODE_ENV` | `production` | generic error messages + enables the JWT secret guard |
   | `PORT` | *(injected by Railway)* | do **not** set manually |
   | `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:PORT/DATABASE` | URL-encode special chars (`@`→`%40`) |
   | `JWT_ACCESS_SECRET` | 32+ random chars | e.g. `openssl rand -base64 48` |
   | `JWT_REFRESH_SECRET` | 32+ random chars | must differ from the access secret |
   | `JWT_ACCESS_TTL` | `15m` | |
   | `JWT_REFRESH_TTL` | `30d` | |
   | `CORS_ORIGINS` | `https://<web-service>.up.railway.app` | the web app origin, no trailing slash |
   | `PUBLIC_BASE_URL` | `https://<api-service>.up.railway.app` | builds absolute photo URLs (needed by mobile) |
   | `STORAGE_DRIVER` | `local` | only `local` is implemented in PHP |
   | `STORAGE_LOCAL_DIR` | `/app/uploads` | must match the volume mount |
   | `MAX_UPLOAD_BYTES` | `8388608` | 8 MB — enforced by the app; the image's `php.ini` keeps PHP's own limits above it so this is the error the client sees |
   | `SEED_ON_START` | `false` | set `true` once only if you want demo data |

   > 🔐 **The API refuses to boot in production if `JWT_ACCESS_SECRET` /
   > `JWT_REFRESH_SECRET` are missing, shorter than 32 characters, or left at the
   > `change-me…` placeholder** (see `backend/src/Support/Config.php`). This is
   > intentional: tokens signed with a known key can be forged. A failed health
   > check caused by this is the guard working, not a bug.

   **Railway MySQL plugin:** build `DATABASE_URL` from the plugin's reference
   variables, e.g.
   `mysql://${{MySQL.MYSQLUSER}}:${{MySQL.MYSQLPASSWORD}}@${{MySQL.MYSQLHOST}}:${{MySQL.MYSQLPORT}}/${{MySQL.MYSQLDATABASE}}`.
   For an **external** MySQL that requires TLS, append `?ssl-mode=REQUIRED`
   (or the option your provider documents).

5. **Volume (required so uploads survive redeploys):**
   Service → **Settings → Volumes → New Volume**, mount path **`/app/uploads`**.
   Without it, uploaded photos are lost on every redeploy.

6. **Schema.** Nothing to do — the image migrates on boot.

   `backend/Dockerfile.php` runs `php database/migrate.php` before the server
   starts (`RUN_MIGRATIONS`, default `true`; set `RUN_MIGRATIONS=false` to skip).
   The migrator is safe to run repeatedly and only ever *adds*:

   - `CREATE TABLE IF NOT EXISTS` for the base schema (`schema.sql`).
   - Idempotent, backward-compatible **patches** that evolve an already-deployed
     database (new enum values such as `ROAD_OBSTRUCTION`, new nullable columns
     such as `Report.categoryOther`). It never drops a column or enumerates away
     a value that existing rows use.

   If a migration fails, the boot logs a warning and the service still starts;
   check the deploy log and run `php /app/database/migrate.php` manually.

   - Opt out with `RUN_MIGRATIONS=false` only if you manage the schema yourself.
   - **Never** run `--seed` (or `RESET_DATABASE`) against a database that holds real data.

7. Deploy. Verify: `curl https://<api-service>.up.railway.app/health` →
   `{"status":"ok","database":"up",…}`.

### Railway config files (already in the repo)

- `backend/Dockerfile.php` — `php:8.2-cli`; installs `pdo_mysql`, `mbstring`
  **and `curl`** (`curl` is required for OSM Nominatim / Google geocoding and for
  the optional image-analysis API — `GET /health` reports `geocoding:
  "unavailable"` if it is ever missing); a `php.ini` setting that keeps PHP's own
  upload limits above `MAX_UPLOAD_BYTES`; runs `php database/migrate.php` on boot
  (`RUN_MIGRATIONS`) and then `php -S 0.0.0.0:$PORT -t public router.php`.
- `backend/.dockerignore` — excludes `.env`, `node_modules/`, `dist/`, `prisma/`,
  `tests/` and `uploads/` so no local secret or data is baked into the image.
- `backend/railway.json` — Dockerfile builder + `/health` health check.
- `backend/database/migrate.php` — schema migrator (verified locally, §8).

---

## 3. Service 2 — Web (`roadwatch-web`)

1. Railway → **New Service → Deploy from GitHub repo** (same repo).
2. Service → **Settings → Source → Root Directory** = `web`.
3. Railway reads `web/railway.json` → builds `web/Dockerfile` (nginx static image).
4. **Point the web app at the API.** The two services have different origins, so the
   web app must be told the API's public origin. Set a service **variable**:

   | Variable | Value |
   |---|---|
   | `RW_API_BASE_URL` | `https://<api-service>.up.railway.app` |

   At container start, `web/docker-entrypoint.d/40-roadwatch-config.sh` writes this
   value into `rw-runtime-config.js`, so **no rebuild is needed** when the API URL
   changes. If you leave it unset, the app falls back to `config.js`'s same-origin
   auto-detection (only correct if the API and site share an origin).

   (Alternative, build-time: set `window.RW_API_BASE_URL` in `web/config.js` and
   commit it. The runtime variable above is preferred.)

5. Deploy. Verify the site loads and the browser dev-tools Network tab shows API
   calls going to the **API** origin, not the web origin.

### Railway config files (already in the repo)

- `web/Dockerfile` — `nginx:alpine`; copies only the runtime static assets, then
  `chmod +x`es the entrypoint script.
- `web/.dockerignore` — whitelists `index.html`, `config.js`,
  `rw-runtime-config.js`, `js/`, `css/`, `brand/`, `vendor/`,
  `nginx.conf.template`, `docker-entrypoint.d/`; excludes the legacy React tree.
- `web/nginx.conf.template` — SPA fallback (`try_files … /index.html`) on `${PORT}`.
- `web/railway.json` — Dockerfile builder.

---

## 4. Mobile app (Flutter) — points at the public API

The mobile app does **not** run on Railway. Its API origin is compiled in at build
time with `--dart-define` (it is not read from a `.env` file):

```powershell
cd mobile
flutter build apk --release     --dart-define=API_BASE_URL=https://<api-service>.up.railway.app
flutter build appbundle --release --dart-define=API_BASE_URL=https://<api-service>.up.railway.app
flutter build web --release     --dart-define=API_BASE_URL=https://<api-service>.up.railway.app
```

- A **release** build that was not given an `API_BASE_URL` will detect the
  `localhost` default and **fail fast** rather than silently shipping an app that
  can only reach a developer machine (see `mobile/lib/core/app_config.dart`).
- On the **Android emulator** against a local backend, `localhost` is rewritten to
  `10.0.2.2` automatically — that path is for development only.
- Set the API's `PUBLIC_BASE_URL` to its public origin so photo URLs returned to the
  mobile app are absolute.

---

## 5. Database notes

- **Fresh install:** `backend/database/schema.sql` creates **9 tables**
  (`User`, `RefreshToken`, `Report`, `ReportPhoto`, `Assignment`, `StatusHistory`,
  `AuditLog`, `ImageAnalysisResult`, `ReferenceCounter`); `migrate.php` applies it
  idempotently.
- **Already-deployed database:** `schema.sql` is all `CREATE TABLE IF NOT EXISTS`,
  so it can never evolve an existing table. `migrate.php` therefore also applies
  guarded **patches** (`rw_apply_patches`): new enum values and new nullable
  columns are added only when missing, and existing rows are left untouched.
  Verified on a database holding live reports — the row count was unchanged and
  the new values/columns appeared.
- **MySQL 8 / MariaDB compatible:** tables use `InnoDB`, `ENUM`, `JSON`,
  `DATETIME(3)`, `DOUBLE`, `TEXT`, `TINYINT(1)` and standard indexes/FKs.
  No stored procedures or `FULLTEXT` are used.
- **Existing data:** table/column names keep their Prisma PascalCase form, so a
  database created by the old Prisma migrations stays usable — no data migration.
  Verified read-only against MySQL 8.0.45 (§8).
- **Never seed or reset a production database.** `db/setup.sql` and `seed.php`
  create *demo* accounts (`Admin@12345`, `Officer@12345`, `Citizen@12345`); do not
  use them for anything real.

---

## 6. Do NOT deploy these (legacy)

- `render.yaml` / `docs/DEPLOY_RENDER.md` — the old **Render** plan for the legacy
  Node stack; not the target.
- `backend/Dockerfile`, `backend/docker-entrypoint.sh`, `backend/package.json`,
  `backend/prisma/**` — legacy **Node + Prisma** API. The PHP service uses its own
  `Dockerfile.php`.
- `web/src/**`, `web/vite.config.ts`, `web/package.json`, `web/dist/**` — legacy
  **React (Vite)** web app.

They are kept in the tree for reference; deleting them is a product decision
(see `independent-verification-report.md`).

---

## 7. Post-deploy verification

```
curl https://<api>.up.railway.app/health           # database: "up", geocoding not "unavailable"
curl https://<api>.up.railway.app/api/map/reports  # public approved reports
```

- Log in on the web app (register a citizen, or seed demo data once).
- Submit a report with a photo; confirm the photo URL loads.
- Submit a report with category **Other** and confirm the description field is
  required and the text shows in the report details, admin list and mobile app.
- **Redeploy the API; confirm uploaded photos still load** (proves the volume persists).

Use dedicated test accounts/reports; do **not** run destructive tests against real data.

---

## 8. What was actually verified locally (evidence)

| Step | Result | Evidence |
|---|---|---|
| `php -S 127.0.0.1:4000 -t public router.php` serves the API | **PASS** | `GET /health` → `database: up` |
| Full API integration suite (**103 checks**) | **PASS** | `node backend/tests/api_integration.mjs` → `103 passed, 0 failed` |
| Clean-install schema on an empty database | **PASS** | `php database/migrate.php` on a fresh DB → 9 tables |
| Migration idempotency (run twice) | **PASS** | second run exits 0, 9 tables |
| Additive patches on a live database | **PASS** | `ROAD_OBSTRUCTION` + `Report.categoryOther` added; all 8 existing reports preserved |
| Seed + repeat-seed (no duplication) | **PASS** | 5 users / 6 reports both runs |
| PDO against MySQL **8.0.45** (Prisma-created data) | **PASS** | `database: up`; `/api/map/reports` → 4 items |
| CORS preflight (allowed vs disallowed origin) | **PASS** | 204 + ACAO for allowed, no ACAO for disallowed |
| Missing/bad DB config fails safely | **PASS** | `/health` → `database: down`; API → generic `DB_ERROR`, no secret leak |
| Full API integration suite (**137 checks**, PHP 8.2 + cURL + fileinfo, `MAX_UPLOAD_BYTES=1 MB`) | **PASS** | `137 passed, 0 failed` — includes 7 issue categories, `categoryOther` rules, photo authorisation/integrity and the `413` size limit |
| Full API integration suite (**136 checks**, PHP 8.5 without cURL/fileinfo) | **PASS** | `136 passed, 0 failed` — geocoding degrades to `available: false` with a clear reason; MIME check falls back to the declared type |
| Private photo authorisation | **PASS** | pending photo: `401` anonymous, `401` other citizen, `200` owner/officer/admin; approved photo byte-identical + publicly cacheable |
| Web app end-to-end (real browser) | **PASS** | `web/tests/e2e.mjs` → **11/11 scenarios** (includes the category picker + "Other" free text) |
| Flutter `analyze` + `test` | **PASS** | `flutter analyze` clean; `flutter test` **33/33** |
| **Container image build** (`docker build`) | **NOT TESTED / BLOCKED** | Docker is not installed in this environment |
| **Actual Railway deployment** | **NOT TESTED** | requires a Railway account + the GitHub push (manual) |

Everything that could be expressed as a command running *without* Docker was
executed and passed. The remaining unknowns are the Docker image build and the live
Railway run.

---

## 9. Push the repository first

Railway builds from GitHub, so the verified commits must be on the tracked branch:

```powershell
git status            # working tree should be clean
git log --oneline -5  # the migration + fix commits
git push origin main
```

Do not force-push and do not rewrite shared history.
