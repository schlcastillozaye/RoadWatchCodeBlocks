# RoadWatch — Local Setup

Everything needed to run the full system on one Windows development machine.

---

## 0. Prerequisites

| Requirement | Version used | Notes |
| --- | --- | --- |
| Node.js | 20+ (built with v26) | For the backend and the web platform |
| npm | 10+ | Ships with Node |
| MySQL Server | 8.0 | Running as a Windows service. **MariaDB (XAMPP) is not supported** — the `caching_sha2_password` plugin fails with the Prisma client. |
| Flutter | 3.29+ (built with 3.49 beta) | For the mobile app |
| Git | any | Optional |

Check what you have:

```powershell
node -v
npm -v
flutter --version
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" --version
```

---

## 1. Database (do this first)

The backend talks to a dedicated MySQL database and user. Both are created by
`db/setup.sql`, which is idempotent — running it twice is safe.

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < db\setup.sql
```

Enter your MySQL **root** password when prompted.

What the script does:

- creates the `roadwatch` schema (utf8mb4 / utf8mb4_unicode_ci),
- creates the `roadwatch` user with the password `RoadWatchDev2026`,
- grants it full rights on the `roadwatch` schema only.

> If your MySQL is on a non-default host or port, or you would rather reuse another
> account, edit `DATABASE_URL` in `backend/.env` instead.

Verify:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u roadwatch -pRoadWatchDev2026 -e "SHOW DATABASES;"
```

---

## 2. Backend

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project\backend"
copy .env.example .env
npm install
npm run db:push     # creates tables + indexes from prisma/schema.prisma
npm run seed        # demo accounts and sample reports
npm run dev         # starts http://localhost:4000
```

Confirm it is alive:

```powershell
curl http://localhost:4000/health
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Hot-reloading dev server (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting |
| `npm run db:push` | Sync the Prisma schema to MySQL |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run seed` | (Re)create demo data |

### If `npm install` refuses to run scripts (npm 11+)

npm 11 blocks lifecycle scripts by default. Approve them once with:

```powershell
npm approve-scripts
```

or add the relevant packages to the `allowScripts` field in `package.json`.

### Environment variables (`backend/.env`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` hides verbose errors |
| `PORT` | `4000` | API port |
| `CORS_ORIGINS` | `http://localhost:5173,…` | Comma-separated allowed browser origins |
| `DATABASE_URL` | `mysql://roadwatch:…@127.0.0.1:3306/roadwatch` | Prisma connection string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | placeholder | **Change in production** |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | `15m` / `30d` | Token lifetimes |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `STORAGE_LOCAL_DIR` | `uploads` | Where images are written (not in the database) |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | Prefix used to build image URLs |
| `MAX_UPLOAD_BYTES` | `8388608` | Max size per photo (8 MB) |
| `IMAGE_PROCESSING_ENABLED` | `false` | Optional analysis module |
| `GOOGLE_MAPS_SERVER_API_KEY` | empty | Optional — prefer Google geocoding (free OpenStreetMap Nominatim by default) |

---

## 3. Web platform

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project\web"
copy .env.example .env
npm install
npm run dev         # http://localhost:5173
```

`web/.env`:

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:4000` | Where the API lives |

That is the only variable. The web platform draws its map with **Leaflet on
OpenStreetMap tiles — no API key, no account, no billing.**

Sign in with `admin@roadwatch.gov` / `Admin@12345`.

Other scripts: `npm run build` (type-check + production bundle into `dist/`),
`npm run preview` (serve the build), `npm run typecheck`.

> The backend only accepts browser requests from origins listed in `CORS_ORIGINS`.
> Vite's default port 5173 is already included; if you change the port, update the
> backend variable too.

---

## 4. Mobile app (Flutter)

```powershell
cd "C:\School\3RD YEAR\ADVWEB\Project\mobile"
flutter pub get
```

Run against the backend, choosing whichever device you have:

```powershell
# Windows desktop
flutter run -d windows --dart-define=API_BASE_URL=http://localhost:4000

# Chrome / Edge
# Use a fixed port: the backend's CORS allow-list covers 3000/5173, and
# `flutter run -d chrome` otherwise picks a random port that gets blocked.
flutter run -d chrome --web-port=3000 --dart-define=API_BASE_URL=http://localhost:4000

# Android emulator (the app rewrites localhost to 10.0.2.2 automatically)
flutter run -d emulator-5554 --dart-define=API_BASE_URL=http://localhost:4000
```

**Maps need no key.** Every map in the app is drawn with `flutter_map` on
OpenStreetMap tiles, so there is nothing to configure — on Android, iOS, web or
desktop. Attribution is shown in the corner of each map.

Checks: `flutter analyze lib` and `flutter test`.

---

## 5. Running the whole stack

Three terminals:

1. `backend/` → `npm run dev`
2. `web/` → `npm run dev`
3. `mobile/` → `flutter run …`

Then walk the end-to-end flow in [`TESTING.md`](TESTING.md):
citizen submits → admin approves → admin assigns → officer progresses → officer completes →
public map shows the finished repair.

---

## Troubleshooting

**`P1000: Authentication failed against database server`**
`db/setup.sql` has not been run, or `DATABASE_URL` does not match the credentials it created.

**`Plugin caching_sha2_password could not be loaded`**
You are using the MariaDB client that ships with XAMPP. Use the MySQL 8.0 client at
`C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe`.

**Prisma ignores my `.env`**
This project uses `prisma.config.ts`, which disables Prisma's automatic `.env` loading.
It imports `dotenv/config` itself — keep the `dotenv` dependency installed.

**CORS error in the browser console**
Add your web origin to `CORS_ORIGINS` in `backend/.env` and restart the backend.

**Map is blank / tiles do not load**
Every platform uses OpenStreetMap tiles, so a blank map almost always means the
device is offline, a firewall/proxy is blocking `tile.openstreetmap.org`, or the
tiles are rate-limited (OSM throttles heavy anonymous traffic). The report list
view on the public map screen stays fully functional either way.

**`flutter run` cannot find the API on Android**
Use `10.0.2.2` instead of `localhost`, or pass
`--dart-define=API_BASE_URL=http://10.0.2.2:4000`.
