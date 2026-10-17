# RoadWatch — Route / API Contract Verification

Generated during independent verification. Source of truth: **`backend/src/routes.php`**
(PHP API). Runtime results come from `backend/tests/api_integration.mjs`
(**103 checks, 103 passed**) run against `php -S 127.0.0.1:4000 -t public router.php`.

Legend: **Auth** = access requirement · **Runtime** = exercised by the integration
suite · **Web** = used by the vanilla web client · **Mobile** = used by the Flutter client.

---

## 1. Backend route table (35 routes)

| # | Method | Path | Auth | Runtime | Web | Mobile |
|---|---|---|---|---|---|---|
| 1 | GET | `/` | public | ✓ | — | — |
| 2 | GET | `/health` | public | ✓ | — | — |
| 3 | POST | `/api/auth/register` | public | ✓ | ✓ | ✓ |
| 4 | POST | `/api/auth/login` | public | ✓ | ✓ | ✓ |
| 5 | POST | `/api/auth/refresh` | public | ✓ | ✓ | ✓ |
| 6 | POST | `/api/auth/logout` | public | ✓ | ✓ | ✓ |
| 7 | GET | `/api/auth/me` | bearer | ✓ | ✓ | ✓ |
| 8 | POST | `/api/reports` | bearer (any) | ✓ | ✓ | ✓ |
| 9 | GET | `/api/reports/mine` | bearer (any) | ✓ | ✓ | ✓ |
| 10 | GET | `/api/reports/stats` | admin | ✓ | ✓ | — |
| 11 | GET | `/api/reports` | staff | ✓ | ✓ | — |
| 12 | GET | `/api/reports/{id}/history` | bearer / public if approved | ✓ | ✓ | ✓ |
| 13 | POST | `/api/reports/{id}/photos` | owner / staff | ✓ | — | — |
| 14 | PATCH | `/api/reports/{id}/moderation` | admin | ✓ | ✓ | — |
| 15 | POST | `/api/reports/{id}/assign` | admin | ✓ | ✓ | — |
| 16 | PATCH | `/api/reports/{id}/repair` | assigned officer / admin | ✓ | ✓ | — |
| 17 | DELETE | `/api/reports/{id}` | owner (pending) | ✓ | ✓ | ✓ |
| 18 | GET | `/api/reports/{id}` | bearer / public if approved | ✓ | ✓ | ✓ |
| 19 | GET | `/api/maintenance/assignments` | officer | ✓ | ✓ | — |
| 20 | GET | `/api/maintenance/summary` | officer | ✓ | ✓ | — |
| 21 | GET | `/api/map/reports` | public | ✓ | ✓ | ✓ |
| 22 | GET | `/api/map/reports/{id}` | public / bearer | ✓ | ✓ | ✓ |
| 23 | GET | `/api/map/geocode/reverse` | public | ✓ | ✓ | ✓ |
| 24 | GET | `/api/map/geocode/search` | public | ✓ | ✓ | ✓ |
| 25 | GET | `/api/files/by-key/{key}` | public if approved, else bearer | ✓ | ✓ | ✓ |
| 26 | GET | `/api/users/me` | bearer | ✓ | ✓ | ✓ |
| 27 | PATCH | `/api/users/me` | bearer | ✓ | ✓ | ✓ |
| 28 | POST | `/api/users/me/password` | bearer | ✓ | ✓ | ✓ |
| 29 | GET | `/api/users/officers` | admin | ✓ | ✓ | — |
| 30 | GET | `/api/users` | admin | ✓ | ✓ | — |
| 31 | POST | `/api/users` | admin | ✓ | ✓ | — |
| 32 | PATCH | `/api/users/{id}` | admin | ✓ | ✓ | — |
| 33 | POST | `/api/users/{id}/reset-password` | admin | ✓ | ✓ | — |
| 34 | GET | `/api/analytics/summary` | admin | ✓ | ✓ | — |
| 35 | GET | `/api/analytics/audit-logs` | admin | ✓ | ✓ | — |

All 35 routes were executed by the integration suite (not just inspected).

---

## 2. Web client (`web/js/api.js`) — endpoint match

`web/js/api.js` is the *correct* API client: every path it builds resolves to one of
the 35 routes above, 1:1, including `/api/maintenance/assignments`,
`/api/analytics/audit-logs`, and `/api/files/by-key/…` (see §4). It matches the
backend contract for methods, query params, and multipart field names.

