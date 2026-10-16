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
├─ backend/        Node + Express + TypeScript API (shared by both clients)
│  ├─ prisma/      Prisma schema, committed migrations + seed script
│  ├─ Dockerfile   Production image (also used by the Render Blueprint)
│  └─ src/         config, middleware, modules (auth, users, reports, …)
├─ db/
│  └─ setup.sql    One-time MySQL database + user setup
├─ mobile/         Flutter citizen app (Android, iOS, Web)
├─ web/            React + TypeScript admin & officer platform (Vite)
├─ docs/           Design system, setup, API, deployment, image-processing notes
├─ render.yaml     Render Blueprint (hosts the API + web platform)
└─ README.md
```

One backend, one MySQL database, one authentication system and one image store serve
both the mobile app and the web platform.

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

> Full details, including troubleshooting, are in [`docs/SETUP.md`](docs/SETUP.md).

### 1. Create the database (once)

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < db\setup.sql
```

This creates the `roadwatch` database and a dedicated `roadwatch` MySQL user.

### 2. Backend

```powershell
cd backend
copy .env.example .env      # then edit secrets if you wish
npm install
npm run db:push             # create tables from the Prisma schema
npm run seed                # demo accounts + sample reports
npm run dev                 # http://localhost:4000
```

### 3. Web platform

```powershell
cd web
copy .env.example .env
npm install
npm run dev                 # http://localhost:5173
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

## Hosting it on the web

The web platform and the shared API are ready to deploy. A Render **Blueprint**
(`render.yaml`) defines both services, and the backend ships a production `Dockerfile`.

- **Full walkthrough:** [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md) — GitHub → managed
  MySQL → Render → custom domain.
- **General production notes:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

In one paragraph: push the repository to GitHub, create a free managed MySQL 8 database
(Aiven or Railway), then in Render choose **New + → Blueprint** and connect the repo. Fill
in `DATABASE_URL`, `CORS_ORIGINS` and `PUBLIC_BASE_URL` for the API and
`VITE_API_BASE_URL` for the web platform. The API applies its Prisma migrations on boot;
set `SEED_ON_START=true` once if you want the demo accounts. Point the mobile app at the
same API with `--dart-define=API_BASE_URL=…`.

> **Images:** Render's free plan has an ephemeral disk, so either attach a persistent disk
> (paid) or use S3-compatible storage (`STORAGE_DRIVER=s3`, e.g. Cloudflare R2). Details in
> the deployment guide.

---

## Maps

The web platform draws its map with **Leaflet + OpenStreetMap** — an interactive,
colour-coded, click-through map with **no API key, no account and no billing**. It
works the moment you deploy it.

| Client | Map provider | Key needed |
| --- | --- | --- |
| Web | Leaflet + OpenStreetMap | **None** |
| Mobile | Google Maps, falls back to a list | `--dart-define=GOOGLE_MAPS_API_KEY=…` (optional) |
| Backend (geocoding) | OpenStreetMap Nominatim, Google optional | `GOOGLE_MAPS_SERVER_API_KEY` (optional) |

Address search and reverse geocoding on the API default to the **free OpenStreetMap
Nominatim** service. Set `GOOGLE_MAPS_SERVER_API_KEY` only if you would rather use
Google Geocoding — that key requires billing to be enabled.

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
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Brand palette, typography, spacing, status colours |
| [`docs/SETUP.md`](docs/SETUP.md) | Local setup for backend, web and mobile |
| [`docs/API.md`](docs/API.md) | Full REST API reference with examples |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Production configuration, hosting and secrets |
| [`docs/DEPLOY_RENDER.md`](docs/DEPLOY_RENDER.md) | Step-by-step Render deployment (API + web) |
| [`docs/IMAGE_PROCESSING.md`](docs/IMAGE_PROCESSING.md) | Plugging in the optional analysis service |
| [`docs/TESTING.md`](docs/TESTING.md) | End-to-end verification checklist |
