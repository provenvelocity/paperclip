# Agent personas

Agents have a persisted visual identity independent of prompts and runtime
configuration: `{ schemaVersion: 1, characterVersion: "cap-v1", paletteId }`.
The cap-v1 library contains 17 permanent palettes and a presentation-only gray
Muted dream palette. The character itself is one ClipLab studio export —
`ui/src/assets/cliplab/onboarding.character.json` (end cap, custom idle,
sleepy-to-wake) — mirrored into the shared package as
`packages/shared/src/cliplab/character.ts` by
`node scripts/sync-cliplab-character.mjs` (`--check` detects drift); every
palette recolours its body. The onboarding hero and every avatar are the same
character on the same engine (ClipLab v0.2.0, see PROVENANCE.md). New agents get one random assignment; existing rows are
backfilled with the same ID-based mapping used by legacy clients. Duplicating
an agent generates another assignment. Export/import preserves it.

## Rendering and URLs

`GET /api/agent-avatars/cap-v1/bubblegum-sky/rest.png?size=24&scale=2`

The endpoint is public preset artwork, contains no agent/company identifiers,
and works without the UI. `Agent.avatarUrl` is the 512px resting portrait URL.
Resolve relative URLs against the instance base URL for integrations.

Supported logical sizes: 16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512.
Density is 1 or 2. Poses: rest, idle, listening, thinking, working, success,
confused, sleepy, loading. Other inputs receive 400. Display size controls
face detail separately from raster dimensions: 24px at 2× remains eyes-only.

A cold request samples ClipLab's deterministic scene, exports SVG using the
same geometry and face code as the live renderer, and rasterizes it with sharp
in a worker thread. No Chromium, GPU, pre-rendering command, or per-agent asset
row is required. Two workers serve a bounded queue, coalesce identical requests
within the process, time out failed rendering, and stop after an idle interval.

The configured local-disk/S3 provider stores results in
`generated-agent-avatars/<version>/<palette>/<pose>-<size>-<scale>.png`.
This preset-only cache intentionally uses the storage provider directly;
company asset APIs retain their existing authorization boundary. Cache data
can be removed and regenerates on demand. Independent replicas can render the
same key safely; successful writes are complete objects. ETags hash PNG bytes.
A small `.png.json` sidecar stores the content digest and length; it is published
after the complete PNG. Warm requests stream stored PNG bytes without re-rendering
or buffering the image in the API process. Responses are immutable for one year.
Cold renders are limited per client IP (32 outstanding keys and 256 new keys
per minute per process); excess misses return 429 with Retry-After and no-store.
Warm cache hits and requests joining the same in-flight key bypass admission.
The route uses Express trust-proxy configuration, never an untrusted forwarded header. Render/storage failures return 503 with
Retry-After and no-store rather than caching a broken image.

cap-v1 is frozen: change the version when changing palette values, poses,
rendering, or dependencies in a way that changes pixels. Keep old versions
available. The SVG exporter approximates 3D gradients with a planar gradient;
front-facing identity portraits minimize the difference from WebGL.

## Components

- `AgentAvatar`: image only; pass the agent record or appearance and a semantic
  size. No per-agent queries, live-renderer imports, or circle cropping.
- `AgentIdentity`: agent avatar and name. Human identities keep `Identity`.
- `AgentCharacter`: lazy live hero with state and optional tracking-region
  props, plus an explicit `trackingScope="page"` for onboarding and agent headers. One live renderer per view; other instances keep their still image.
  Reduced motion, offscreen content, renderer failure, and static states do
  not run the animation loop. Pointer tracking defaults to its region and is off for touch.

Onboarding stores the eventual palette in its existing draft and presents gray
until verified connection/hiring succeeds. Reconnect never randomizes identity.
Names, explicit status badges, and status text remain authoritative.

## User-supplied artwork motion

Custom avatars remain company-scoped, normalized static images uploaded through
the existing avatar API. They are still by default. For an agent with uploaded
artwork, enable **Identity → Custom avatar motion → Animate uploaded artwork**
and save. This persists `appearance.customAvatarMotion: "reactive"`; `"still"`
disables it, and an omitted setting keeps existing behavior unchanged.

