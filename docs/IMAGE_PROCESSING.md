# Optional image-processing module

Automatic image analysis is a **separate, optional module**. It is **disabled by default**,
and the whole system works exactly as a plain upload system when it is off.

Its hard requirement: *a failure here must never break report submission, moderation, the
public map, or maintenance.*

---

## 1. How it is isolated

Everything lives behind one interface:

`backend/src/services/imageProcessing/index.ts`

```ts
export interface ImageProcessingService {
  readonly name: string;
  readonly enabled: boolean;
  analyze(request: ImageAnalysisRequest): Promise<ImageAnalysisOutcome>;
  compareBeforeAfter?(beforeUrl: string, afterUrl: string): Promise<ImageAnalysisOutcome>;
}
```

The rest of the codebase only ever calls `getImageProcessing()`. It never imports a
concrete provider, so providers can be swapped without touching any feature module.

Two implementations ship today:

| Implementation | When it is used | Behaviour |
| --- | --- | --- |
| `NoopImageProcessingService` | default | `enabled = false`, `analyze()` returns `SKIPPED` |
| `HttpImageProcessingService` | when configured | POSTs JSON to a remote analysis API |

Analysis is dispatched through `scheduleImageAnalysis()`, which:

- returns immediately if the module is disabled,
- runs **fire-and-forget**, and
- catches every error and logs a warning.

Results are stored in their own table, `ImageAnalysisResult`, linked to the report and
optionally to a specific photo. Nothing in the report, moderation or map tables depends on
that table, so analysis can fail, lag, or be deleted without any effect on core flows.

---

## 2. Enabling it

Set these in `backend/.env`:

```ini
IMAGE_PROCESSING_ENABLED=true
IMAGE_PROCESSING_PROVIDER=roadwatch-ai     # free-form label, recorded with results
IMAGE_PROCESSING_API_URL=https://ai.example.com/roadwatch
IMAGE_PROCESSING_API_KEY=<bearer token>
```

Restart the backend. `GET /health` will then report `"imageProcessing": "<provider>"`.

To turn it back off, set `IMAGE_PROCESSING_ENABLED=false` (or clear the API URL) and
restart. No migration or code change is required.

---

## 3. The provider contract

The backend calls two endpoints on `IMAGE_PROCESSING_API_URL`.

### `POST {API_URL}/analyze`

```json
{
  "reportId": "clx…",
  "photoId": "clx…",
  "imageUrl": "https://api.roadwatch.example/api/files/by-key/…"
}
```

### `POST {API_URL}/compare`

```json
{
  "beforeUrl": "https://…",
  "afterUrl": "https://…"
}
```

Both are called with:

- `Content-Type: application/json`
- `Authorization: Bearer <IMAGE_PROCESSING_API_KEY>` (when the key is set)
- a 30-second timeout; a timeout is treated as a failure

Expected response:

```json
{
  "result": { "labels": ["pothole"], "severity": "high" },
  "confidence": 0.87
}
```

Any 2xx JSON body is accepted; if `result` is absent the whole body is stored as the
result. Non-2xx responses and network errors are recorded as `FAILED` with an error
message.

> **Important:** `imageUrl` is a URL the provider must be able to fetch. For photos on
> reports that are not yet approved, the file endpoint requires authentication — so an
> external provider will only be able to fetch images from **approved** reports, or you
> must give it a dedicated access path. Keep this in mind when designing the AI service.

---

## 4. Stored results

`ImageAnalysisResult` columns:

| Column | Purpose |
| --- | --- |
| `reportId` | Which report the analysis belongs to |
| `photoId` | Which photo (nullable) |
| `provider` | Value of `IMAGE_PROCESSING_PROVIDER` |
| `status` | `SKIPPED` / `COMPLETED` / `FAILED` |
| `result` | JSON payload from the provider |
| `confidence` | Optional 0–1 score |
| `error` | Failure message, when applicable |
| `createdAt` | When the analysis finished |

Because the table is independent, you can re-run analysis later, keep multiple providers'
opinions side by side, or purge the table entirely — none of it affects the core workflow.

---

## 5. Ideas this module is ready for

- automatic pothole / crack detection,
- suggested issue category (to assist moderation),
- image quality checks, e.g. flagging a dark or blurry photo before review,
- duplicate-image detection across reports,
- estimated damage severity for prioritisation,
- before/after comparison to help verify a completed repair.

Each of these is a new provider implementing the same interface, or a new consumer of the
`ImageAnalysisResult` rows. None of them require changing the report, moderation, map or
maintenance code.

---

## 6. Testing the module

With `IMAGE_PROCESSING_ENABLED=false`:

1. Submit a report from the mobile app.
2. Approve it in the web platform.
3. Confirm everything completes exactly as before, and that no rows appear in
   `ImageAnalysisResult`.

With it enabled but pointing at an unreachable URL:

1. Submit a report.
2. Confirm the submission still succeeds and the photos are stored.
3. Confirm the backend logs `Image analysis failed (non-fatal)`.
4. Confirm a `FAILED` row is written to `ImageAnalysisResult`.
5. Confirm the report still appears correctly on the map and in the queues.

That second scenario is the whole point of the module's design: **the optional feature may
fail loudly in the logs, but the product keeps working.**
