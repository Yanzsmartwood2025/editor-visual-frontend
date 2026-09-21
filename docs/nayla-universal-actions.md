# Nayla Universal Action Contract

Nayla uses one confirmation language across modules.

## Contract

1. The user gives a natural-language instruction.
2. A module-specific planner resolves only real, owned resources.
3. The planner writes a provider-neutral plan to `nayla_action_plans` and atomic items to `nayla_action_items`.
4. Nayla shows the exact proposed actions and does **not** execute them.
5. A confirmation such as `Dale`, `Adelante`, `Hazlo` or `Procede` is detected by the shared `isUniversalNaylaConfirmation()` function.
6. The module claims the pending plan atomically and re-validates every target before executing.
7. Each item and the plan keep an audit status/result.

A second confirmation cannot execute the same pending plan twice because claiming changes the plan from `pending` to `executing`.

## Modules

### Editor

The existing main Nayla chat now uses the same universal confirmation detector while keeping its current timeline/media execution pipeline.

### REDES

Nayla Social persists plans and currently supports:

- Replying to real, unresolved comments.
- Replying to real, unresolved DMs where the connected network exposes that capability.
- Publishing an existing project video such as R1/R2 to connected social accounts.

Replies are generated during the planning phase and shown before confirmation. `Dale` sends exactly the stored reply after re-validating the interaction.

Publishing uses the same `publishSocialVideo()` service as the visible Publicar UI, so chat commands and button-driven publishing cannot diverge.

## Safety and ownership

- All action tables are server-only with RLS enabled and `anon/authenticated` grants revoked.
- Every social candidate comes from the authenticated user's current project.
- LLM-selected IDs are checked against the allowed candidate set before a plan is stored.
- Provider secrets never enter action payloads or the browser.
- Existing provider adapters remain isolated under `social/providers/`.
- A manual or automated reply marks the inbound interaction responded, so it is not offered again.
- A new social plan replaces the previous pending social plan instead of stacking hidden actions.
- Plans expire after 24 hours by default.
