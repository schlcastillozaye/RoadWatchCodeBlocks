# RoadBlocks

**Road issue reporting & maintenance management system**
by **Code Blocks Inc.** — *"Your friendly coding helper"*

A BSIT 3H-G2, Group 5 project at Bulacan State University.

RoadBlocks lets citizens report road problems from their phone, lets administrators
moderate and assign those reports, and lets maintenance officers record progress and
submit completion evidence. Administrators verify repairs before citizens are notified
and the report is marked verified. Approved reports appear on a public map; pending and
rejected ones never do.

---

## Repository layout

```
Project/
├─ backend/        PHP 8.2 API (PDO + MySQL) — the current backend
│  ├─ public/      Front controller (index.php)
│  ├─ src/         Http controllers · Modules (ReportService, …) · Services · Support
│  ├─ database/    schema.sql (10 tables) + migrate.php (idempotent)
│  ├─ seed.php     Demo accounts + sample reports
│  ├─ router.php   Router for the PHP built-in dev server
│  ├─ tests/       api_integration.mjs  (166 end-to-end API checks)
│  └─ Dockerfile.php · railway.json     (Railway deploy)
├─ db/
│  └─ setup.sql    One-time MySQL database + user setup
├─ mobile/         Flutter app (Android, iOS, Web) with citizen and staff workflows
├─ web/            Plain HTML + CSS + vanilla JS app (no build step)
│  ├─ config.js    Runtime API base URL / brand config
│  ├─ js/app.js    Application entry point
│  └─ Dockerfile · railway.json         (Railway static deploy)
├─ docs/           Design system, setup, API, deployment, verification reports
└─ README.md
```

One backend, one MySQL database, one authentication system and one image store serve
both the mobile app and the web platform.

> **Migration note.** This project was migrated from a Node/Express + Prisma + React
> stack to **PHP + vanilla JS**. The legacy sources remain in the tree for reference
> but are **not** the target and are not deployed: `backend/prisma/`,
> `backend/src/config`, `backend/Dockerfile`, `backend/package.json`,
> `web/src/`, `web/vite.config.ts`, `web/package.json`, `web/dist/`, plus the
> Render `render.yaml`. See `docs/independent-verification-report.md` for the audited
> status of every component.

---

## The two status tracks

Every report carries **two independent statuses**. This is the core of the domain.

| Track | Values | Who changes it |
| --- | --- | --- |
| **Moderation** | `PENDING_REVIEW` → `APPROVED` / `REJECTED` | Administrators only |
| **Repair** | `NOT_ASSIGNED` → `AWAITING_MAINTENANCE` → `IN_PROGRESS` → `AWAITING_VERIFICATION` → `VERIFIED_COMPLETED` (or `RETURNED_FOR_WORK`) | Assigned maintenance officer submits; administrators verify or return |

Rules enforced on the server:

- Rejecting requires a reason.
- `PENDING_REVIEW` and `REJECTED` reports are **never** returned by the public map API.
- An officer can submit repair evidence only with **completion notes** and at least **one after photo**.
- Only an administrator can verify the submitted evidence; legacy `COMPLETED` records remain unchanged and are not relabeled as verified.
- Returned repairs require a reason and can be resumed only by the assigned officer.
- Maintenance updates are only accepted for **approved** reports.
- Officers can only update reports assigned to them; they cannot approve or reject.
- Administrators can approve/reject reports, assign or reassign officers, review repair notes and photos, and verify or return submitted work; they cannot submit repair updates or completion reports.
- Active in-app notifications expire from the visible list after five minutes; report history remains persistent.

---

## Issue categories

Both clients offer the same required picker, validated by the same server rule:

| Value | Label |
| --- | --- |
| `POTHOLE` | Pothole |
| `ROAD_CRACK` | Road cracks |
| `DAMAGED_PAVEMENT` | Damaged pavement |
| `FLOODING` | Flooding or water accumulation |
| `ROAD_OBSTRUCTION` | Road obstruction |
| `DAMAGED_DRAINAGE` | Damaged drainage (retained so older reports keep working) |
| `OTHER` | Other |

- The category is **required** and is shown in the report details, the admin
  report list, the officer's assignment list and the citizen's tracking list.
- Choosing **Other** reveals a required description field
  (`Report.categoryOther`, 5–300 characters). The API refuses `OTHER` without it
  (**422**) and stores `null` for every other category, so the stored value always
  matches the category.
- The API validates a **superset** of what the pickers offer, and the change is
  purely additive — reports filed before a value existed still load.

---

## Quick start

> Local setup for the PHP API, the no-build web app and the Flutter app is below.
> (The original Node/Prisma instructions live in `docs/SETUP.md` and are legacy.)

