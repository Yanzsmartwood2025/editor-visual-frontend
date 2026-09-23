# Nayla Social Hub

Nayla REDES uses a provider-neutral social layer. The UI never depends on a provider response shape.

## Routes

- Ruta A: Upload-Post
- Ruta B: Zernio

A connected account stores its provider and native account id. Publishing, analytics, comments and inbox calls are normalized by Nayla before reaching the editor.

## Server environment

Required to activate each route:

```
UPLOAD_POST_API_KEY=
UPLOAD_POST_WEBHOOK_SECRET=
UPLOAD_POST_PROFILE_LIMIT=2

ZERNIO_API_KEY=
ZERNIO_WEBHOOK_SECRET=
ZERNIO_ACCOUNT_LIMIT=2
```

Provider keys are server-only. Never expose them with `NEXT_PUBLIC_`.

Upload-Post Free is profile-based: the current free tier includes 2 provider profiles, and each profile can connect one account per supported platform. Nayla currently uses one Upload-Post profile per project, so Route A is not capped at two social accounts; it can hold one connected account on each different platform. If the same platform already occupies Route A, Nayla can use Route B when it has free capacity. Zernio's free tier currently includes 2 connected social accounts. Each connected account keeps its provider identity, so publishing is sent through the route that owns that account.

## API

- `GET /api/social/overview`: accounts, activity, comments, conversations and response policy.
- `POST /api/social/connect`: start OAuth for a selected platform/provider.
- `POST /api/social/sync`: reconcile provider accounts into Supabase.
- `POST /api/social/publish`: publish a Bóveda result to selected destinations.
- `GET|POST /api/social/comments`: list and reply to comments.
- `GET|POST /api/social/inbox`: Zernio conversational inbox and replies.
- `GET /api/social/analytics`: provider analytics behind a normalized editor route.
- `POST /api/social/policy`: stores Nayla response mode/tone/instructions.
- `POST /api/social/webhooks/upload-post`: signed Upload-Post events.
- `POST /api/social/webhooks/zernio`: signed Zernio events.

## Supabase

The live `naylacore` database contains:

- `social_profiles`
- `social_accounts`
- `social_posts`
- `social_post_targets`
- `social_comments`
- `social_conversations`
- `social_messages`
- `social_metrics_snapshots`
- `social_ai_policies`
- `social_webhook_events`
- `social_usage_ledger`

All social tables have RLS enabled and no browser policies. Access is intentionally server-only through the existing Firebase-authenticated Next.js API and Supabase service role.

`social_usage_ledger` records raw usage without locking in customer pricing. Packages, credits or per-action billing can be layered on later.

## Current UI

REDES exposes five own-brand views: Inicio, Publicar, Inbox, Datos and IA. Users see social networks and their own accounts; provider routing is shown only as Ruta A / Ruta B for diagnostics.

## Webhooks

Upload-Post verification uses HMAC-SHA256 over `<timestamp>.<raw body>`. Zernio uses HMAC-SHA256 over the raw body. Both routes reject invalid signatures before persisting events.

> Nota operativa: las credenciales sociales se leen desde Vercel y requieren un despliegue nuevo después de cualquier cambio de variables de entorno.
