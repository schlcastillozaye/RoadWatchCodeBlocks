# RoadWatch API Reference

Base URL in development: `http://localhost:4000`

All request and response bodies are JSON unless stated otherwise. Photo uploads use
`multipart/form-data`.

---

## Conventions

### Authentication

Send the access token as a bearer header:

```
Authorization: Bearer <accessToken>
```

Access tokens are short-lived (default 15 minutes). Exchange the refresh token at
`POST /api/auth/refresh` to get a new pair. Refresh tokens **rotate**: each refresh
returns a new refresh token and invalidates the previous one.

### Errors

Failures return an HTTP status plus a JSON envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title must be at least 4 characters",
    "details": [{ "path": ["title"], "message": "Title must be at least 4 characters" }]
  }
}
```

| Status | Meaning |
| --- | --- |
| 400 | Malformed request / validation error |
| 401 | Missing, expired or invalid token |
| 403 | Authenticated but not permitted (RBAC) |
| 404 | Not found (or not visible to this actor) |
| 409 | Conflict with the current state (e.g. photo added to a moderated report) |
| 422 | Well-formed but business rules not satisfied (e.g. completion without a photo) |
| 429 | Rate limited |
| 500 | Unexpected server error |

### Pagination

List endpoints return:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20, "totalPages": 1 }
```

### Roles

`CITIZEN`, `MAINTENANCE_OFFICER`, `ADMIN`.

---

## Health

### `GET /health`

No authentication. Reports service and dependency status.

```json
{
  "status": "ok",
  "service": "roadwatch-api",
  "database": "up",
  "storage": "local",
  "imageProcessing": "disabled",
  "time": "2026-01-01T00:00:00.000Z"
}
```

---

## Authentication — `/api/auth`

Rate limited to 30 requests / 15 minutes per IP.

### `POST /api/auth/register`

Public. Creates a **citizen** account only; staff accounts are created by an administrator.

```json
{
  "fullName": "Juan Dela Cruz",
  "email": "juan@example.com",
  "password": "Secret@12345",
  "phone": "09171234567"
}
```

**201**

```json
{
  "user": { "id": "clx…", "fullName": "Juan Dela Cruz", "email": "juan@example.com", "role": "CITIZEN" },
  "accessToken": "eyJ…",
  "refreshToken": "9f2c…"
}
```

### `POST /api/auth/login`

```json
{ "email": "admin@roadwatch.gov", "password": "Admin@12345" }
```

**200** — same shape as register.

### `POST /api/auth/refresh`

```json
{ "refreshToken": "9f2c…" }
```

**200** — a new `accessToken` and a new (rotated) `refreshToken`.

### `POST /api/auth/logout`

```json
{ "refreshToken": "9f2c…" }
```

**200** `{ "success": true }` — revokes that refresh token.

### `GET /api/auth/me`

Auth required. Returns the current user: `{ "user": { … } }`.

---

## Reports — `/api/reports`

### `POST /api/reports`

Auth required (any role). **`multipart/form-data`**.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `title` | text | yes | 4–160 characters |
| `description` | text | yes | 10–4000 characters |
| `category` | text | yes | `POTHOLE`, `DAMAGED_PAVEMENT`, `ROAD_CRACK`, `FLOODING`, `DAMAGED_DRAINAGE`, `OTHER` |
| `latitude` | text | yes | −90…90 |
| `longitude` | text | yes | −180…180 |
| `addressText` | text | no | ≤ 500 characters |
| `areaLabel` | text | no | ≤ 160 characters |
| `priority` | text | no | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| `photos` | files | yes (≥1) | Before photos, one or more |

**201** `{ "report": { … } }`

A unique human-readable reference number (`RW-2026-000123`) is generated in a transaction.

```powershell
curl -X POST http://localhost:4000/api/reports `
  -H "Authorization: Bearer $TOKEN" `
  -F "title=Deep pothole on Mabini St" `
  -F "description=About 40cm wide and getting deeper every week." `
  -F "category=POTHOLE" `
  -F "latitude=14.7942" -F "longitude=120.8790" `
  -F "areaLabel=Barangay San Jose" `
  -F "photos=@C:\path\pothole.jpg"
