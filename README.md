# RoadWatch

**Road issue reporting & maintenance management system**
by **Code Blocks Inc.** — *"Your friendly coding helper"*

A BSIT 3H-G2, Group 5 project at Bulacan State University.

RoadWatch lets citizens report road problems from their phone, lets administrators
moderate and assign those reports, and lets maintenance officers record progress and
completion. Approved reports appear on a public map; pending and rejected ones never do.

---

## Repository layout

```
Project/
├─ backend/        PHP 8.2 API (PDO + MySQL) — the current backend
│  ├─ public/      Front controller (index.php)
│  ├─ src/         Http controllers · Modules (ReportService, …) · Services · Support
│  ├─ database/    schema.sql (9 tables) + migrate.php (idempotent)
│  ├─ seed.php     Demo accounts + sample reports
│  ├─ router.php   Router for the PHP built-in dev server
│  ├─ tests/       api_integration.mjs  (103 end-to-end API checks)
│  └─ Dockerfile.php · railway.json     (Railway deploy)
├─ db/
│  └─ setup.sql    One-time MySQL database + user setup
├─ mobile/         Flutter citizen app (Android, iOS, Web)
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
| **Repair** | `NOT_ASSIGNED` → `AWAITING_MAINTENANCE` → `IN_PROGRESS` → `COMPLETED` | Assigned officer (or an administrator) |

Rules enforced on the server:

- Rejecting requires a reason.
- `PENDING_REVIEW` and `REJECTED` reports are **never** returned by the public map API.
- A repair can only be completed with **completion notes** and at least **one after photo**.
  An administrator may override the photo requirement, and the override is audited.
- Maintenance updates are only accepted for **approved** reports.
- Officers can only update reports assigned to them; they cannot approve or reject.

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
node tests/api_integration.mjs             # 103 end-to-end API checks
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

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@roadwatch.gov` | `Admin@12345` |
| Maintenance officer | `officer1@roadwatch.gov` | `Officer@12345` |
| Maintenance officer | `officer2@roadwatch.gov` | `Officer@12345` |
| Citizen | `citizen@example.com` | `Citizen@12345` |
| Citizen | `citizen2@example.com` | `Citizen@12345` |

> These are development fixtures. Change or remove them before any real deployment.

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
`CORS_ORIGINS` and `PUBLIC_BASE_URL` on the API service, run
`php /app/database/migrate.php` once (or as a pre-deploy command), mount a volume at
`/app/uploads` so photos survive redeploys, and set the **`RW_API_BASE_URL`** variable
on the web service to the API service URL. Point the mobile
app at the same API with `--dart-define=API_BASE_URL=…`.

> **Images:** without a persistent volume the container filesystem is ephemeral and uploaded
> photos are lost on redeploy — attach a Railway volume at `/app/uploads`. Note that the PHP
> backend implements **only** `STORAGE_DRIVER=local`; the `S3_*` variables in the templates
> are not wired up in PHP (they belonged to the legacy Node backend).

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
