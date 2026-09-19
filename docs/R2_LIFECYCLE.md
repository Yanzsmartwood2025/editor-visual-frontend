# Cloudflare R2 media lifecycle

Cloudflare R2 is the persistent Bóveda for NaylaCore.

## Persistent objects

User uploads and completed renders live under the authenticated Firebase UID:

- `<firebase-uid>/<media-id>.<ext>`
- `<firebase-uid>/renders/<render-id>.mp4`

These objects are persistent and should **not** have a short automatic deletion rule.

## Deletion

When a user deletes an item from the Bóveda, the application calls
`DELETE /api/r2/delete` with Firebase authentication. The API only accepts an
R2 key under the exact authenticated UID prefix.

## Temporary objects

The current architecture does not require temporary R2 uploads for rendering or
delogo input. If a future feature introduces temporary files, store them under a
dedicated prefix such as `temp/` and apply any short lifecycle rule only to that
prefix.
