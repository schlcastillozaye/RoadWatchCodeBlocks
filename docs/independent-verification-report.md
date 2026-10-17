# RoadWatch — Independent Verification Report

**Date:** 2026-10-17
**Verifier:** independent pass (not the migration author)
**Scope:** whether the migration to *PHP backend + vanilla-JS web + Flutter + MySQL + Leaflet/OSM + Railway* actually works, what the previous report got right or wrong, and what was fixed.

---

## 1. Executive summary

| Component | Verdict | One line |
|---|---|---|
| **PHP backend** | ✅ **PASS** | 35 routes, 8 controllers; **103/103** runtime API checks pass. Genuinely complete. |
| **Database & migrations** | ✅ **PASS** | Clean install on an empty DB, idempotent, seed repeatable, works on MySQL 8.0.45 **and** MariaDB 10.4. |
| **Flutter mobile app** | ✅ **PASS** *(caveats)* | `flutter analyze` clean, `flutter test` 12/12, web + APK builds succeed, API contract matches. |
| **Web app** | ❌ as delivered → ✅ **PASS (repaired)** | Did **not** parse/mount. Repaired and **browser-verified 7/7** in real Microsoft Edge. |
| **Deployment (Railway)** | ❌ **FAIL** → 🟡 **CONFIG ADDED** | No Railway config existed; only a Render-schema `render.yaml`. Now added (image build not verified — no Docker). |
| **Git tracking** | ❌ **FAIL** | The entire PHP backend + vanilla web app (82 files) were **untracked** — uncommitted work would never deploy. |

**Bottom line:** the previous report's headline ("migration executed and verified … system is functional") was **not** true of the web app, and no deployment configuration existed. What *is* true — and now independently confirmed by execution, not inspection — is that the **PHP backend is complete and correct**, the **database layer is solid**, and the **Flutter app is healthy**. The web app and the deployment config were the real gaps; the web app has since been **repaired and browser-verified (7/7)**, and deployment config has been **added** (its Docker images were not built here — no Docker).

---

## 2. Method & environment

Verification was performed by **running the system**, not by reading files:

- **PHP 8.2.12** (XAMPP CLI) — note it has **no `gd`**, which is fine: the backend uses core `getimagesizefromstring()`.
- **PHP built-in server**: `php -S 127.0.0.1:4000 -t public router.php`.
- **Disposable database**: MariaDB 10.4.32 (XAMPP) on **port 3307**, database `roadwatch_test`, so the real app DB was never touched.
- **Existing MySQL 8.0.45** (`roadwatch` on 3306) used **read-only** to prove PDO/MySQL-8 compatibility.
- **Node 26** for the API integration harness; **Flutter** for mobile analysis/tests/builds; **Edge/Chrome** for browser testing.
- **Live external calls**: OpenStreetMap Nominatim geocoding reachable and returning real results.

> Credentials and secrets are **not** reproduced in this report.

---

## 3. Component results

### 3.1 PHP backend — ✅ PASS

- **35 routes / 8 controllers** confirmed (`backend/src/routes.php`).
- **103/103** checks in `backend/tests/api_integration.mjs` pass against the running server:
  - auth: register/login/refresh-rotation/logout/me, wrong password, bad token, duplicate email;
  - reports: multipart create with photo, validation (category, title, lat range, missing photo, non-image → 415), ownership/visibility, withdraw, reference-number format `RW-YYYY-NNNNNN`;
  - moderation (admin-only, double-moderate → 409, reject-requires-reason);
  - assignment (officer-only, non-officer target → 400) and the full **repair lifecycle** incl. "complete requires notes **and** an after photo", admin override, and audit of the override;
  - public map (approved-only), files (public iff approved, else 401), maintenance assignments/summary, users admin + self-service, password change/reset, suspend, statistics, analytics summary, audit logs, geocoding, unknown route.
