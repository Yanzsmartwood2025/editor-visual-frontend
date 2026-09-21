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