The large `AgentCharacter` surface gently floats idle artwork, tilts while
thinking/confused, and bobs while working/loading/successful. This transforms
the entire image; it does not add a 3D rig.
The image also gently follows and tilts toward the mouse, using the existing
`trackingScope`, `trackingRegion`, `followCursor` and `followRotation` props.
Travel is bounded to 4% and tilt to 8/10 degrees, even outside the image.
Leaving the tracking region recenters it. Touch and coarse pointers do not
track; listeners are removed while motion is inactive and on unmount.
Small avatars and API-exported portraits
remain static. Motion pauses offscreen, in background tabs, in rest/paused
states, for `motion="still"`, or when reduced motion is enabled. Custom motion
shares the existing one-live-character slot and does not load ClipLab or WebGL.

Supply artwork you have permission to use and animate. No third-party mascot
artwork is bundled or fetched by this feature. For example, GitHub's
[mascot guidance](https://brand.github.com/graphic-elements/mascots) permits
internal usage but requires Brand team approval for public-facing usage.
The motion setting grants no artwork license. GIF URLs are not an interactive
rig: the existing upload API still accepts only static PNG, JPEG or WebP,
normalizes to PNG, rejects animated files, and never fetches a remote URL.

### Optional independent eyes

For square front-facing artwork, an operator can configure
`appearance.customAvatarEyes` through the existing agent configuration API:
`{ baseAssetId, color, eyes: [{ x, y, width, height }, { x, y, width, height }] }`.
Upload an eye-free base image and a complete static portrait through this
agent's avatar upload endpoint, then reference the base's retained asset ID.
Both assets must belong to this company and agent. The complete portrait stays
the normal avatar, including small placements and API exports. Only the large
character uses the eye-free base with two rounded eye layers. Eye coordinates
are centers and dimensions in a square 0-100 view box; color is a six-digit hex.

The eyes move independently by at most 2 image units horizontally and 1.5
vertically, in addition to head movement. `followCursor={false}` centers them.
The same reduced-motion, touch, visibility and cleanup rules apply. This is a
2D layered effect, not reconstruction of a 3D model. Artwork must already be
prepared for these layers; there is no automatic eye detection or editing UI.
Replacing/resetting the uploaded avatar clears its eye layout. Portable agent
exports omit the private eye-base reference along with other uploaded artwork.

## Development and verification

ClipLab provenance/licenses are under `packages/shared/src/cliplab/`.
Palette tokens originate in `ui/src/index.css`. After deliberately introducing
new versioned artwork, `node scripts/sync-agent-palette-tokens.mjs` synchronizes
the TS palette data; `--check` detects drift. This does not generate images.

Storybook: **Agents / Personas**. Run with
`PAPERCLIP_STORYBOOK_API_URL=http://localhost:<isolated-port> pnpm storybook`.
`pnpm build-storybook` automatically packages all finite avatar presets (17
palettes plus muted gray, nine poses, eleven logical sizes, both densities).
The build uses the same bounded Node worker pool, SVG renderer, and Sharp pipeline
as the API. Storybook-only URL resolution points to relative PNG paths under the
published build, including branch-prefixed deployments. Production Paperclip
continues to use its on-demand API; no image generation runs during agent creation.
The generated files are build output, never committed. A manifest records image
hashes and pixel dimensions; deployment verification fetches every image and checks
its content type, PNG signature, dimensions, and hash. Dev Storybook still uses the
API proxy for cold-cache and regeneration testing.

The onboarding motion values live in `ui/src/motion-tokens.css`, imported by
`ui/src/index.css`. The JavaScript choreography reads these CSS tokens and uses
the same stylesheet for defaults before styles load. Reduced motion removes
transition durations; the connection status hold remains readable.

Focused checks:

```sh
pnpm exec vitest run packages/shared/src/agent-appearance.test.ts server/src/__tests__/agent-avatars.test.ts
node scripts/sync-agent-palette-tokens.mjs --check
node scripts/sync-cliplab-character.mjs --check
pnpm check:token-gates
pnpm build-storybook
```

The 500-avatar story must create zero WebGL contexts and load no live runtime.
Use fixed poses/times for screenshots and Linux for authoritative visual
baselines. Verify cold and warm URLs, reduced motion, reconnect, and saved
appearance after refresh alongside normal typecheck/test/build checks.

Linux visual/performance checks (against the self-contained built Storybook):

```sh
pnpm exec playwright test --config tests/storybook-visual/agent-personas.config.ts
```

Use the Playwright 1.62.1 Noble image for authoritative Linux baselines. The suite
covers both themes, palette and size grids, every expression, fixed-pose SVG/WebGL
pixel comparisons, repeated mounts, context loss, delayed/failed images, and the
500-avatar no-WebGL/no-live-download/no-frame-loop contract. Baselines follow the
existing Storybook visual artifact workflow; they are not application assets.

## Acceptance record — 2026-09-10

Implemented in `codex/agent-personas`, based on `5cb4f061d`, with the original
checkout left unchanged. Verification used disposable embedded-Postgres data,
a local MinIO container, and Playwright's Linux Noble image.

| Check | Result |
| --- | --- |
| Repository typecheck and build | Passed |
| Token gates and palette-token synchronization | Passed |
| Storybook production build | Passed |
| Linux visual/performance suite | 30 passed; exact snapshot comparison passed |
| Static/live agreement | Rest at 16/24/48/256 logical pixels, both densities; all eight animated expression snapshots at 128px/2× |
| Avatar endpoint | Cold/warm requests, concurrency, deletion, retry, ETags and invalid parameters passed |
| Real local-disk and S3-compatible storage | Passed; persisted warm cache reused by a fresh service instance |
| Compiled API-only smoke | Passed with TypeScript stripping disabled, no UI and a native worker |
| Persistence and contracts | Creation, saved draft, SQL backfill, approvals, duplication, portability and revision restoration passed |
| UI/runtime lifecycle | Reduced motion, one live owner, scoped pointers, hidden/offscreen suspension, failures and disposal passed |
| Hands-on app | Stable rename/reload, fresh duplicate assignment, paused static portrait, matching task/list/configuration identities passed |

The broad `pnpm test:run` verification was completed in its groups/shards after
resource-contention retries. General server (8,347 tests), UI (5,619), CLI (484),
DB (133), and adapter/plugin source suites (2,235) passed. Remaining route suites
and the added persona/contract tests passed after the OpenAPI coverage update.
The queued-comment suite exposed a pre-existing fixture-cleanup failure: run
claims created dependent runtime rows, so swallowed foreign-key errors left the
`QUE` company behind. Its isolated-database cleanup now truncates the company
fixture graph with cascade; all 17 tests pass together. No production queued-comment
behavior changed. Verification completed across the repository runner's groups
and shards, with targeted reruns after fixes, rather than another monolithic run.

Actual provider sign-in was not completed: the disposable instance had no managed
sandbox available for sign-in. Onboarding gray/loading/success transitions were
covered in Storybook and the onboarding tests. The app is usable in local-trusted
mode; this standalone worktree has no managed issue identity or login handoff.

The reviewed Linux candidate archive is generated at
`tests/storybook-visual/baseline-review/snapshots.tgz`. It remains a local review
artifact; the existing baseline manifest was not repointed to an unpublished URL.

## Placement and sharpness refinement — 2026-09-10

The overview/configuration header owns the live character beside the agent name
and follows the pointer across the whole page; there is no second hero in the
overview body. The new-agent dialog and setup page
use a larger, padded character frame with page-wide mouse tracking. Other
placements retain region-scoped tracking. Touch, reduced motion, hidden views,
and unmount cleanup still disable tracking and frame scheduling.

Live canvases render at twice the display density (capped at 4×), with a 1024px
face texture and padded framing for rotations and expression props. This affects
only the live renderer: existing versioned PNG URLs retain their original pixels.
The Snapshot Agreement story provides explicit 1×/2× controls and labels the
actual PNG and WebGL pixel dimensions for a fair comparison.

`Agents / Personas / Full pages` includes the actual application shell and route
components for all agents, agent overview, task detail, dashboard, the new-agent
dialog, and the connection page. Fixtures stay in Storybook; these examples do
not read or mutate the running company's data. Dashboard activity rows now use
the same agent avatars as its active-agent and task placements.

Refinement verification: 38 Linux Playwright checks passed, including exact
comparison with the reviewed snapshots for all six full-page stories and
corner-pointer clipping checks at 1×/2× display density. The 500-avatar view
still loads no live renderer or WebGL contexts. All 18 targeted appearance,
component/runtime, and avatar endpoint tests passed, as did shared/UI typechecks,
token gates, UI build, and Storybook build. Hands-on inspection confirmed the
single animated header at `/PER/agents/persona-tester-renamed/overview` and the
larger onboarding character in the real route components. The repository-wide
checks above were not repeated for this UI refinement.
