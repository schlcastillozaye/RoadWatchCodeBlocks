# RoadWatch — Railway Deployment Checklist

> Every status below is evidence-based. This document describes how to deploy the
> **target architecture** — a PHP 8.2 API + a MySQL/MariaDB database + a static
> vanilla-JS web app — on **Railway**.
>
> The current Railway deployment was inspected on 2026-10-18. Its live state and
> the limits of the verification are recorded in §9. Historical local test results
> are listed in §8; they are not a substitute for the current authenticated
> production workflow checks.
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

The current Railway project already has these services from this repository:

1. **`backend`** — root directory `backend/`
2. **`frontend`** — root directory `web/`
3. **`MySQL`** — Railway database service

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

## 2. API (`backend`)

1. Use the existing Railway service; do not create a duplicate.
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
   | `CORS_ORIGINS` | `https://frontend-production-bb0d.up.railway.app` | the verified web app origin, no trailing slash |
   | `PUBLIC_BASE_URL` | `https://roadwatchcodeblocks-production.up.railway.app` | the public origin used to build absolute photo URLs (needed by mobile). **Never** leave it on `http://localhost:4000` |
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
   The current backend has no persistent mount at `/app/uploads`; its local
   directory is on the container's ephemeral filesystem. Add a Railway volume
   mounted at **`/app/uploads`** only after confirming and safely migrating any
   existing files. Without it, uploaded photos can be lost on redeploy or
   container replacement. See §9 for the observed current state.

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

## 3. Web (`frontend`)

1. Use the existing Railway service; do not create a duplicate.
2. Service → **Settings → Source → Root Directory** = `web`.
3. Railway reads `web/railway.json` → builds `web/Dockerfile` (nginx static image).
4. **Point the web app at the API.** The two services have different origins, so the
   web app must be told the API's public origin. Set a service **variable**:

   | Variable | Value |
   |---|---|
   | `RW_API_BASE_URL` | `https://roadwatchcodeblocks-production.up.railway.app` |

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
  > ⚠️ If it is left unset or on a loopback value such as `http://localhost:4000`,
  > every photo URL the API hands out points at the *visitor's own machine*, so
  > images fail to load on both the web platform and the mobile app. The API does
  > fall back to the request's own origin in that case (see `docs/API.md`), but the
  > variable should still be set correctly.

---

## 5. Database notes

- **Fresh install:** `backend/database/schema.sql` creates **10 tables**
  (`User`, `RefreshToken`, `Report`, `ReportPhoto`, `Assignment`, `Notification`,
  `StatusHistory`, `AuditLog`, `ImageAnalysisResult`, `ReferenceCounter`); `migrate.php` applies it
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
- Assignment notifications are durable in-app records created in the same
  transaction as an admin assignment. No push provider or additional secret is
  required; push delivery would require a separately configured provider and
  device-token lifecycle.
