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
| 7 | **Linux-breaking path case in git (deployment-blocker).** The dirs were `Modules`/`Services` **on disk** (matching the namespaces) but git tracked them as **`modules`/`services`** — inherited from the legacy Node tree via Windows' case-insensitive filesystem. A Linux checkout (Railway/Docker) would create `src/modules/`, and the autoloader (`RoadWatch\Modules\X` → `src/Modules/X.php`) would fail to load **every** module/service class → the whole API fatal-errors. | Two-step `git mv` case rename → `Modules`/`Services` in the index. | `git ls-tree HEAD` now lists `src/Modules/…` and `src/Services/…`. |
| 8 | **Exposed dev DB credential in tracked files** (`db/setup.sql`, `backend/src/Support/Config.php`, `backend/src/config/env.ts`, `backend/.env.example`, `docs/SETUP.md`). | Scrubbed **without ever printing the value** (derived at runtime from `db/setup.sql`, replaced with `CHANGE_ME_DB_PASSWORD`). | `git grep -l -F <value>` → **zero** tracked files. The value still exists in **git history** (`e37b370`, `52ac7c0`), so rotate, don't just edit. |
| 9 | **JWT secrets could be left at placeholder values in production** → anyone could forge tokens. | `Config::guardSecret()` refuses to boot when `NODE_ENV=production` and a secret is the default, starts with `change-me`, or is <32 chars. | CLI probe: production + placeholder → throws; development → OK; production + strong → OK. |
| 10 | **`.gitignore` did not ignore `.env.production`** (a future leak path). | Added `.env.production` and `.env.*.production`. | inspection. |
| 11 | **Web app's API URL was build-time only** — the split Railway setup (web origin ≠ api origin) had no rebuild-free way to point the site at the API. | Added `web/rw-runtime-config.js` (loaded after `config.js`) + `web/docker-entrypoint.d/40-roadwatch-config.sh`: the container writes `RW_API_BASE_URL` at start-up. | web E2E still **7/7**; script is LF-only (`.gitattributes`). |
| 12 | **Flutter release builds could silently ship the `localhost` default.** | `AppConfig.resolveApiBaseUrl()` throws in a release build if the origin is `localhost`/`127.0.0.1`; `--dart-define=API_BASE_URL=…` documented in README + checklist. | 3 new unit tests; `flutter test` **15/15**. |
| 13 | **Stale TiDB / Render references** in `.env.example`, `README.md`, `docs/deployment-checklist.md`, `backend/.env.production.example`, `.vscode/launch.json`, `render.yaml`. | TiDB removed from the target architecture; corrected to Railway + MySQL; legacy Render docs/configs get explicit **"LEGACY — NOT THE TARGET"** banners. | inspection. |
| 14 | **`backend/.dockerignore`** (this file already existed and **already** excluded `.env`, so secrets were never baked into images — the earlier "(no .dockerignore)" note was a glob miss on a dotfile). | Refined to also exclude `prisma/`, `tests/`, `src/config/`, `package.json`, `docs`. Added missing `web/` whitelist entries. | inspection. |
| 15 | **Local `CORS_ORIGINS` did not include the vanilla web dev port (8080)** → local web dev on 8080 was CORS-blocked. | Added `http://localhost:8080` to the `Config.php` default and both `.env.example` files (and the local `.env`). | inspection. |

> **Cross-platform caveat on verification.** All runtime testing (API, browser E2E, builds) ran on **Windows**, whose case-insensitive filesystem **cannot** surface path-case bugs — the browser E2E would pass even with a broken `Modules` path. Issue #7 was found by comparing `git ls-tree` against the PHP namespaces, and the same audit was run across every PHP `require` path and every web asset reference (all consistent). This is the one class of bug the automated suites cannot catch on Windows; a CI job that checks out on Linux would be the durable guard.

> **Important nuance on #1:** the legacy Node code had the **identical** restriction (`backend/src/Modules/map/routes.ts:31` → `getReportForActor` → `canViewReport`), so this was an **inherited** bug faithfully carried into the PHP port — **not** a migration regression. The fix is a deliberate, tested improvement (public approved reports should be viewable by any signed-in user).

---

## 6. Issues found, **not** fixed (need a decision)