- **Rate limiting** verified live: 31st auth request → **429 `RATE_LIMITED`** with a `Retry-After` header (limit 30 / 15 min per IP).
- **CORS** verified: allowed origin → `204` + `Access-Control-Allow-Origin`; disallowed origin → **no** ACAO header; allowed-origin GET → ACAO present.
- **Failure safety** verified: with an unreachable DB, `/health` returns `200` with `"database":"down"` (no crash) and the API returns a **generic** `DB_ERROR` in production mode — **no credential/stack leak**.
- Security spot-checks: bcrypt password hashing; single-use refresh-token rotation; role guards on every privileged route.

### 3.2 Database & migrations — ✅ PASS

- `backend/database/schema.sql` creates **9 tables** and **12 ENUM columns** (10 distinct value sets) with `CREATE TABLE IF NOT EXISTS`, so it is **idempotent**.
- Clean install on an empty database → 9 tables; re-running → still 9 tables, exit 0 (verified twice).
- `backend/seed.php` → 5 users, 6 reports, 7 photos, 14 history rows, 3 assignments; **re-running does not duplicate** (verified twice).
- **PDO against MySQL 8.0.45** with the *original Prisma-created data* works read-only (`/health` → `database: up`; `/api/map/reports` → 4 approved items). This confirms the schema stays compatible with the legacy database and requires no data migration.
- Added **`backend/database/migrate.php`** — there was previously **no way to apply the schema in production** (the old Node entrypoint used `prisma migrate deploy`). It is idempotent and safe as a Railway pre-deploy step.
- **Schema drift noted (not fixed):** the live MySQL `roadwatch` database contains an **extra lowercase `users` table** not present in `schema.sql`. It is not referenced by the PHP code; treat it as leftover. Harmless but worth dropping manually.

### 3.3 Web app — ❌ FAIL as delivered, 🟡 REPAIRED

As delivered, `web/index.html` loaded a **non-executable** app:

- `web/js/app.js` had a **fatal `SyntaxError`** (`const create = (tag, attrs, children) {` — a missing `=>`), so `node --check` failed and **no code ran**.
- `render()` wrote the UI into a **detached** `createElement('root')` element — nothing was ever attached to the page.
- The **committed** `index.html` still loaded the **React** bundle (`/src/main.tsx`), and `web/src/` (39 React files) was **not archived** — `web/archived-react` was a 1.7 KB text file, not a directory.
- Additional runtime bugs: no `/report/:id` route; inline `onclick` handlers calling a function that is not in scope; no home-nav wiring; `initAdminDashboard` referenced an undeclared `recent`; the reports page wrote to a nonexistent `#recent-reports`; Leaflet was injected via `innerHTML` (inert, so `L` was undefined); report submission sent **JSON** instead of the required **multipart**; stale endpoints (`/reports/assigned`, `/audit/logs`, `/files/{key}`); and an incomplete stylesheet (`css/styles.css`) while the complete `web/styles.css` went unused.
- Meanwhile the *correct* API client `web/js/api.js` (and `ui.js`, `router.js`, `store.js`, `dom.js`, `format.js`, `maps.js`) matched the backend 1:1 but was **orphaned** — nothing imported it.

**Repair & verification (✅):** `web/js/app.js`, `web/index.html` and `web/css/styles.css` were rewritten/fixed to parse, mount into `#root`, load `config.js`, use the correct endpoints, submit multipart reports with UPPERCASE category values, use the API-provided photo `url`, render Leaflet on locally-bundled OSM tiles, and guard admin/officer routes. A real-browser test was added at **`web/tests/e2e.mjs`** (Playwright-core driving **Microsoft Edge** against the live PHP API); it passes **7/7 scenarios** and was **independently re-run** by the verifier:

| Scenario | Result |
|---|---|
| a. Load `/` — no console/page errors | ✅ PASS |
| b. Citizen login lands authenticated with name shown | ✅ PASS |
| c. Submit report (multipart + photo) → appears under `/reports` | ✅ PASS |
| d. Admin `/admin` stats + `/audit` rows + `/reports` list | ✅ PASS |
| e. `/map` renders Leaflet container + ≥1 marker, no console errors | ✅ PASS (12 markers) |
| f. Logged-out `/reports` redirects to `/login` | ✅ PASS |
| g. No horizontal overflow at 375 / 768 / 1440 widths | ✅ PASS (12/12 checks) |

