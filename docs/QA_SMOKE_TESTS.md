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
- `npm run smoke:neural-ai` validates neural network math, mutation, serialization, neural fitness, recovery safety, and champion training.
- `npm run smoke:neural-population` validates multi-agent neural evolution, champion persistence, manual-input contamination, quick champion evaluation, blocked target safety, and best-agent selection.
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
- Neural Evolution controls start quick, standard, evolution, population training, optional clone-arena metadata, stop training, champion reset/export/import, and show live generation/fitness/action/sensor stats.
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
- Reports include memory persistence source/load/save counts, survival recovery actions, food search actions, blocked placement reasons, terrain safety, death position, and terrain death context.
- Reports include player/camera safety fields for void recovery: `cameraVoidDetected`, `playerLostRecoveryCount`, `lastSafePosition`, `recoveryTeleportUsed`, `recoverySuccess`, `skyOnlyFrames`, and `gatherWoodBlockedReason`.
- Reports include recovery state fields: `recoveryState`, `recoveryPauseSpamCount`, `recoveryLoopDetected`, `recoveryPauseEventEmitted`, and `recoveryResumeEventEmitted`.
- Reports include hard recovery loop fields: `recoveryLoopCycles`, `hardRecoveryCount`, `lastFailedGoal`, `lastFailedAction`, `failedTargetPosition`, `blacklistedTargets`, and `emergencyTeleportUsed`.
- Reports include starter false-completion fields: `falseCompletionDetected`, `earlyAbortReason`, `woodProgressBy90s`, `craftPlanksBlockedByMissingWood`, and `hardRecoveryMisuseDetected`.
- Reports include post-completion cleanup fields: `postCompletionEventsDetected`, `postCompletionDeaths`, plus terrain death `velocityY`, `fallDistance`, `healthBefore`, and `healthAfter` when available.
- Reports include `neuralAgent` when neural assistance is enabled: generation, champion/current fitness, population size, mutation rate, selected action, action scores, sensor snapshot, decision reason, and training mode.
- Reports include `neuralEvolution` when neural assistance is enabled: mode, training state, population size, generations, best/average/champion fitness, champion improvement, best agent, wood/death/blocked counts, contamination, fitness validity, champion save status, planner/champion/neural comparison, and recommended next target.
- `npm run train:neural -- --mode=quick --generations=10 --population=32 --duration=60` runs quick headless population training and writes the local champion brain to `data/AI_NEURAL_CHAMPION.json`.
- `npm run train:neural -- --mode=standard --generations=5 --population=16 --duration=300` runs standard neural population training.
- `npm run train:neural -- --mode=evolution --generations=3 --population=8 --duration=1800` runs long-form evolution training.
- `npm run simulate:ai -- --duration=60 --neural` runs a neural-assisted 60 second quick survival episode without allowing neural control to trigger hard recovery.
- Manual input during neural training must set `trainingContaminated = true`, `fitnessValid = false`, and prevent champion saving.
- Quick smoke should complete early survival goals and continue pursuing the next progression goal.
- Quick smoke should use `hardRecoveryCount = 0` unless a physical invalid state is injected.
- If mining and wood are still zero after 90 seconds, autonomous simulation must abort as failed with a clear starter progression reason.
- Evolution mode must not continue remaining segments after a starter false-completion abort.
- Fake craft loops must not count as craft success and must produce failed-craft, action-loop, and missing-sticks evidence.
- Gather Wood must target real trunk blocks, advance from real wood deltas, avoid leaf-only progress, and stay below the mining spam threshold.
- Gather Wood must not select trunk targets outside mining reach; unreachable targets are blacklisted and replaced by Explore For Wood movement, not hard recovery.
- Craft Planks must not wait forever at zero wood; it must route back to Gather Wood or Explore For Wood and report missing wood.
- Empty-inventory runs must select Gather Wood first and avoid simulated craft completions.
- Gather Stone must not start until Craft Wooden Pickaxe has produced a real pickaxe item.
- Reports must include `actualEquippedTool` and create an issue/task if Gather Stone starts without a valid mining tool.
- Obtain Furnace must accept Stone, Rock, or Sandstone as furnace-compatible stone material.
- Reports must include `furnaceRecipeFound`, `furnaceRecipeRequirements`, `furnaceCraftAttemptRequirements`, and `furnaceCraftBlockReason`.
- Obtain Furnace must report a blocked loop if furnace crafting fails for more than 10 consecutive attempts.
- Build Shelter must reject Grass, Leaves, Water, Campfire, and decorative blocks before placement.
- Survive Night must require a valid shelter or safe-distance/no-aggro validation before progress can count.
- Low hunger must trigger food search/eating recovery, terrain deaths must teach dangerous-biome context, and blocked shelter placement must report exact reasons.
- Simulated void/fall states must hard-recover to valid visible terrain, reset grounded state, recenter the camera, and resume survival progression.
- Quick autonomous smoke must finish with `recoveryPauseSpamCount = 0`, `recoveryLoopDetected = false`, and no recovery-spam failures.
- Repeated hard recovery after a blocked `gatherStone` target must set `recoveryLoopDetected = true`, blacklist failed targets, emergency teleport, and generate non-empty issues/AI tasks.
- Hard recovery must only run for physical invalid states such as below-terrain, inside-block, void/camera-lost, or invalid positions.
- After `auto-test-complete`, autonomous movement/recovery/planner activity must stop and no automated death events should continue.
- Feedback-generated reports during or after an autonomous run must include `lastSimulationSnapshot` when `runtimeStats.simulation` is not active.
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
