# Known Issues

## Alpha Scope

- Multiplayer transport is still a foundation layer, not production netcode.
- Client prediction and rollback are preparation-level only.
- The main menu checks `/health` before entering multiplayer, but full in-game reconnect QA is still a manual Alpha pass.
- Studio tools operate on voxel blocks and prefabs; full object hierarchy and script editor are future work.
- Publish flow stores metadata locally/server-side but does not upload to a remote marketplace.
- Audio is currently hook-based; real sound asset playback is future work.

## Performance

- Far render distance can still cause frame drops on low-end GPUs.
- Large worlds are JSON-persisted during Alpha; binary chunk compression is future work.
- The release build splits Three.js into a separate chunk, but the engine is still a substantial prototype bundle.

## WebGL Fallback

If the app shows the WebGL fallback screen:

1. Use a current Chrome, Edge, or Firefox build.
2. Enable browser hardware acceleration.
3. Update GPU drivers.
4. Close GPU-heavy tabs or recording software.
5. Try the low graphics quality preset after the app loads on a supported device.

## QA Notes

- Keep `docs/FULL_CODE_SNAPSHOT.md` out of release commits unless a full source snapshot is intentionally requested.
- Dedicated server persistence writes to `server-data/`, which is intentionally ignored by Git.
- Use `npm run verify:alpha` before release commits.