**However** `api.js` is an ES module that **nothing loads** — `web/index.html`
includes only `js/app.js` (which is broken; see the verification report). So the
"match" is a property of the file, not of the running site.

---

## 3. Mobile client (`mobile/lib/services/roadwatch_api.dart`) — endpoint match

| Mobile method | Endpoint | Match |
|---|---|---|
| `login` / `register` / `refresh` / `logout` | `/api/auth/*` | ✓ |
| `me` | `GET /api/auth/me` | ✓ |
| `createReport` (multipart) | `POST /api/reports` | ✓ |
| `myReports` (`page`,`pageSize`,`moderationStatus`,`repairStatus`,`search`) | `GET /api/reports/mine` | ✓ |
| `report` | `GET /api/reports/{id}` | ✓ (default `auth: true`) |
| `reportHistory` | `GET /api/reports/{id}/history` | ✓ |
| `deleteReport` | `DELETE /api/reports/{id}` | ✓ |
| `publicMapReports` | `GET /api/map/reports` | ✓ |
| `publicReportDetail` | `GET /api/map/reports/{id}` | ✓ (but sends bearer by default — see §4) |
| `reverseGeocode` / `searchPlace` | `/api/map/geocode/*` | ✓ |

The mobile app is citizen-scoped; it does not call the admin/officer routes, which is
consistent with its role.

---

## 4. Mismatches found and resolution

### FIXED — "public map detail" returned 403 for signed-in citizens
- **Symptom:** `GET /api/map/reports/{id}` and `GET /api/reports/{id}` answered
  **403** to a logged-in CITIZEN opening *another* user's **APPROVED** report.
  `MapController::report` / `ReportsController::show` routed authenticated callers
  through `ReportService::getForActor`, and `canViewReport` restricts a citizen to
  `citizenId === actor id`.
- **Impact:** the public map pin detail on **web** and **mobile** broke for every
  signed-in citizen (the Flutter client sends the bearer token by default), while
  the anonymous case worked.
- **Fix:** added `ReportService::getForViewer()`; approved reports now fall back to
  the public view for any authenticated viewer, and only non-approved reports stay
  forbidden. Applied in `MapController::report` and `ReportsController::show`.
- **Evidence:** integration checks `map detail for approved is visible to a
  signed-in citizen 200`, `… to its owner 200`, and
  `GET /api/reports/:id shows another citizen's approved report 200` (previously
  403); pending reports still return 404 (anonymous) / 403 (authenticated).

### Web `app.js` uses stale/incorrect endpoints (client-side, being repaired)
Fresh web audit of `web/js/app.js` (the only script `index.html` loads):

| app.js call | Problem | Correct endpoint |
|---|---|---|
| `GET /reports/assigned` | route does not exist | `GET /api/maintenance/assignments` |
| `GET /audit/logs` | route does not exist | `GET /api/analytics/audit-logs` |
| `POST /reports` (JSON body) | backend requires **multipart** with a photo | `POST /api/reports` (FormData, `photos[]`) |
| `${API_BASE}/files/${storageKey}` | wrong path shape | use the photo's `url` (→ `/api/files/by-key/{key}`) |
| `/reports/mine` used for the public map | returns the caller's reports only | `GET /api/map/reports` |

These are fixed in the repaired `web/js/app.js`; verified in a real browser (see
`docs/independent-verification-report.md`).

### Documented — moderation request field is `reason`, not `rejectionReason`
`PATCH /api/reports/{id}/moderation` takes `{ decision: "APPROVE"|"REJECT", reason? }`.
The **response** DTO field is `rejectionReason`. No current client sends a
moderation request (web/mobile have no moderation UI), so nothing is broken, but any
future client must send `reason` when rejecting.

---

## 5. Response envelope (shared by all clients)

- Success: the resource directly, e.g. `{ "report": {…} }`, `{ "items": […], "total", "page", "pageSize", "totalPages" }`, `{ "user": {…} }`, `{ "history": […] }`, `{ "officers": […] }`, `{ "logs": […] }`.
- Error: `{ "error": { "code": "…", "message": "…", "details"?: […] } }` with the status codes exercised by the suite (400/401/403/404/409/415/422/429).
