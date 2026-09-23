# Nayla editing library

Nayla receives a capability catalog and executable recipes in `src/lib/naylaEditingLibrary.ts`. General wishes receive 2–3 short recommendations. Concrete editing instructions produce a validated BUILD_TIMELINE proposal for the review card. The user must accept the saved plan with the button before any editor action is dispatched. The existing adapter translates that data into Remotion composition props; arbitrary generated JavaScript is not evaluated.

The full machine contract is generated from the production Zod action schema in `naylaEditorContract.ts`; recipes are examples, not the capability boundary. The recipes demonstrate photo depth, perspective tilt, cinematic photo/video treatment, music ducking around another track, track crossfades and real GLB scenes. They are examples to adapt, not available media or a fixed limit on combinations. Tests validate every example against the production action schema.

## Audio automation

`volumeKeyframes: [{time: 0, gain: 1}, ...]` defines linear gain ramps. Times are seconds relative to the clip's placement after delay, not source trim positions. They do not restart with a loop. Gain is 0–1, multiplies the base `volume` and existing fades, and remains at the first/last value outside the curve. The render endpoint rejects invalid curves. Audio and embedded video sound both use the same evaluator.

Ducking is scheduled automation, not automatic speech detection. Nayla must use known track timing or ask for it. It must preserve the existing montage when changing only sound. Timeline controls are passed as context to support this.

## Dependencies and reference

The project's 38 Remotion dependencies are already declared at 4.0.526 and installed with `npm ci`. These features need no additional package. Installed packages are not all exposed as editable features; deployment builds the connected composition with `npm run build:remotion`.

Reference architecture (not copied source): https://github.com/remotion-dev/template-prompt-to-video — a structured timeline of visual elements, text and audio consumed by Remotion.
Audio API: https://www.remotion.dev/docs/media/audio

Validation: action-schema recipe tests, interpolation and invalid-curve tests, TypeScript and production Remotion bundling. A live LLM and final rendered audio still need end-to-end validation in the deployed environment.

## Review and exact acceptance

The card separates photos, videos, audio, literal subtitles, titles, vector graphics and 3D. Timing uses the same frame metrics as the renderer, including transition overlap. Each media duration must be known. It also records output format and retained logos/settings. Plans are stored in the existing nayla_action_plans/items tables; their column structure was checked read-only in the naylacore project. Acceptance verifies ownership, the latest pending plan and an atomic claim. The accepted payload is returned unchanged without another model call. Completed plan status means dispatched, not successful video rendering. Rendering continues through the existing browser-to-render endpoint.

The unsafe server-side block extraction that overwrote subtitles and style has been removed. The plan shows exact text before acceptance. This fixes the deterministic contamination path, but users should still review LLM-generated content.

Video rendering now defaults to true; false is for an explicitly timeline-only plan. The native video clock uses metadata, duration and timeupdate events. Playback state follows play/pause events and final renders do not jump into the next raw clip on ending. This is a native source/final video player, not an interactive Remotion composition preview of an unrendered timeline.

## Code inspection and automatic recovery

The review card opens a separate modal with the complete saved JSON action and render context. This is the editor's validated instruction format, not generated React source or a claim to expose the final HTTP render body. Approval dispatches the stored action; showing code does not run it. Historical cards created without the execution snapshot still show their original table.

Creative requests allow 12,000 output tokens per call, up to two continuations on a length stop, and two transient retries per provider invocation. Continuations retain the original conversation and append only the missing suffix. The existing schema validation and one repair pass gate dispatch. Rate-limit/server errors respect Retry-After up to 30 seconds; longer waits fail rather than retry too early. Abort and the existing shared 180-second chat budget bound the whole operation. No model selection or production environment was changed. This does not implement a durable background job, live token streaming, or guaranteed semantic completeness. The original request remains in chat when recovery fails.

Recovery verification covers both providers, rate-limit delay, cancellation, continuation exhaustion and nonretryable errors. Live-provider recovery and modal browser verification remain to be performed.

## Broader research and remaining coverage

- Shotstack: https://shotstack.io/docs/guide/agents/conventions/ — agents author exact schema-constrained JSON and validate it.
- Creatomate: https://creatomate.com/docs/api/quick-start/create-a-video-by-template — structured templates and RenderScript describe renders.
- Remotion: https://github.com/remotion-dev/template-prompt-to-video — structured timeline consumed by components.

`node scripts/audit-remotion.mjs` produces `docs/remotion-capabilities-audit.json`. It checks every declared Remotion dependency, installed version and static import references. Current inventory: 38 installed, none missing, 18 statically referenced, 20 without direct static references. This is not evidence that every exported API is exposed. Some unused modules are utilities or alternate render engines (Player/web-renderer/renderer); others such as emoji, text annotations, font selection, sound effects and SVG 3D need separate component/control integration if wanted. They must not be advertised as available merely because installed.

Verification: 161 unit tests, TypeScript, Remotion bundle and isolated review UI JavaScript bundle pass. Live model behavior and an authenticated plan-to-final-render test remain unverified. Browser visual testing was blocked by the browser installer's certificate error; no certificate checks were disabled.
