# Known Issues

## Alpha Scope

- Multiplayer transport is still a foundation layer, not production netcode.
- Client prediction and rollback are preparation-level only.
- The main menu checks `/health` before entering multiplayer, but full in-game reconnect QA is still a manual Alpha pass.
- Public multiplayer requires a deployed WebSocket server and `VITE_GODOY_WS_URL`; static client deploys do not host multiplayer by themselves.
- Studio tools operate on voxel blocks and prefabs; full object hierarchy and script editor are future work.
- Publish flow stores metadata locally/server-side but does not upload to a remote marketplace.
- Audio currently uses lightweight procedural cues plus hooks; authored sound assets and mixing are future work.
- AI Session Reports are local QA artifacts and do not create GitHub issues or code changes automatically.
- Autonomous playtests are deterministic goal-oriented QA probes, not full human playtesting replacements.

## Performance

- Far render distance can still cause frame drops on low-end GPUs.
- Large worlds are JSON-persisted during Alpha; binary chunk compression is future work.
- The release build splits Three.js into a separate chunk, but the engine is still a substantial prototype bundle.

## Fixed In Current Alpha

- Tree canopy columns no longer count as high walkable ground for player vertical snapping.
- Technical debug data is hidden by default and kept behind menu settings or `F3`.
- Autonomous playtest behavior now follows survival progression goals instead of random timed action loops.
- Autonomous wood gathering now validates real trunk targets and wood inventory deltas.
- Autonomous shelter progression now rejects invalid materials and requires real shelter safety before Survive Night can advance.
- AI memory now reports persistence source/load/save counts consistently and preserves terrain death learning.
- Autonomous survival recovery now searches/eats food at low hunger, pauses risky exploration at low health, and records terrain avoidance evidence.
- Autonomous void/camera recovery now detects sky-only or below-terrain states, teleports to safe ground, resets grounded/camera state, and reports recovery evidence.
- Autonomous recovery pause now emits one pause and one resume event per recovery cycle instead of spamming telemetry every tick.
- Autonomous hard recovery now invalidates failed targets, forces replanning, detects repeated recovery loops, and includes stale-simulation fallback snapshots in Feedback reports.
- Autonomous starter progression now aborts failed runs after 90 seconds with no mining/wood progress instead of reporting false completion.
- Autonomous post-test cleanup now clears movement, mining targets, landing impact, and recovery state so automated death loops do not continue after completion.

## WebGL Fallback

If the app shows the WebGL fallback screen:

1. Use a current Chrome, Edge, or Firefox build.
2. Enable browser hardware acceleration.
3. Update GPU drivers.
4. Close GPU-heavy tabs or recording software.
5. Try the low graphics quality preset after the app loads on a supported device.

## QA Notes

- Keep `docs/FULL_CODE_SNAPSHOT.md` out of release commits unless a full source snapshot is intentionally requested.
- Keep generated AI Session Report JSON out of release commits unless a maintainer explicitly requests a fixture.
- Keep generated autonomous playtest reports in `reports/` out of release commits unless intentionally promoted to fixtures.
- Dedicated server persistence writes to `server-data/`, which is intentionally ignored by Git.
- Use `npm run verify:alpha` before release commits.
- Keep `.env` files local; only `.env.example` should be committed.