### 1. Create the database (once)

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < db\setup.sql
```

This creates the `roadwatch` database and a dedicated `roadwatch` MySQL user.

### 2. Backend (PHP)

```powershell
cd backend
copy .env.example .env      # then edit DB credentials + JWT secrets
php database/migrate.php    # create tables from database/schema.sql (idempotent)
php seed.php                # demo accounts + sample reports
php -S 127.0.0.1:4000 -t public router.php   # http://localhost:4000
```

Requires **PHP 8.2+** with the `pdo_mysql`, `mbstring` and `curl` extensions.
There is no Composer dependency to install.

Verify it works:

```powershell
curl http://localhost:4000/health          # {"status":"ok","database":"up",…}
node tests/api_integration.mjs             # 137 end-to-end API checks
```

### 3. Web platform (no build step)

```powershell
cd web
# If the API is not on http://localhost:4000, edit config.js:
#   window.RW_API_BASE_URL = 'http://localhost:4000';
python -m http.server 8080
# then open http://localhost:8080
```

### 4. Mobile app

```powershell
cd mobile
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:4000
```

---

## Seeded demo accounts

| Role | Email | Password handling |
| --- | --- | --- |
| Administrator | `admin@roadwatch.gov` | Set securely outside source control |
| Maintenance officer | `officer1@roadwatch.gov` | Set securely outside source control |
| Maintenance officer | `officer2@roadwatch.gov` | Set securely outside source control |
| Citizen | `citizen@example.com` | Set securely outside source control |
| Citizen | `citizen2@example.com` | Set securely outside source control |

> Seed passwords are supplied through `RW_SEED_ADMIN_PASSWORD`,
> `RW_SEED_OFFICER_PASSWORD`, `RW_SEED_CITIZEN_PASSWORD`, and
> `RW_SEED_CITIZEN2_PASSWORD` environment variables; never commit or print them.
> Rotate initial account passwords before public distribution.

---

## Deploying on Railway

The PHP API and the vanilla web app are ready to deploy as **two Railway services from this
one repository**.

- **Full walkthrough:** [`docs/deployment-checklist.md`](docs/deployment-checklist.md).
- **What was verified locally vs. what remains manual:** see the same file §7 and
  [`docs/independent-verification-report.md`](docs/independent-verification-report.md).

In one paragraph: push the repository to GitHub, create a Railway project with a
MySQL database (the Railway **MySQL** plugin), then add
two services from this repo — one with root directory `backend/` (uses
`backend/Dockerfile.php` + `backend/railway.json`) and one with root directory `web/`
(uses `web/Dockerfile`). Set `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`CORS_ORIGINS`, `PUBLIC_BASE_URL`, and `STORAGE_DRIVER=database` on the API service,
and set **`RW_API_BASE_URL`** on the web service to the API service URL. Photos are
stored as `MEDIUMBLOB`s on their `ReportPhoto` rows in the existing MySQL database;
the same storage and API serve both web and mobile. The 8 MB per-image limit fits the
column type. Database storage usage is metered by the hosting provider, so monitor
its disk/usage as photos accumulate. Point Android releases at the same API with
`--dart-define=API_BASE_URL=https://roadwatchcodeblocks-production.up.railway.app`.

> **Schema changes need no manual step.** The API image runs
> `php database/migrate.php` on boot (`RUN_MIGRATIONS`, default on). It is
> idempotent and only ever *adds* (new tables, new enum values, new nullable
> columns), so an already-deployed database picks up changes without a reset.

> **Images:** production must use `STORAGE_DRIVER=database`; the API rejects a local
> ephemeral-storage configuration. The migration adds `ReportPhoto.imageData` as a
> nullable column, preserving existing photo metadata. It cannot recover old image
> files that were already lost from the container.

---

## Maps

Every platform draws its map with **OpenStreetMap — no API key, no account and no
billing**. It works the moment you run or deploy it.

| Client | Map library | Key needed |
| --- | --- | --- |
| Web | Leaflet on OpenStreetMap tiles | **None** |
| Mobile | `flutter_map` on OpenStreetMap tiles | **None** |
| Backend (geocoding) | OpenStreetMap Nominatim, Google optional | `GOOGLE_MAPS_SERVER_API_KEY` (optional) |

Address search and reverse geocoding on the API default to the **free OpenStreetMap
Nominatim** service, throttled to its one-request-per-second policy and cached for
10 minutes. Set `GOOGLE_MAPS_SERVER_API_KEY` only if you would rather use Google
Geocoding — that key requires billing to be enabled.

The OpenStreetMap tile usage policy is honoured everywhere: requests carry a
descriptive `User-Agent` and attribution is shown on every map.

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the exact configuration steps and
[`docs/API.md`](docs/API.md) for every endpoint.

---

## Optional image-processing module

Automatic image analysis (pothole detection, severity estimates, before/after comparison)
is a **separate, optional module**. It is disabled by default and is wired through a single
interface, `ImageProcessingService`, with a no-op implementation.

Analysis failures are swallowed and logged — they can never break report submission,
moderation, the map or maintenance. See
[`docs/IMAGE_PROCESSING.md`](docs/IMAGE_PROCESSING.md).

---

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/independent-verification-report.md`](docs/independent-verification-report.md) | **Independent audit** of the migration: verified vs. claimed, issues found/fixed |
| [`docs/route-verification.md`](docs/route-verification.md) | Every API route with its auth rule and the client that uses it |
| [`docs/deployment-checklist.md`](docs/deployment-checklist.md) | Step-by-step Railway deployment (API + web + DB) |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Brand palette, typography, spacing, status colours |
| [`docs/API.md`](docs/API.md) | REST API reference with examples |
| [`docs/IMAGE_PROCESSING.md`](docs/IMAGE_PROCESSING.md) | Plugging in the optional analysis service |
| [`docs/TESTING.md`](docs/TESTING.md) | End-to-end verification checklist |
| _legacy_ [`docs/SETUP.md`](docs/SETUP.md) | Original Node/Prisma setup (superseded by the PHP quick start above) |
| _legacy_ [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md) | Original Render/Node deployment notes |

Automated checks: `node backend/tests/api_integration.mjs` (PHP API, 103 checks) and
`flutter test` in `mobile/`.