```

### `GET /api/reports/mine`

Auth required. The caller's own reports. Supports the [list query](#list-query-parameters).

### `GET /api/reports`

Auth required, **staff only** (officer or admin). All reports, filterable.

#### List query parameters

| Parameter | Values | Default |
| --- | --- | --- |
| `page` | ≥ 1 | `1` |
| `pageSize` | 1–100 | `20` |
| `search` | text (title/description/reference) | — |
| `category` | category enum | — |
| `priority` | priority enum | — |
| `moderationStatus` | `PENDING_REVIEW` / `APPROVED` / `REJECTED` | — |
| `repairStatus` | `NOT_ASSIGNED` / `AWAITING_MAINTENANCE` / `IN_PROGRESS` / `COMPLETED` | — |
| `areaLabel` | text | — |
| `assignedOfficerId` | id | — |
| `citizenId` | id | — |
| `from` / `to` | ISO date | — |
| `sort` | `newest` / `oldest` / `priority` | `newest` |

### `GET /api/reports/:id`

Optional auth.

- Anonymous: only `APPROVED` reports (public view — reporter identity hidden).
- Citizen: own reports.
- Officer: reports assigned to them, plus any approved report.
- Admin: everything.

**200** `{ "report": { … } }`

### `GET /api/reports/:id/history`

Same visibility rules. Returns the audit-grade status timeline:

```json
{
  "history": [
    {
      "id": "clx…",
      "type": "MODERATION",
      "fromValue": "PENDING_REVIEW",
      "toValue": "APPROVED",
      "note": "Verified against the photo.",
      "actorRole": "ADMIN",
      "actor": { "id": "clx…", "fullName": "System Administrator" },
      "createdAt": "2026-01-01T09:15:00.000Z"
    }
  ]
}
```

### `POST /api/reports/:id/photos`

Auth required. **`multipart/form-data`**. Adds photos to an existing report.

| Field | Notes |
| --- | --- |
| `kind` | `BEFORE` (default), `PROGRESS` or `AFTER` |
| `photos` / `progressPhotos` / `afterPhotos` | Files for the given kind |

Citizens may add `BEFORE` photos **only while the report is pending**. Staff/assigned
officers may add progress and completion photos.

**201** `{ "report": { … } }`

### `PATCH /api/reports/:id/moderation`

**Admin only.** Sets the moderation track.

```json
{ "decision": "APPROVE", "priority": "HIGH" }
```

```json
{ "decision": "REJECT", "reason": "The photo does not show a road defect." }
```

- `reason` is **mandatory** when rejecting (minimum 5 characters).
- `priority` is optional and only applied on approval.

**200** `{ "report": { … } }`

### `POST /api/reports/:id/assign`

**Admin only.** Assigns an approved report to a maintenance officer.

```json
{
  "officerId": "clx…",
  "priority": "HIGH",
  "note": "Coordinate with the barangay for traffic rerouting.",
  "dueDate": "2026-02-01T00:00:00.000Z"
}
```

Sets the repair track to `AWAITING_MAINTENANCE`. **200** `{ "report": { … } }`

### `PATCH /api/reports/:id/repair`

**Admin, or the assigned officer.** JSON body.

```json
{
  "repairStatus": "IN_PROGRESS",
  "note": "Crew dispatched, patching scheduled for tomorrow."
}
```

```json
{
  "repairStatus": "COMPLETED",
  "note": "Work finished and the road reopened.",
  "completionNotes": "Cold-mix patched, compacted and levelled with surrounding asphalt.",
  "overrideCompletion": false
}
```

Business rules:

- Only **approved** reports accept maintenance updates.
- Only the **assigned officer** (or an admin) may update.
- `COMPLETED` requires `completionNotes` (≥ 5 characters) **and** at least one `AFTER` photo.
- An **admin** may set `"overrideCompletion": true` to complete without a photo; this is
  recorded in the audit log and flagged on the report.

**200** `{ "report": { … } }`

### `DELETE /api/reports/:id`

Auth required. An admin may delete any report; a citizen may withdraw **their own report
only while it is still `PENDING_REVIEW`**.

---

## Maintenance — `/api/maintenance`

**Maintenance officers only.**

### `GET /api/maintenance/assignments`

Approved reports assigned to the caller. Supports the [list query parameters](#list-query-parameters).

### `GET /api/maintenance/summary`

```json
{ "assigned": 12, "awaiting": 3, "inProgress": 5, "completed": 4 }
```

---

## Public map — `/api/map`

### `GET /api/map/reports`

**No authentication.** Returns **approved reports only** — pending and rejected reports are
filtered out in SQL and can never appear here.

Query: `page`, `pageSize` (1–100), `category`, `repairStatus`, `areaLabel`, `from`, `to`.

```json
{
  "items": [
    {
      "id": "clx…",
      "referenceNo": "RW-2026-000123",
      "title": "Deep pothole on Mabini St",
      "category": "POTHOLE",
      "priority": "HIGH",
      "latitude": 14.7942,
      "longitude": 120.879,
      "addressText": "Mabini St, Barangay San Jose",
      "areaLabel": "Barangay San Jose",
      "repairStatus": "IN_PROGRESS",
      "moderationStatus": "APPROVED",
      "createdAt": "2026-01-01T08:00:00.000Z",
      "updatedAt": "2026-01-03T10:00:00.000Z",
      "thumbnailUrl": "http://localhost:4000/api/files/by-key/uploads%2F…"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

### `GET /api/map/reports/:id`

Public detail for an approved report. Returns 404 for anything not approved.

### `GET /api/map/geocode/reverse?lat=…&lng=…`

No authentication. Converts coordinates to an address.

```json
{ "available": true, "address": "Mabini Street, Malolos", "areaLabel": "Barangay San Jose" }
```

When `GOOGLE_MAPS_SERVER_API_KEY` is not set, `available` is `false` and the clients fall
back to manual address entry.

---

## Files — `/api/files`

### `GET /api/files/by-key/:key`

Serves a stored image.

- Photos on **approved** reports are public (`Cache-Control: public, max-age=86400`).
- All other photos require a bearer token and are limited to the owning citizen or staff.
- Storage keys are random and never expose the reporter's identity.

---

## Users — `/api/users`

### Self service (any authenticated role)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/users/me` | Current profile |
| `PATCH` | `/api/users/me` | Update `fullName` / `phone` |
| `POST` | `/api/users/me/password` | `{ currentPassword, newPassword }` |

### Administration (**admin only**)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/users/officers` | Active maintenance officers with their workload |
| `GET` | `/api/users` | Paginated list (`page`, `pageSize`, `role`, `status`, `search`) |
| `POST` | `/api/users` | Create a user (`fullName`, `email`, `password`, `role`, `phone?`) |
| `PATCH` | `/api/users/:id` | Update `fullName` / `phone` / `role` / `status` |
| `POST` | `/api/users/:id/reset-password` | `{ newPassword }` |

---

## Analytics — `/api/analytics`

**Admin only.**

### `GET /api/analytics/summary`

```json
{
  "totals": {
    "total": 40, "pending": 5, "approved": 30, "rejected": 5,
    "notAssigned": 8, "awaiting": 6, "inProgress": 9, "completed": 7
  },
  "byCategory": [{ "category": "POTHOLE", "count": 14 }],
  "byArea": [{ "area": "Barangay San Jose", "count": 9 }],
  "recent": [ { "id": "clx…", "title": "…", "referenceNo": "RW-2026-000130" } ]
}
```

### `GET /api/analytics/audit-logs?limit=100`

```json
{
  "logs": [
    {
      "id": "clx…",
      "action": "REPAIR_COMPLETED",
      "entityType": "Report",
      "entityId": "clx…",
      "metadata": { "to": "COMPLETED", "override": false },
      "ipAddress": "127.0.0.1",
      "createdAt": "2026-01-05T11:00:00.000Z",
      "actor": { "id": "clx…", "fullName": "Officer One", "role": "MAINTENANCE_OFFICER" }
    }
  ]
}
```

---

## Report object

```json
{
  "id": "clx…",
  "referenceNo": "RW-2026-000123",
  "title": "Deep pothole on Mabini St",
  "description": "About 40cm wide and getting deeper every week.",
  "category": "POTHOLE",
  "priority": "HIGH",
  "latitude": 14.7942,
  "longitude": 120.879,
  "addressText": "Mabini St, Barangay San Jose",
  "areaLabel": "Barangay San Jose",
  "moderationStatus": "APPROVED",
  "repairStatus": "IN_PROGRESS",
  "photos": [
    {
      "id": "clx…",
      "kind": "BEFORE",
      "url": "http://localhost:4000/api/files/by-key/…",
      "mimeType": "image/jpeg",
      "sizeBytes": 248913,
      "width": 1280,
      "height": 960,
      "caption": null,
      "isPublic": true,
      "createdAt": "2026-01-01T08:00:00.000Z"
    }
  ],
  "createdAt": "2026-01-01T08:00:00.000Z",
  "updatedAt": "2026-01-03T10:00:00.000Z",

  "rejectionReason": null,
  "moderatedAt": "2026-01-01T09:15:00.000Z",
  "moderatedBy": { "id": "clx…", "fullName": "System Administrator" },
  "assignedAt": "2026-01-02T07:00:00.000Z",
  "completedAt": null,
  "completionNotes": null,
  "completionOverride": false,
  "citizen": { "id": "clx…", "fullName": "Juan Dela Cruz" },
  "assignedOfficer": { "id": "clx…", "fullName": "Officer One" }
}
```

When `photos[].isPublic` is `true` the URL can be loaded without a token. Otherwise the
client must send the bearer header (the web platform fetches those images as blobs; the
mobile app uses the same authenticated request pipeline).

The fields after `updatedAt` are omitted in public (map) responses.