Three further web bugs were found and fixed during verification: an E2E login race (waited on the login `h1` instead of the authenticated home); **private report photos failing with `ERR_BLOCKED_BY_ORB`** because `/reports/mine` photos need a Bearer token (fixed with a token-fetch → `blob:` loader); and a favicon 404 on nested routes (relative `href` → root-absolute). Remaining web gaps are minor and listed in §6.

### 3.4 Flutter mobile app — ✅ PASS (with caveats)

- `flutter pub get` ✓, **`flutter analyze` → "No issues found!"**, **`flutter test` → 12/12 pass**, `flutter build web --release` ✓ and `flutter build apk --debug` ✓.
- Every API method in `mobile/lib/services/roadwatch_api.dart` maps to a real backend route (see `docs/route-verification.md`), and `mobile/lib/core/api_client.dart` correctly implements bearer auth, **single refresh-and-retry on 401**, structured error parsing (matching the backend envelope), multipart uploads with progress, and timeouts.
- **Caveats:**
  1. Test coverage was **widget/enum-only**; I added `mobile/test/api_client_test.dart` (8 offline tests: URL resolution, bearer header, error-envelope parsing, single refresh-retry, no-retry-on-failed-refresh, network-error mapping). **Provider/state and end-to-end network tests remain absent.**
  2. **Image URLs depend on `PUBLIC_BASE_URL`.** Because the dev server sets it to `http://127.0.0.1:4000`, the API returns **absolute localhost** photo URLs, which fail on an Android emulator/device. Fix: leave `PUBLIC_BASE_URL` **empty** so the API returns **relative** `/api/files/by-key/…` URLs and the client resolves them against its own base (`AppConfig` already maps `localhost → 10.0.2.2`). *(Documented; a config change, not a code bug.)*
  3. Demo credentials are hard-coded in `login_screen.dart` but only shown in `kDebugMode` — low risk.
  4. The public-map detail 403 (below) affected the mobile app most of all, since its client sends the bearer token by default.

### 3.5 Deployment — ❌ FAIL as delivered, 🟡 CONFIG ADDED

- **No Railway configuration existed anywhere** (`railway.json` / `railway.toml` / `Procfile` / `nixpacks.toml`), and none ever existed in git history.
- The only deployment file, `render.yaml`, is **Render's schema** (`services:`, `sync:`, `generateValue:`, `staticPublishPath:`). The working tree had been edited into a **"franken-file"** that relabels it a "Railway Blueprint", references a **nonexistent** `docs/DEPLOY_RAILWAY.md`, and sets `runtime: node` + `staticPublishPath: ./web` — which would break a Render deploy and does nothing on Railway. **Restored to the known-good committed Render blueprint.**
- `backend/Dockerfile` + `docker-entrypoint.sh` + `package.json` still build the **legacy Node + Prisma** service; they do not build PHP.
- **Added for Railway:** `backend/Dockerfile.php` (PHP 8.2, `pdo_mysql` + `mbstring`, runs the *verified* `php -S … router.php` pattern), `backend/railway.json`, `web/Dockerfile` + `web/nginx.conf.template` + `web/.dockerignore` + `web/railway.json`, and `docs/deployment-checklist.md`.
- **Limitation:** **Docker is not installed here**, so the images were **not built**; the actual `php -S … router.php` command they run *was* verified locally. The live Railway deployment remains a **manual** step.

---

## 4. Prior agent's claims vs. verified reality

| Claim (from `docs/`) | Verified reality |
|---|---|
| "Web … 95% complete … `app.js` … functional" | **False.** `app.js` did not parse; the app never mounted; the committed `index.html` still loaded React. |
| "React/TS archived" | **False.** `web/src/` (39 React files) was present; `web/archived-react` was a text file. |
| "8 controllers, 35 routes" | **True.** Matches `routes.php`. |
| "7 tables / 6 enums", "7 tables / 10 enums", "ten tables" | **Inconsistent & partly wrong.** Actual: **9 tables, 12 ENUM columns**. |
| "Migration complete / functional and integrated" | Backend **yes**; web **no**; deployment config **absent**. |
| (implicit) "ready to deploy" | **No.** PHP backend and web app were **untracked** (82 files) and there was **no Railway config**. |

