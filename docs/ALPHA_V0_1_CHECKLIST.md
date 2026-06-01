# Alpha v0.1 Checklist

Use this checklist before tagging or sharing an Alpha build.

## Required Verification

- `npm install` completes on a clean checkout.
- `npm run verify:alpha` passes.
- `npm run smoke:production-build` passes after `npm run build`.
- `npm run smoke:runtime-config` passes.
- `npm run smoke:webgl` passes.
- `npm run smoke:ai-director` passes.
- `npm run smoke:autoplaytest` passes.
- `npm run simulate:ai` writes an ignored report into `reports/`.
- `npm run dev` starts the client.
- `npm run dedicated:server` starts the server.
- `http://127.0.0.1:8787/health` returns `ok: true`.
- Main menu opens on first launch.
- Play Solo enters the world without console errors.
- Join Multiplayer shows a clear offline message when the dedicated server is not running.
- Public client shows a clear configuration message when `VITE_GODOY_WS_URL` is missing on a non-local hostname.
- Two multiplayer tabs can connect after the dedicated server starts.
- Settings persist after reload.
- Technical debug overlay is hidden by default and toggles with `F3`.
- Feedback panel generates a local AI Session Report and can copy or download JSON.
- Feedback panel can start a Quick autonomous playtest without blocking the main UI.
- Feedback panel shows autonomous AI goal, subgoal, reason, progress, and target while a run is active.
- Fresh solo and multiplayer sessions use the `survival-start` inventory profile; the debug-rich profile is explicit test-only setup.
- Autonomous playtest reports include completed goals, failed goals, progression tier reached, time spent per goal, and bottlenecks.
- Autonomous playtest reports include inventory deltas, crafted items, and failed crafts.
- Fake crafting/no-progress loops produce AI Director gameplay tasks.
- Third-person mouse orbit moves freely and WASD follows camera direction.
- Tree canopies do not launch the player upward.
- Sky, weather ambience, water/grass animation, character motion, and feedback particles render cleanly.
- Procedural audio cues fire after interacting with the page.
- Save migration smoke test passes.
- Inventory initialization smoke test passes.
- Inventory/crafting smoke test passes.

## Manual Play Pass

- Move, jump, sprint, crouch, and fly in creative mode.
- Mine and place blocks.
- Craft at least one recipe.
- Consume food from the selected hotbar slot.
- Trigger one hostile encounter.
- Toggle Studio mode, select a block, move it, undo, and redo.
- Place one prefab.
- Publish local world metadata.
- Sleep to skip night.

## Release Gate

- README command flow is accurate.
- Deployment guide is accurate for Vercel, Netlify, Render, and Railway.
- `.env.example` contains placeholders only.
- Known limitations are documented.
- AI Director workflow and issue templates are present.
- Alpha release notes are current.
- No generated runtime data is staged.
- No generated AI Session Report JSON is staged.
- No generated autonomous playtest report JSON is staged.
- `docs/FULL_CODE_SNAPSHOT.md` is excluded unless intentionally requested.
- No secrets, tokens, or machine-local absolute paths are staged.
