# RoadWatch — End-to-end test checklist

Use this after setup to verify the whole system, not just individual screens.
Tick each box as you go.

---

## Automated tests (run these first)

These cover most of the checklist below without manual clicking:

| Layer | Command | Expect |
| --- | --- | --- |
| PHP API | `node backend/tests/api_integration.mjs` | `103 passed, 0 failed` |
| Schema | `php backend/database/migrate.php` | `9 tables`, idempotent |
| Mobile | `cd mobile; flutter analyze; flutter test` | No issues · 12/12 pass |
| Web | `node web/tests/e2e.mjs` | browser E2E (see script output) |

> The section names below use the original Node (`npm run …`) commands. With the PHP
> backend, replace them with: `php database/migrate.php` (≈ `db:push`),
> `php seed.php` (≈ `seed`), and `php -S 127.0.0.1:4000 -t public router.php` (≈ `dev`).
> The web app has **no build step** — serve `web/` with any static server.

---

## 0. Pre-flight

- [ ] `db/setup.sql` has been run (or a dedicated DB exists) and the schema is applied.
- [ ] `backend/.env` points at that database and `php database/migrate.php` succeeded.
- [ ] `php seed.php` completed without errors.
- [ ] `GET http://localhost:4000/health` returns `"status": "ok"` and `"database": "up"`.
- [ ] The PHP API (`php -S …`), a static server for `web/`, and the Flutter app are running.

---

## 1. Authentication

- [ ] `POST /api/auth/login` with `admin@roadwatch.gov` / `Admin@12345` returns a user, access token and refresh token.
- [ ] The web platform signs in and lands on the admin dashboard.
- [ ] The Flutter app signs in as `citizen@example.com` / `Citizen@12345`.
- [ ] Signing in with a wrong password shows a clear message (and does not crash).
- [ ] Registering a new citizen from the mobile app works.
- [ ] An unauthenticated request to `GET /api/reports` returns **401**.
- [ ] A citizen calling `GET /api/reports` (staff-only) gets **403**.
- [ ] Access token expiry triggers an automatic refresh instead of a logout (web and mobile).

## 2. Server-side RBAC (not just hidden buttons)

| Call | Expected |
| --- | --- |
| Officer → `PATCH /api/reports/:id/moderation` | **403** |
| Officer → `POST /api/reports/:id/assign` | **403** |
| Officer → `PATCH /api/reports/:id/repair` for a report **not** assigned to them | **403** |
| Admin → `PATCH /api/reports/:id/moderation` | **200** |
| Admin → `POST /api/reports/:id/assign` | **200** |
| Officer → `GET /api/users` | **403** |
| Officer → `GET /api/analytics/summary` | **403** |
| Admin → `GET /api/analytics/summary` | **200** |

- [ ] All rows above verified with real requests (curl, Postman, or the browser console).

## 3. Citizen submission (mobile)

- [ ] Take a photo with the camera and attach it.
- [ ] Attach a photo from the gallery instead.
- [ ] A pin is set using the current GPS location.
- [ ] Alternatively, pick the location manually / place a pin on the map.
- [ ] Submitting shows an upload progress indicator.
- [ ] On success the report appears in **My reports** with `PENDING_REVIEW` and `NOT_ASSIGNED`.
- [ ] Submitting with an empty title, a too-short description, or no photo is blocked with a readable message.
- [ ] A unique reference number (`RW-YYYY-NNNNNN`) is issued and visible.
- [ ] Photos are written to the storage directory, **not** into database rows.
- [ ] The category picker offers Pothole, Road cracks, Damaged pavement,
      Flooding or water accumulation, Road obstruction and Other.
- [ ] Choosing **Other** reveals a required description field; submitting without
      it is blocked; the text is saved and shown with the report.
- [ ] Choosing any other category hides the description field and never sends it.
- [ ] A report filed before this change still opens and shows its category.

## 4. Moderation (web, admin)

- [ ] The new report appears in the review queue (`PENDING_REVIEW`).
- [ ] The report is **not** on the public map while pending.
- [ ] `GET /api/map/reports` does not include it.
- [ ] Rejecting without a reason is refused by the server (**400**).
- [ ] Rejecting with a reason works; the citizen sees the reason in the mobile app.
- [ ] A rejected report still never appears on the public map.
- [ ] Approving another report clears it from the queue and puts it on the public map.
- [ ] Both decisions appear in the report's progress timeline.
- [ ] Both decisions appear in the audit log.

## 5. Assignment (web, admin)

- [ ] Only administrators see the assign action.
- [ ] The officer list shows each officer's current active workload.
- [ ] Assigning sets the repair status to `AWAITING_MAINTENANCE`.
- [ ] The assigned officer now sees the report under **My assignments**.
- [ ] A different officer does **not** see it in their assignment list.
- [ ] The assignment is recorded in the timeline and audit log.

## 6. Maintenance progress (web, officer)

- [ ] The officer opens an assigned report and moves it to `IN_PROGRESS` with a note.
- [ ] The note appears in the timeline.
- [ ] Progress photos uploaded here are stored and visible.
- [ ] Attempting to complete **without completion notes** is refused (**422**).
- [ ] Attempting to complete **without an after photo** is refused (**422**).
- [ ] Completing with notes + an after photo succeeds.
- [ ] The repair status becomes `COMPLETED` and `completedAt` is set.

