# RoadWatch — Deploying to Render (step by step)

This guide puts the **web platform** and the **shared API** on the public internet using
[Render](https://render.com). The Flutter mobile app is not hosted here — it is built and
installed separately (see [`DEPLOYMENT.md`](./DEPLOYMENT.md) §6) and simply points at the
hosted API URL.

Everything is defined in the repository root `render.yaml` (a Render *Blueprint*), which
creates two services:

| Service | Type | What it runs |
| --- | --- | --- |
| `roadwatch-api` | Web service (Docker) | `backend/Dockerfile` — Node + Express API |
| `roadwatch-web` | Static site | `web/` — React admin / officer platform |

> **MySQL is not provided by Render.** You create a managed MySQL-compatible database
> separately (Step 2) and give the API its connection string.

---

## 0. Prerequisites

- The code pushed to a **GitHub** repository.
- A free **Render** account (<https://render.com>).
- A **managed MySQL-compatible** database (free options in Step 2; TiDB Cloud Starter is
  verified).
- *(Optional)* Google Maps API keys — **the system works fully without any**. The web
  platform draws its map with Leaflet on OpenStreetMap tiles and the API geocodes with
  the free OpenStreetMap Nominatim service, so nothing on the hosted system needs a key.

### Push the code to GitHub first

This repository is already committed on `main` and pushed to
`https://github.com/schlcastillozaye/RoadWatchCodeBlocks`. If you are deploying from a
different repo or a fresh clone, push it the same way:

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project"
git add .
git commit -m "RoadWatch: update"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env` files, `node_modules/`, `dist/`, build output and the real Google key files are
already ignored (see `.gitignore`), so no secrets are pushed.

> Render redeploys automatically on every push to `main` (`autoDeploy: true`), so make sure
> you have pushed the latest commit before clicking **Apply**.

---

## 1. (Optional) Google Maps keys

**You can skip this step completely.** Nothing you deploy here needs a Google key:

- The **web platform** renders its map with **Leaflet + OpenStreetMap** — no key, no
  account, no billing.
- The **API** geocodes addresses with the free **OpenStreetMap Nominatim** service.
- Only the **Flutter mobile app** uses Google Maps, and it falls back to a list without
  a key — so even that is optional.

If you *do* want Google keys (they require billing enabled), create **separate,
restricted** keys in the [Google Cloud Console](https://console.cloud.google.com/google/maps-apis):

| Key | For | Restriction |
| --- | --- | --- |
| Android key | Mobile app | Package name + SHA-1 of the signing certificate, **Maps SDK for Android** |
| iOS key | Mobile app | Bundle id, **Maps SDK for iOS** |
| Server key | API (`GOOGLE_MAPS_SERVER_API_KEY`) | Server IP, **Geocoding API** (optional) |

---

## 2. Create a managed MySQL database

Pick any provider that offers **MySQL 8 (or MySQL-compatible) with TLS**. The option this
project has been verified against is **TiDB Cloud Starter**:

- **TiDB Cloud Starter** (free, no credit card) — <https://tidbcloud.com> → sign up →
  **Create Resource** → plan **Starter** → pick the region closest to you (e.g. Singapore)
  → **Create**. When it is running, open the cluster → **Connect** → set/reveal the
  password → open the **Prisma** tab and copy the string. It looks like:

  ```
  mysql://<user>.root:<PASSWORD>@gateway01.<region>.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
  ```

  > TiDB Cloud requires TLS. Its public endpoint is signed by a publicly trusted CA, so
  > **`?sslaccept=strict` works as-is** (verified against TiDB v8.5 with Prisma 6,
  > including all 15 foreign-key constraints in the initial migration).

- **Aiven** — <https://aiven.io> → *Create service* → **MySQL** → *Free* plan → choose the
  region closest to your users. When it is running, copy the **Service URI**.
- **Railway** — <https://railway.app> → *New Project* → **Provision MySQL** → copy
  `MYSQL_URL` from the *Variables* tab (works as-is).

### Get the connection string into Prisma's format

The URL must be shaped like:

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
```

- **URL-encode special characters in the password** (`!`→`%21`, `@`→`%40`, `#`→`%23`,
  `/`→`%2F`).
- **TLS:** providers spell this parameter differently, and Prisma's engine understands
  **both**:
  - `?sslaccept=strict` — TiDB Cloud (verified), and any MySQL server whose certificate is
    signed by a public CA.
  - `?sslmode=require` — Aiven (its URI says `ssl-mode=REQUIRED`; change the name) and most
    other providers. `sslmode=require` encrypts but does not verify the CA.

  Omit the parameter entirely only for a local / no-TLS database.

Example (TiDB Cloud Starter, verified — substitute your own values):

```
mysql://AbC123xyz.root:YOUR-PASSWORD@gateway01.ap-southeast-1.prod.aws.tidbcloud.com:4000/test?sslaccept=strict
```

Example (Aiven):

```
mysql://avnadmin:My%21Passw0rd@mysql-abc123-roadwatch.a.aivencloud.com:25060/defaultdb?sslmode=require
```

Keep this string — it becomes `DATABASE_URL` in Step 4.

> **You never import a `.sql` file by hand.** On first boot the API container runs
> `prisma migrate deploy` and creates all ten tables itself. Using the default `test`
> database on TiDB is fine — the tables are created inside it.

---

## 3. Create the Blueprint on Render

1. In the Render dashboard click **New +** → **Blueprint**.
2. Connect your GitHub repository and click **Connect**.
3. Render reads `render.yaml` and shows the two services (`roadwatch-api`,
   `roadwatch-web`). Click **Apply**.
4. Render asks for the values marked `sync: false` (see the next step). You can either fill
   them now or leave them blank and add them in **Service → Environment** afterwards.

---

## 4. Set the environment variables

### `roadwatch-api`

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the MySQL URL from Step 2 |
| `CORS_ORIGINS` | the web URL, e.g. `https://roadwatch-web.onrender.com` (fill in after Step 5) |
| `PUBLIC_BASE_URL` | this API's own public URL, e.g. `https://roadwatch-api.onrender.com` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | auto-generated by Render (`generateValue`) — leave them alone |
| `SEED_ON_START` | set to `true` **once** if you want the demo accounts, then back to `false` |
| `GOOGLE_MAPS_SERVER_API_KEY` | optional — leave blank to use the free OpenStreetMap geocoder |
| `S3_*` | only if using object storage (see [Images](#7-persistent-images)) |

> **Order of operations matters.** The API needs the **web** URL for `CORS_ORIGINS`, and
> the web build needs the **API** URL. The easiest path:
> 1. Deploy once, then copy the **API** URL from the service page → set
>    `PUBLIC_BASE_URL`.
> 2. Set the web's `VITE_API_BASE_URL` to that API URL (Step 5) and redeploy the web.
> 3. Copy the **web** URL → set the API's `CORS_ORIGINS` → redeploy the API.

### `roadwatch-web`

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | the API URL, e.g. `https://roadwatch-api.onrender.com` |

There is no map key to set: the web map is Leaflet on OpenStreetMap tiles.

These are **build-time** values: after changing them, trigger a **Manual Deploy → Clear
build cache & deploy** so Vite re-inlines them.

---

## 5. First deploy & verification

Render builds both services (a few minutes the first time). The container entrypoint runs
`prisma migrate deploy` automatically, creating the schema from
`backend/prisma/migrations/`.

Verify:

```powershell
# Should return {"status":"ok","database":"up","storage":"local",...}
Invoke-RestMethod https://roadwatch-api.onrender.com/health
```

Then:

1. Open the web URL — you should get the RoadWatch login page.
2. If you set `SEED_ON_START=true`, log in with `admin@roadwatch.gov` / `Admin@12345`
   (see `backend/prisma/seed.ts` for all seeded accounts) and **change those passwords
   immediately**, or seed manually instead (below).

### Seeding manually (alternative to `SEED_ON_START`)

In the **roadwatch-api** service, open **Shell** and run:

```bash
npm run seed
```

---

## 6. Point the mobile app at the hosted API

Build the app with the public API URL so citizens' reports reach the hosted backend:

```powershell
cd mobile
$env:ORG_GRADLE_PROJECT_GOOGLE_MAPS_API_KEY = "<android-key>"
flutter build appbundle `
  --dart-define=API_BASE_URL=https://roadwatch-api.onrender.com `
  --dart-define=GOOGLE_MAPS_API_KEY=<android-key>
```

For a quick local test against the deployed API, `flutter run --dart-define=API_BASE_URL=https://roadwatch-api.onrender.com`.

---

## 7. Persistent images

Render's **free** plan uses an **ephemeral filesystem**, so photos written to
`/app/uploads` are lost whenever the service redeploys or restarts. Choose one:

- **Persistent disk (paid instance).** Uncomment the `disk:` block in `render.yaml`
  (mount path `/app/uploads`) and use a paid instance type. Keep `STORAGE_DRIVER=local`.
- **S3-compatible object storage (recommended, generous free tiers).** Set:

  ```ini
  STORAGE_DRIVER=s3
  S3_BUCKET=roadwatch-media
  S3_REGION=auto
  S3_ACCESS_KEY_ID=…
  S3_SECRET_ACCESS_KEY=…
  S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com   # Cloudflare R2 example
  S3_PUBLIC_BASE_URL=                                        # leave empty; images stay private
  ```

  Keep the bucket **private** — images are served only through the API, which applies the
  moderation rules.

For a class demo where photos only need to survive the presentation, the default local
storage is fine.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| API URL returns `{"statusCode":500,"message":"Internal server error"}` or `"Hello World!"` | you are hitting **someone else's** service — Render service names are **globally unique**, so if `roadwatch-api` was already taken your service was created under a suffixed URL | open the service in the Render dashboard, copy its real URL (e.g. `roadwatch-api-6w2m.onrender.com`) and use that everywhere (`VITE_API_BASE_URL`, `PUBLIC_BASE_URL`) |
| Login returns `401` for the demo accounts | the seed never ran, so the `User` table is empty | set `SEED_ON_START=true` on the API, save (it redeploys and seeds), then set it back to `false` |
| `/health` reports `database: "down"` | wrong/unreachable `DATABASE_URL` | re-check the URL, the encoded password, and the TLS parameter (`sslaccept=strict` for TiDB, `sslmode=require` for most others) |
| API logs `Can't reach database server` | provider requires TLS | append the right TLS parameter (see Step 2) |
| Blueprint error `services[1].plan no such plan free` | a `plan:` was set on the **static site** | static sites have no compute plan — remove `plan`/`region` from `roadwatch-web` in `render.yaml` (already fixed here) |
| Migration fails with `FOREIGN KEY` | rare on older TiDB/PlanetScale-style servers | set `relationMode = "prisma"` in `backend/prisma/schema.prisma`, regenerate the migration, redeploy |
| Web shows "Cannot reach the server" | wrong `VITE_API_BASE_URL`, or not rebuilt | set it to the API URL and **Clear build cache & deploy** |
| Browser console shows a CORS error | `CORS_ORIGINS` missing the web origin | add the exact `https://…` origin (no trailing slash), redeploy the API |
| Deep link / refresh shows Render's 404 | SPA fallback | the `render.yaml` rewrite (`/*` → `/index.html`) handles this; confirm it applied |
| Images 404 after a redeploy | ephemeral storage | see [§7](#7-persistent-images) |
| First request is slow (30–60 s) | free services sleep when idle | expected on the free plan; the next request warms it up |
| Mobile app can't load images | `PUBLIC_BASE_URL` wrong | set it to the API URL and redeploy |

---

## 9. Custom domain (optional)

In each Render service go to **Settings → Custom Domains** and add e.g.
`roadwatch.yourdomain.com` (web) and `api.roadwatch.yourdomain.com` (API). Then update
`CORS_ORIGINS`, `PUBLIC_BASE_URL` (API) and `VITE_API_BASE_URL` (web), and redeploy both.
Render provisions TLS automatically.

---

## What "done" looks like

- `https://<api>.onrender.com/health` → `"status":"ok","database":"up"`
- The web platform loads, an admin can approve/reject and assign a report.
- An officer can update the repair status and upload after-photos.
- The public map (and the mobile app) show only **approved** reports.
- A citizen's mobile report appears in the web admin queue.