- **Never seed or reset a production database.** Seed scripts require passwords from
  secure `RW_SEED_*_PASSWORD` environment variables and are for disposable development
  databases only; do not use them to provision production accounts.

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
curl https://roadwatchcodeblocks-production.up.railway.app/health
curl https://roadwatchcodeblocks-production.up.railway.app/api/map/reports
```

- Log in on the web app (register a citizen, or seed demo data once).
- Submit a report with a photo; confirm the photo URL loads **and that its host is
  the API's public origin** (not `localhost`).
- Submit a report with category **Other** and confirm the description field is
  required and the text shows in the report details, admin list and mobile app.
- **Redeploy the API; confirm uploaded photos still load** (proves the volume persists).

Use dedicated test accounts/reports; do **not** run destructive tests against real data.

---

## 8. Previous local verification (historical evidence)

The results below were recorded during earlier implementation work. They were
not all rerun during the current deployment-state audit; current live checks and
their limitations are in §9.

| Step | Result | Evidence |
|---|---|---|
| `php -S 127.0.0.1:4000 -t public router.php` serves the API | **PASS** | `GET /health` → `database: up` |
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
| Photo-URL origin (`php backend/tests/config_test.php`) | **PASS** | **10/10** — a real `PUBLIC_BASE_URL` wins (proxy headers can't override it); unset/loopback falls back to the request origin; malformed `Host` rejected |
| **Earlier live Railway workflow** (citizen → admin → public map) | **HISTORICAL; NOT REPEATED** | A previous record reports 32 checks, including submission, approval, public map/photo checks, and cleanup. Current credentials and the full workflow were not verified in this audit. |
| **Container image build** (`docker build`) | **NOT RUN LOCALLY** | Docker is not installed here, but Railway built the same `Dockerfile.php` and booted it successfully (health + migration above) |

These historical results do not establish the current production workflow.

---

## 9. Current production verification (2026-10-18)

| Check | Status | Evidence |
|---|---|---|
| Existing services and URLs | **PASS** | Railway project `roadwatch`, environment `production`: `frontend` at `https://frontend-production-bb0d.up.railway.app/`, `backend` at `https://roadwatchcodeblocks-production.up.railway.app/`, plus `MySQL`. No duplicate service was created. |
| Intended source commit | **PASS** | Local `main`, `origin/main`, and the backend container's `RAILWAY_GIT_COMMIT_SHA` all report `91fd2f5035d06590ff2468fa822c8b416f008510`. |
| Frontend deployment | **PASS** | HTML, JS, CSS, runtime config, and SPA fallback paths returned HTTP 200. Deployed `web/js/app.js` SHA-256 matched local (`e6a3210bbcfc07a514dc49dd742b28f99ff87d070857f3fe72e1c010fcd5c4f5`); runtime config points at the production API. |
| Backend health | **PASS** | `/health` reported `status: ok`, `database: up`, and `storage: local`. |
| CORS and public API connectivity | **PASS** | Frontend-origin preflight returned 204 with the exact allowed origin; a disallowed origin received no `Access-Control-Allow-Origin`; browser fetch from the frontend to the public map API returned 200. |
| Protected API authentication | **PARTIAL** | Protected routes returned 401 without a valid staff token and included the frontend CORS header. This verifies CORS on those responses, not authenticated workflow behavior. |
| Production accounts | **PARTIAL** | Read-only DB check confirmed two active citizen accounts, one active admin, and two active maintenance officers. No usable credentials were available in the environment; passwords/hashes were not queried. |
| Notification schema | **PASS** | Read-only `SHOW CREATE TABLE Notification` confirmed the table, unique `assignmentId`, indexes, and foreign keys to Assignment, Report, and User. The migrator has no separate migration-history ledger, so no versioned migration record was available to inspect. |
| Notification read path | **PARTIAL** | Deployed `NotificationService` returned an empty list and unread count 0 for an active officer; the DB currently has 0 notifications and 0 assignments. Creation/read-state mutation and authenticated HTTP access were not tested. |
| Production data and uploads | **RISK / ACTION REQUIRED** | Read-only aggregate counts: 1 Report, 1 ReportPhoto row, 0 Assignment rows, 0 Notification rows. `/app/uploads` contained 0 files and is on the container's `overlay` filesystem with no dedicated mount. The existing photo record may refer to a missing local file; do not assume it is recoverable. Do not restart/redeploy the backend before planning persistent storage and assessing that record. |
| Full approval → assignment → notification → repair flow | **BLOCKED** | No valid citizen/admin/officer credentials or designated test-data procedure were available. No production records were created or modified. |
| Flutter static analysis and tests | **PASS** | `flutter analyze` reported no issues; `flutter test` passed 48 tests with 1 credential-gated live API test skipped. |
| Web/PHP local checks | **PARTIAL** | `node --check web/js/app.js` passed. The PHP config test could not run because PHP is not installed locally. The authenticated browser/API E2E suite was not run: it requires citizen/admin passwords and creates test users/reports, with no authorized production test procedure available. |
| API integration and disposable migration tests | **BLOCKED** | The integration suite requires a disposable test database and PHP runtime; neither was available. Production schema inspection was read-only and did not reapply migrations. |
| APK release signing | **NOT RELEASE-READY** | The existing `mobile/build/app/outputs/flutter-apk/app-release.apk` verifies with signer `CN=Android Debug` (certificate SHA-256 `10c72c0a750bec19c7693cd702e946f21ab961264107af0ec1c0828b59eb9918`; APK SHA-256 `6bb5d7ef7426ed7fe8f6cae72e0d620705641bd38d48260259f36d3145b6b776`). The updated Gradle configuration requires secure external signing values and refuses unsigned release builds before build tasks run. The debug build passed; no local keystore was found under `mobile/android` and no local signing environment-variable names were present. CI signing-secret availability was not inspected. |

```powershell
# Before adding a volume, inspect the existing report photo record and plan
# recovery/remediation; do not expose its private metadata in logs.
# Then add a persistent Railway volume at /app/uploads and verify upload,
# retrieval, and survival across a controlled redeploy using dedicated test data.
```

### Remaining manual tasks

1. **Photo persistence:** Determine whether the existing `ReportPhoto` object can
   be recovered. The current project showed 29 days / $4.71 remaining; a new
   volume may incur charges and restart the backend. After the owner confirms the
   storage budget and assesses that photo record, add a persistent Railway volume
   mounted at `/app/uploads`. Verify a dedicated test upload remains available
   after redeploy.
2. **Authenticated workflow:** Securely supply or provision dedicated test
   accounts through an authorized admin process, then run the full citizen →
   admin approval → officer assignment/notification → repair completion smoke
   test. Do not use real citizen reports or production seeding.
3. **APK release:** Create a private upload keystore (for example with
   `keytool -genkeypair -v -keystore "$env:USERPROFILE\roadwatch-upload-key.jks" -alias roadwatch-upload -keyalg RSA -keysize 2048 -validity 10000`).
   Supply its absolute path and passwords as `ROADWATCH_UPLOAD_STORE_FILE`,
   `ROADWATCH_UPLOAD_STORE_PASSWORD`, `ROADWATCH_UPLOAD_KEY_ALIAS`, and
   `ROADWATCH_UPLOAD_KEY_PASSWORD` through a secure local/CI secret store, then
   build with `flutter build apk --release --dart-define=API_BASE_URL=https://roadwatchcodeblocks-production.up.railway.app`.
   Verify the resulting APK with `apksigner verify --print-certs` and record its
   SHA-256 checksum before distribution. Never commit the keystore or secrets.

No Railway variables, volumes, or services were changed during this audit. No
production records were mutated. Do not push these branch changes while the
backend has an unmounted upload directory; an automatic redeploy could restart
the backend before persistent storage is addressed.