Correction banners were added to the top of `docs/FINAL_STATUS.md`, `docs/MIGRATION_COMPLETION_SUMMARY.md`, `docs/MIGRATION_EXECUTION_LOG.md` and `docs/migration-audit.md`; this report is the authoritative status.

---

## 5. Issues found **and fixed**

| # | Issue | Fix | Evidence |
|---|---|---|---|
| 1 | **Public-map detail returned 403** to any **signed-in citizen** opening another user's **approved** report (affected web **and** mobile; mobile always sends the token). | Added `ReportService::getForViewer()`; approved reports fall back to the public view for authenticated viewers; applied in `MapController::report`, `ReportsController::show`, and `ReportService::getHistory`. | 4 new regression checks pass; 103/103 total. |
| 2 | **No production migration runner** for the PHP schema. | Added idempotent `backend/database/migrate.php` (optional `--seed`). | Clean DB → 9 tables; second run exit 0; `--seed` works. |
| 3 | **Deployment "franken-file"** mislabeling Render config as Railway. | Restored `render.yaml` to the valid committed Render blueprint; real Railway config lives in per-service `railway.json`. | `git status` clean for `render.yaml`. |
| 4 | **No Railway deployment config** at all. | Added PHP `Dockerfile.php` + `railway.json`, web `Dockerfile` + nginx template + `railway.json` + `.dockerignore`. | Commands verified; image build not (no Docker). |
| 5 | **Web app not runnable** (syntax, mount, routing, endpoints, multipart, Leaflet, CSS). | Rewrote/fixed `web/js/app.js`, `web/index.html`, `web/css/styles.css`; added `web/tests/e2e.mjs`. | `node --check` clean; browser E2E (§7). |
| 6 | **Docs overstated completion** and mis-counted the schema. | Correction banners + this report + README updated to the actual architecture. | Files updated. |

> **Important nuance on #1:** the legacy Node code had the **identical** restriction (`backend/src/Modules/map/routes.ts:31` → `getReportForActor` → `canViewReport`), so this was an **inherited** bug faithfully carried into the PHP port — **not** a migration regression. The fix is a deliberate, tested improvement (public approved reports should be viewable by any signed-in user).

---

## 6. Issues found, **not** fixed (need a decision)

