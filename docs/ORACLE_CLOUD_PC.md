# Oracle Cloud PC and Vercel/Coolify runtime setup

The database should not be accessed directly from this frontend. For now, the editor should keep
sending heavy render and media-processing work to the Oracle Cloud PC worker through
`ORACLE_SERVER_URL` and `ORACLE_SECRET`.

## Required runtime variables

- `ORACLE_SERVER_URL`: base URL for the Oracle Cloud PC worker used by render, clip processing,
  render status, and cancellation endpoints.
- `ORACLE_SECRET`: bearer token shared between the Next.js API routes and the Oracle worker.
- `GROQ_API_KEY`: Groq key configured in Vercel/Coolify for the Nayla Fast provider.
- `MISTRAL_API_KEY`: Mistral key configured in Vercel/Coolify for the Nayla Pro/fallback provider.

## AI key strategy

The AI endpoints now prefer provider keys from environment variables so you can test directly in
Vercel/Coolify without depending on the key-pool table. The existing database key pool remains only
as a temporary fallback while the rest of the tools are stabilized.

## Current compatibility layer

Several existing modules still use `@supabase/supabase-js` for auth, storage, and the old API-key
pool fallback. Keep the Supabase-compatible variables configured only for those legacy flows until
we replace them with Oracle/Coolify APIs:

- `src/pages/index.tsx` creates the browser client for auth/storage.
- `src/utils/apiKeyManager.ts` expects an `api_keys_pool` table-like API when env keys are missing.
- Media search APIs upload assets to a `media_bodega` storage-compatible bucket.
- `oracle-service/server.js` uploads rendered videos to the same storage-compatible bucket.

## Recommended next steps

1. Keep the database untouched while testing the editor and AI tools.
2. Configure `GROQ_API_KEY` and `MISTRAL_API_KEY` in Vercel/Coolify first.
3. Verify `/api/chat` and `/api/supervisor` using those env keys.
4. Later, replace auth/storage/key-pool fallback flows with Oracle/Coolify APIs one module at a time.