## 7. Completion override (web, admin)

- [ ] An **officer** cannot complete a repair without an after photo (**422**).
- [ ] An **admin** can, by setting `overrideCompletion: true`.
- [ ] The report shows the override warning.
- [ ] The audit log entry records `"override": true`.

## 8. Public map

- [ ] Approved reports appear on both the mobile public map and the web public map.
- [ ] Marker colours reflect repair status on both platforms.
- [ ] Tapping a marker/card shows details and photos.
- [ ] Filtering by category and repair status works.
- [ ] Pending and rejected reports are absent from every result.
- [ ] Address search on the public map returns OpenStreetMap results and centres the map on them.
- [ ] The web list/Map toggle switches views without losing the current filter.
- [ ] OpenStreetMap attribution is visible on every map.

## 9. Persistence

- [ ] Restart the backend — all reports, statuses and photos are still there.
- [ ] Restart the mobile app — the session is restored or a clean sign-in is requested.
- [ ] Open a report in the web platform and then in the mobile app: the data matches.
- [ ] With the backend stopped, the mobile app shows a connection error rather than crashing, and cached list data is shown where available.

## 10. Security spot-checks

- [ ] A citizen cannot read another citizen's report by guessing its id (**403**/404).
- [ ] A citizen cannot delete an approved report; they can withdraw their own pending one.
- [ ] A photo on a pending report cannot be fetched without a token.
- [ ] A photo on an approved report loads without a token.
- [ ] Storage keys are random and do not leak user ids or emails.
- [ ] Passwords are stored as bcrypt hashes, never in plain text.
- [ ] Refresh tokens are hashed in the database and rotate on every refresh.
- [ ] Reusing an old (rotated) refresh token is rejected.

## 11. Responsiveness

- [ ] Web platform at 1920px, 1280px, 768px and 390px wide — no horizontal scrolling, all actions reachable.
- [ ] The mobile drawer navigation works on small screens.
- [ ] Mobile app on a phone-sized viewport and a tablet-sized viewport.
- [ ] Tables degrade into readable cards on narrow screens.

## 12. Errors and edge cases

- [ ] Uploading a file larger than `MAX_UPLOAD_BYTES` is rejected clearly (**413**).
- [ ] Uploading a non-image file is rejected (**415**).
- [ ] Stopping the backend mid-submission shows a retryable error, and retrying works.
- [ ] A very long description is rejected or truncated per the documented limits.
- [ ] Requests past the rate limit receive **429** with a readable message.

## 13. Optional image-processing module

- [ ] With `IMAGE_PROCESSING_ENABLED=false`, submission/moderation/map/maintenance all behave identically and `ImageAnalysisResult` stays empty.
- [ ] With it enabled but pointing at an unreachable URL, submission **still succeeds**, the backend logs a non-fatal warning, and a `FAILED` row is written.
- [ ] Disabling it again requires no code change and no migration.

---

## Command-line smoke test

A fast way to confirm the core workflow without a UI:

```powershell
$api = "http://localhost:4000"

# 1. Sign in as admin
$login = Invoke-RestMethod -Method Post "$api/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@roadwatch.gov","password":"Admin@12345"}'
$admin = @{ Authorization = "Bearer $($login.accessToken)" }

# 2. Health
Invoke-RestMethod "$api/health" | ConvertTo-Json

# 3. Statistics
Invoke-RestMethod "$api/api/analytics/summary" -Headers $admin | ConvertTo-Json -Depth 4

# 4. Reports queue (staff listing)
Invoke-RestMethod "$api/api/reports?pageSize=5" -Headers $admin | ConvertTo-Json -Depth 3

# 5. Public map feed (no auth) — must contain approved reports only
Invoke-RestMethod "$api/api/map/reports?pageSize=5" | ConvertTo-Json -Depth 3
```

Every call should return data, not an error envelope.

### Automated suites

```powershell
# API (start the server first). Never point this at production data.
$env:RW_API_BASE = "http://127.0.0.1:4000"
node backend/tests/api_integration.mjs

# Config unit checks (photo-URL origin fallback; no server needed)
php backend/tests/config_test.php

# Exercise the upload-size limit deterministically: start the API with a low
# MAX_UPLOAD_BYTES and tell the suite about it, which enables the 413 check.
$env:MAX_UPLOAD_BYTES = "1048576"; $env:RW_MAX_UPLOAD_MB = "1"
node backend/tests/api_integration.mjs

# Web (real browser via playwright-core + Edge; needs the API on :4000)
cd web; node tests/e2e.mjs

# Mobile: unit + widget tests are offline; analyze is clean by default.
cd mobile; flutter analyze; flutter test

# Optional: verify the mobile models against a *live* API's real payloads.
flutter test test/live_contract_test.dart --dart-define=RW_LIVE_API=http://127.0.0.1:4000
```

The live contract test is read-only: it lists approved reports and the demo
citizen's own reports, and asserts the mobile models parse the real responses
(category, `categoryOther`, photo URLs, coordinates and statuses). It is skipped
unless `RW_LIVE_API` is provided.
