# Nayla editing library

Nayla receives a capability catalog and executable recipes in `src/lib/naylaEditingLibrary.ts`. General wishes receive 2–3 short recommendations. Concrete editing instructions produce a validated BUILD_TIMELINE action. The existing adapter translates that data into Remotion composition props; arbitrary generated JavaScript is not evaluated.

The recipes demonstrate photo depth, perspective tilt, cinematic photo/video treatment, music ducking around another track, track crossfades and real GLB scenes. They are examples to adapt, not available media or a fixed limit on combinations. Tests validate every example against the production action schema.

## Audio automation

`volumeKeyframes: [{time: 0, gain: 1}, ...]` defines linear gain ramps. Times are seconds relative to the clip's placement after delay, not source trim positions. They do not restart with a loop. Gain is 0–1, multiplies the base `volume` and existing fades, and remains at the first/last value outside the curve. The render endpoint rejects invalid curves. Audio and embedded video sound both use the same evaluator.

Ducking is scheduled automation, not automatic speech detection. Nayla must use known track timing or ask for it. It must preserve the existing montage when changing only sound. Timeline controls are passed as context to support this.

## Dependencies and reference

The project's 38 Remotion dependencies are already declared at 4.0.526 and installed with `npm ci`. These features need no additional package. Installed packages are not all exposed as editable features; deployment builds the connected composition with `npm run build:remotion`.

Reference architecture (not copied source): https://github.com/remotion-dev/template-prompt-to-video — a structured timeline of visual elements, text and audio consumed by Remotion.
Audio API: https://www.remotion.dev/docs/media/audio

Validation: action-schema recipe tests, interpolation and invalid-curve tests, TypeScript and production Remotion bundling. A live LLM and final rendered audio still need end-to-end validation in the deployed environment.