1. **~~Secrets committed in tracked files~~ — RESOLVED (partly).** The dev credential has been scrubbed from **all tracked files** (§5 #8) and weak production secrets now fail fast (§5 #9). **Rotation is prepared but NOT executed:** the live credential belongs to the **local** MySQL 8 accounts `roadwatch@localhost` / `roadwatch@127.0.0.1` (localhost-only), and the application account holds only `USAGE` + `ALL ON roadwatch.*` — it **cannot** rotate itself, and MySQL `root` needs a password the verifier does not have. Run `db/rotate_password.sql` as an administrator. Because the value is still in git history, rotation remains the durable fix (a history rewrite is **not** done here — it would rewrite shared history).
2. **Legacy stacks still present.** `backend/prisma/`, `backend/src/config`, `backend/Dockerfile`, `backend/package.json`, `web/src/`, `web/vite.config.ts`, `web/package.json`, `web/dist/`, and `render.yaml` remain. They are **not** the target and should not be deployed, but removing them is a product decision (they are also the only committed backend today). **Not deleted.** Note: the legacy `src/modules/**` + `src/services/**` TypeScript files now also sit under the capitalized `Modules/` + `Services/` paths (they share the directory with the PHP code); their lowercase relative imports still resolve on Windows but would need case fixes if the legacy Node backend were ever run on Linux.
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
| Flutter tests | `flutter test` | **15/15 pass** (4 widget/enum + 8 API-layer + 3 release-guard) |
| Flutter builds | `flutter build web --release`, `flutter build apk --debug` | both exit 0 |
| JWT production guard | CLI probe, `NODE_ENV=production` + placeholder secret | guard throws (as designed) |
| Credential scrub | `git grep -l -F <value>` | **no tracked file matches** |
| Web syntax | `node --check web/js/app.js` | exit 0 (after repair) |
| Web browser E2E | `node web/tests/e2e.mjs` | **7/7 scenarios passed**, exit 0 (Edge, live API) — re-run after adding `rw-runtime-config.js` |
| PHP lint (this pass) | `php -l src/Support/Config.php` … | No syntax errors (all) |
| API suite re-run (this pass) | `node backend/tests/api_integration.mjs` | **103 passed, 0 failed** |

---

## 8. Readiness by component

| Component | Functional | Deployment-ready |
|---|---|---|
| PHP backend | ✅ yes | 🟡 code + Dockerfile/config + `.dockerignore`; needs a volume + env vars + one migrate run |
| Database | ✅ yes | 🟡 needs a managed MySQL 8 / MariaDB instance (Railway MySQL plugin); schema is idempotent |
| Web app | ✅ yes (7/7 browser scenarios) | 🟡 set `RW_API_BASE_URL` on the web service (runtime); serve from the API's CORS allow-list |
| Mobile app | ✅ yes | 🟡 build with `--dart-define=API_BASE_URL=<public api>`; set API `PUBLIC_BASE_URL` |
| Repo | 🟡 migration **committed locally** | ❌ **push required** before any Git-based deploy (see §9 #1) |

> **Not verifiable here:** the Docker **image build** and the **live Railway run**. Docker is not installed in the verification environment and there is no Railway account/remote auth available. Everything expressible as a non-Docker command was executed and passed.

---

## 9. Prioritized remaining manual tasks

1. **Push the repository** (highest priority — nothing deploys until this happens). The migration + hardening commits are **local only**; `main` is ahead of `origin/main`. `git push origin main` (do **not** force-push).
2. **Follow `docs/deployment-checklist.md`** to create the two Railway services, the MySQL database (Railway MySQL plugin), the `/app/uploads` volume, the `RW_API_BASE_URL` web variable and the API env vars.
3. **Rotate the exposed dev DB password** (`db/rotate_password.sql`, as MySQL root). The value is still in git history — rotation is what actually retires it.
4. **Set `PUBLIC_BASE_URL`** on the API so image URLs are reachable (absolute is needed by the mobile app).
5. **Build the mobile app with `--dart-define=API_BASE_URL=<public api>`** (release builds now refuse the localhost default).
6. **Decide the fate of the legacy Node/React code** (remove or keep as reference — it is not deployed).
7. **Optional:** an admin moderation UI for web; a Linux CI checkout to catch path-case regressions durably.

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

---

## 11. Deployment-hardening pass (2026-10-17, second session)

A follow-up pass focused on **finishing deployment safely** without redoing the
migration. Summary of what changed and what is still manual:

### Done (verified)

- **Credential scrubbed from tracked source.** All five tracked occurrences of the
  local dev DB password were replaced with `CHANGE_ME_DB_PASSWORD`, **without the
  value ever being typed or printed** (it was derived at runtime from
  `db/setup.sql`). `git grep` now finds it in zero tracked files. It remains in git
  history (`e37b370`, `52ac7c0`) — see the rotation note below.
- **Live credential characterised.** It belongs to the **local** MySQL 8.0.45 on
  `127.0.0.1:3306` (`roadwatch@localhost` / `roadwatch@127.0.0.1`, **localhost-only**,
  not `@'%'`). The account holds `USAGE` + `ALL ON roadwatch.*` only, so it **cannot
  rotate itself**; MySQL `root` is password-protected and unavailable to the agent.
  → rotation is **prepared** in `db/rotate_password.sql` and must be run as root.
- **JWT fail-fast.** Production now refuses to boot on placeholder/short JWT secrets.
- **Web API URL is now runtime-configurable** (`RW_API_BASE_URL` service variable) —
  no image rebuild needed when the API URL changes.
- **Flutter release guard** for a missing/public API origin (+ 3 unit tests).
- **TiDB removed** everywhere from the target; Render references corrected or
  clearly marked legacy. `docs/deployment-checklist.md` rewritten for Railway.
- **`.gitignore` hardened** for `.env.production`.
- **Re-verified everything:** API **103/103**, Flutter **15/15** + analyze clean,
  Web E2E **7/7**, PHP lint clean.

### Still manual (needs a human / an account)

| # | Task | Why it can't be automated here | How to verify success |
|---|---|---|---|
| 1 | **`git push origin main`** | remote credentials/approval not available to the agent | `git status` shows up-to-date; commits visible on GitHub |
| 2 | **Rotate the dev DB password** (`db/rotate_password.sql` as root) | the app account lacks the privilege; root password unknown | re-run app against local DB → `/health` `database: up` |
| 3 | **Create the Railway MySQL plugin + services** per the checklist | needs a Railway account (not available) | `curl .../health` → `database: up` |
| 4 | **Mount `/app/uploads` volume** | dashboard action | redeploy → previously uploaded photos still load |
| 5 | **Build the mobile app with the public API URL** | needs the deployed API URL | app loads data on a release device build |
| 6 | **`docker build` the two images** | Docker is not installed here | both images build; web serves on `$PORT` |

### Explicitly *not* done (and why)

- **No git-history rewrite** — it would rewrite shared history; rotation is the
  correct remedy for an exposed secret that is still live.
- **No deletion of the legacy Node/React trees** — kept archived and documented
  (§6 #2); deleting them is a product decision.
- **No change to the live `roadwatch` MySQL data** — read-only inspection only.

