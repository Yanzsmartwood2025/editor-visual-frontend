# Cloudflare R2 lifecycle safety net

Final renders are stored under the `renders/` prefix of `CLOUDFLARE_R2_BUCKET`. Configure this manually in Cloudflare Dashboard: **R2 → bucket → Settings → Lifecycle rules → Add rule**, select prefix `renders/`, then choose **Delete objects after 1 day**. This is intentionally a dashboard setting: the application never receives Cloudflare account-wide lifecycle permissions.

The application deletes an object through `DELETE /api/r2/delete` when an external publisher confirms delivery. Metricool is deliberately not integrated yet, so that publisher must call this endpoint later with a Firebase Bearer token and the stored R2 object key.
