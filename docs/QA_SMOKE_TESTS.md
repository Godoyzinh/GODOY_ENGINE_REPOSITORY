# QA Smoke Tests

Run these before tagging an Alpha build.

## Client

- `npm run build` completes successfully.
- `npm run verify:alpha` completes successfully.
- `npm run smoke:production-build` validates generated Alpha client artifacts.
- `npm run smoke:runtime-config` validates dev/prod WebSocket URL behavior.
- `npm run smoke:webgl` validates the WebGL fallback copy and escaping.
- `npm run smoke:ai-director` validates telemetry, local QA reports, and AI task generation.
- `npm run smoke:autoplaytest` validates autonomous bot simulation, goal planning, and report export shape.
- `npm run smoke:settings` validates settings normalization and persistence.
- `npm run smoke:camera` validates camera-relative movement, paused input, and vertical snap protection.
- `npm run smoke:visual` validates sky, ambient particles, feedback particles, and procedural audio hooks.
- `npm run smoke:inventory-init` validates fresh survival, multiplayer, save-restore, and debug inventory initialization profiles.
- `npm run smoke:inventory` validates hotbar/backpack stacking, crafting output, and selected consumable use.
- `npm run smoke:save` validates save migration and persisted simulation state.
- Open `http://127.0.0.1:5173/`.
- Main menu appears on first launch.
- Public Alpha banner and version display are visible.
- Loading screen is replaced after runtime boot.
- Play Solo hides the menu and the world renders.
- Fresh survival sessions start with the `survival-start` inventory profile, not the debug-rich hotbar.
- Settings change graphics quality, render distance, audio volume, controls help, and debug visibility.
- First-launch onboarding can be dismissed and stays dismissed after reload.
- `Esc` opens the menu after play starts.
- `F1` opens controls help.
- `F3` toggles the technical debug overlay.
- Feedback opens a compact AI Session Report panel.
- Feedback report generation shows issue/task counts and keeps reports local until copied or downloaded.
- Run Auto Test starts an autonomous playtest, shows the current AI goal/subgoal/reason/progress/target, and produces an AI Director report when complete.
- Join Multiplayer reports that the dedicated server is offline when `npm run dedicated:server` is not running.
- Join Multiplayer reports a clear configuration message when a public client lacks `VITE_GODOY_WS_URL`.

## Gameplay

- Player can move, jump, sprint, crouch, and fly in creative mode.
- Mouse orbit rotates the third-person camera, and movement follows camera direction.
- Passing near tree canopies/trunks does not snap the player upward.
- Blocks can be mined and placed.
- Hotbar selection works with number keys and scroll wheel.
- Crafting and consumable use still work.
- Combat hit/cooldown UI still updates.
- Sky gradient, sun/moon visuals, fog, ambient particles, and light water/grass motion render without console errors.
- Footsteps, mining, hit, landing, ambient, and UI audio cues trigger after browser audio is unlocked by player input.

## Autonomous Playtest

- `npm run simulate:ai` completes a Quick Smoke bot run and writes a JSON report into `reports/`.
- `npm run simulate:ai -- --mode=standard` supports a 5 minute simulated session.
- `npm run simulate:ai -- --mode=stress` supports a 15 minute simulated session.
- `npm run simulate:ai -- --inventory=empty` starts without resources, tools, furnace, or food.
- `npm run simulate:ai -- --inventory=survival-start` starts with minimal food only.
- `npm run simulate:ai -- --inventory=debug-rich` preserves the old rich inventory for fast system checks.
- Reports include bot actions for exploration, mining, placement, collection, crafting, combat, survival, and save/load checks.
- Reports include goal planner details: completed goals, failed goals, progression tier reached, time spent per goal, and bottlenecks.
- Reports include inventory initial/current/delta snapshots, resource deltas, goal transitions, failed actions, crafted item lists, and failed craft lists.
- Reports include `startingInventoryProfile`, `initialInventory`, `currentInventory`, and `inventoryDelta`.
- Reports include wood resource scan results: nearest trunk target, target distance, scanned wood block count, rejected leaves, and blocked reason.
- Reports include shelter validation, valid shelter block counts, invalid shelter block rejection counts, blocked goals, and recovery actions.
- Quick smoke should complete early survival goals and continue pursuing the next progression goal.
- Fake craft loops must not count as craft success and must produce failed-craft, action-loop, and missing-sticks evidence.
- Gather Wood must target real trunk blocks, advance from real wood deltas, avoid leaf-only progress, and stay below the mining spam threshold.
- Empty-inventory runs must select Gather Wood first and avoid simulated craft completions.
- Build Shelter must reject Grass, Leaves, Water, Campfire, and decorative blocks before placement.
- Survive Night must require a valid shelter or safe-distance/no-aggro validation before progress can count.
- Exported autonomous report JSON must preserve non-empty `issues` and `aiTasks` when the report generator produced them.
- Failure detection reports stuck states, vertical collision snaps, FPS drops, death loops, console errors, and save/load errors.
- Generated files in `reports/` remain untracked unless intentionally promoted to a fixture.

## Studio

- Backquote toggles Studio mode.
- `F` selects a block.
- Arrow keys and Page Up/Page Down move selected Studio block.
- `Ctrl+Z` and `Ctrl+Y` undo/redo Studio edits.
- `B` cycles prefab selection.
- `V` places the selected prefab when space is clear.
- `O` records publish metadata.

## Multiplayer

- `npm run smoke:multiplayer` validates server health, admin status, and reconnect registry behavior.
- Start server with `npm run dedicated:server`.
- Health endpoint returns `ok: true`.
- Two browser tabs can join `?multiplayer=1`.
- Player snapshots replicate.
- Block edits replicate.
- Studio edit permissions reject viewer edits.
- Admin status includes hosted worlds, active editors, published worlds, and network metrics.

## Packaging

- `npm run build` outputs app and Three.js chunks.
- `npm run verify:alpha` runs clean before release.
- README command flow is accurate.
- `docs/DEPLOYMENT.md` matches deployment config files.
- Alpha release notes and known issues are present.
- AI Director workflow and GitHub issue templates are present.
- No staged docs include machine-local absolute paths or secret-like tokens.
