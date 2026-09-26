# Nayla Social Intelligence Architecture

Nayla REDES is intentionally split into independent modules. Provider code must never own product memory, pricing, automation or UI state.

## Module boundaries

`src/lib/social/providers/`
: Provider adapters only. They translate Nayla operations to Upload-Post or Zernio. Replacing a provider must not migrate people, memories or conversations.

`src/lib/social/interactions/`
: Normalized event stream. Every inbound/outbound comment or DM is represented independently of its source network.

`src/lib/social/identity/`
: Provider-independent people and per-network identities. Identities from different networks are **not** merged from name similarity alone. Cross-network linking requires strong evidence or owner confirmation.

`src/lib/social/memory/`
: Durable, source-linked, non-sensitive social memory. The extractor skips trivial messages and explicitly excludes sensitive categories. Memory remains in Nayla even if a provider adapter changes.

`src/lib/social/automation/`
: Delayed response policy, classification, queueing, cancellation, retries, rate limits and execution. Provider webhooks never send automatic replies directly.

`src/lib/social/ai/`
: Shared server-side LLM helper used by social memory, suggestions, chat and automation.

`src/lib/social/chat/`
: Nayla Social chat. It reads normalized people, memories, interactions and pending actions; it does not call provider APIs directly.

`src/components/SocialHub.tsx`
: Presentation and user controls only. It talks to Nayla-owned `/api/social/*` endpoints and does not receive provider secrets.

## Data flow

Provider / poll → normalized interaction → identity → memory + automation decision → queue → scheduler → AI → provider adapter.

A manual user response cancels any queued response for the same comment/conversation. The worker re-checks queue state immediately before provider delivery to prevent race-condition duplicates.

## Scheduler

Supabase Cron is the master clock and currently runs hourly. The scheduler token is generated inside Supabase and stored in Vault; GitHub and the browser never receive the plaintext token.

Each automation rule stores its own `due_at`, so an hourly worker can support configurable delays such as 3–4 hours, days or weeks without tying delay logic to cron frequency.

## Default safety posture

- Automation is OFF by default.
- Default automated channel: public comments.
- Default delay: 3–4 hours.
- Simple greetings, compliments, thanks and simple low-risk messages may be automated.
- Price questions, complaints, refunds, legal/medical/political/sexual/sensitive or unknown topics require approval.
- Daily limits and per-person cooldowns are enforced.
- Manual replies cancel queued replies.
- Cross-network identity merging is not automatic.
- Sensitive information is not intentionally stored in long-term social memory.


## Fuentes de Nayla

Google Drive is treated as a live work source, not as long-term conversational memory.

Flow:

1. Each user/project authorizes its own Google account.
2. Default scope mode is `selected`: OAuth requests `drive.file` and the user chooses documents through Google Picker.
3. Refresh tokens are encrypted server-side before being stored in Supabase.
4. Nayla reads only selected compatible documents (Google Docs / text / Markdown / JSON).
5. Source content is fingerprinted and versioned.
6. Nayla stores a compact `social_program_summaries` record instead of copying the whole source document into memory.
7. Platform-specific publication drafts are stored in `social_publication_packages`.
8. The source document remains the source of truth; a changed source version creates a new summary and supersedes the previous current version.

Optional `GOOGLE_DRIVE_SCOPE_MODE=readonly` enables broad Drive discovery, but `selected` is the recommended multi-user product mode.

Required server environment:

```
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
NAYLA_CONNECTOR_ENCRYPTION_KEY=
GOOGLE_DRIVE_PICKER_API_KEY=
GOOGLE_DRIVE_APP_ID=
GOOGLE_DRIVE_SCOPE_MODE=selected
```

The chat recognizes requests such as “revisa qué programa hicimos hoy”. After a source is synced, the latest program summary and per-platform publication packages are part of Nayla Social context.

## Platform-specific publishing copy

A publication is no longer modeled as one universal caption. Nayla stores a variant per platform and language.

The provider-neutral payload can carry:

```json
{
  "variants": {
    "youtube": { "title": "...", "caption": "...", "hashtags": ["#..."] },
    "tiktok": { "caption": "...", "hashtags": ["#..."] },
    "facebook": { "caption": "...", "hashtags": ["#..."] }
  }
}
```

Provider adapters translate these variants into each route's per-platform override fields without exposing provider details to the UI.

## Background inbound listener

The existing hourly social scheduler now performs a low-cost inbound review before memory compaction and due reply execution:

provider/webhook or light poll → normalized interaction → identity → memory → automation queue.

Interactive “revisa todo” requests scan more history. The background listener intentionally inspects fewer accounts/posts/conversations to reduce API consumption.

## Multi-tenant ownership

`social_accounts` keeps the provider account identity globally unique. Before an upsert, Nayla checks its current owner. A social account already owned by another user/project is rejected instead of being silently reassigned.