1. **Secrets committed in tracked files.** A real-looking dev credential for the local MySQL user, and weak `change-me…` JWT defaults, appear in **tracked** files (`backend/src/config/env.ts`, `db/setup.sql`, `backend/.env.example`, `docs/SETUP.md`). `backend/.env` / `web/.env` are correctly git-ignored. **Recommend:** rotate the DB password, replace literals with placeholders, and remember the value already exists in **git history** (rewrite or rotate, don't just edit).
2. **Legacy stacks still present.** `backend/prisma/`, `backend/src/config`, `backend/Dockerfile`, `backend/package.json`, `web/src/`, `web/vite.config.ts`, `web/package.json`, `web/dist/`, and `render.yaml` remain. They are **not** the target and should not be deployed, but removing them is a product decision (they are also the only committed backend today). **Not deleted.**
3. **Extra `users` table** in the live MySQL DB (schema drift). Safe to drop manually.
4. **Mobile tests** now cover the API layer (`api_client_test.dart`, 8 tests); state/provider and full network flows are still untested.
5. **Flutter image URLs** depend on `PUBLIC_BASE_URL` being empty (or reachable); document/set per environment.
6. **Moderation request field** is `reason` (response field is `rejectionReason`) — document for any future admin UI.
7. **S3 storage is not implemented** in PHP (only `STORAGE_DRIVER=local`); the `S3_*` variables are legacy. Use a persistent volume.
8. **Web minor gaps.** (a) A plain static server (`python -m http.server`) has no SPA fallback, so hard-loading a deep route (e.g. `/reports`) needs `web/public/_redirects` (production) — the E2E drives routes via in-app navigation. (b) The site must be served from a **CORS-allowed origin** (`localhost:5173`, `:3000`, `localhost`); `127.0.0.1` or other ports are rejected by the API CORS allow-list. (c) The browser E2E covers the 7 main flows; officer `/assignments` + `/report/:id` were checked only by ad-hoc probes, and registration / moderation / assignment mutations are not covered by the browser suite.

---

## 7. Test & evidence log

| Check | Command | Result |
|---|---|---|
| PHP API end-to-end | `node backend/tests/api_integration.mjs` | **103 passed, 0 failed** |
| PHP lint (changed files) | `php -l src/Modules/ReportService.php` … | No syntax errors (all) |
| Clean-install migration | `php database/migrate.php` (empty DB) | 9 tables, exit 0 |
| Migration idempotency | run twice | exit 0 both, 9 tables |
| Seed repeat | `php database/migrate.php --seed` ×2 | 5 users / 6 reports, no duplication |
| MySQL 8.0.45 read-only | server on 4102 → `/health`, `/api/map/reports` | `database: up`; 4 items |
| Rate limiting | 33× bad login on isolated server | 30×`401`, then **`429 RATE_LIMITED`** |
| CORS | OPTIONS/GET with allowed + disallowed origins | 204 + ACAO / no ACAO |
| DB-failure safety | server with unreachable DB | `/health` `database:down`; API generic `DB_ERROR` |
| Flutter analyze | `flutter analyze` | **No issues found!** |
| Flutter tests | `flutter test` | **12/12 pass** (4 widget/enum + 8 API-layer) |
| Flutter builds | `flutter build web --release`, `flutter build apk --debug` | both exit 0 |
| Web syntax | `node --check web/js/app.js` | exit 0 (after repair) |
| Web browser E2E | `node web/tests/e2e.mjs` | **7/7 scenarios passed**, exit 0 (Edge, live API) |

---

## 8. Readiness by component

| Component | Functional | Deployment-ready |
|---|---|---|
| PHP backend | ✅ yes | 🟡 code + Dockerfile/config added; needs a volume + env vars + one migrate run |
| Database | ✅ yes | 🟡 needs a managed MySQL/TiDB instance (schema is idempotent) |
| Web app | ✅ yes (7/7 browser scenarios) | 🟡 needs `config.js` pointed at the API URL; serve from a CORS-allowed origin |
| Mobile app | ✅ yes | 🟡 set `API_BASE_URL`; set API `PUBLIC_BASE_URL` empty or reachable |
| Repo | ❌ untracked migration | ❌ **commit + push required** before any Git-based deploy |

---

## 9. Prioritized remaining manual tasks

1. **Commit & push the migration** (highest priority — nothing deploys until this happens):
   `git add -A && git commit -m "Migrate backend to PHP + vanilla web; add Railway config"` (verify no secrets are staged — `.env` is ignored).
2. **Follow `docs/deployment-checklist.md`** to create the two Railway services, the MySQL/TiDB database, the `/app/uploads` volume, and the env vars.
3. **Set `PUBLIC_BASE_URL`** so image URLs are reachable (empty = relative, best for mobile).
4. **Rotate the exposed dev DB password** and scrub placeholders from tracked docs; consider a history rewrite.
5. **Decide the fate of the legacy Node/React code** (remove or keep as reference).
6. **Add mobile API tests** and, if used in production, an admin moderation UI for web.

---

## 10. How to reproduce this verification

```powershell
# 1. disposable DB (example: local MariaDB on 3307), then:
$env:DATABASE_URL='mysql://root:@127.0.0.1:3307/roadwatch_test'
$env:PUBLIC_BASE_URL=''; $env:JWT_ACCESS_SECRET=('a'*40); $env:JWT_REFRESH_SECRET=('b'*40)
C:\xampp\php\php.exe backend\database\migrate.php --seed
C:\xampp\php\php.exe -S 127.0.0.1:4000 -t backend\public backend\router.php   # from repo root
node backend\tests\api_integration.mjs          # expect: 103 passed, 0 failed
cd mobile; flutter analyze; flutter test
```
