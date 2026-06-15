# Changelog

## AI Cleanup And Stable Survival Baseline

### Changed

- Neural Evolution is now feature-flagged off by default in the browser runtime with `neuralEnabled=false` and `experimentalNeuralEvolution=false`.
- Feedback UI now keeps stable autonomous runs as the primary controls and moves Neural Evolution behind an Experimental section that requires explicit flags.
- Planner-only autonomous reports no longer include disabled neural agent/evolution payloads.

### Fixed

- Added safe fallbacks for report/UI label rendering to avoid `Cannot read properties of undefined (reading 'label')` failures.
- Runtime config smoke coverage now verifies neural feature flags default off and can be enabled explicitly.
- Autonomous smoke coverage now verifies the stable planner-only baseline is not contaminated by disabled neural telemetry.

## Neural Evolution Champion Validation

### Fixed

- Failed neural candidates can no longer be saved or loaded as champions when fitness is non-positive, no wood was collected, no real goal progressed, the episode failed, or fitness was contaminated/invalid.
- Neural survival validation now treats collected-and-consumed wood as real progress, so successful starter episodes are not invalidated by a low final wood balance.
- Neural Gather Wood sensors now actively refresh reachable trunk targets before action selection, preventing `nearestTarget` from staying null when trunks are available.
- Neural selected actions now record execution results and action counters, making reports distinguish logged decisions from state-changing actions.

### Added

- `bestCandidate` diagnostics for the best failed attempt, separate from a valid `champion`.
- Report fields for champion validity/status, generation start/completion, population/agent evaluation counts, target sensor failure, selected action execution, neural action counts, neural mine attempts, neural explore steps, neural wood collected, and fitness invalid reasons.
- Regression smoke coverage that verifies a failed population stores only `bestCandidate` and never persists it as `champion`.

## Unified Survival Neural Evolution

### Added

- Autonomous survival modes now expose neural evolution metadata so Quick, Standard, and Evolution runs can evaluate or train neural-assisted local behavior.
- Neural population training now records per-agent episode results, fitness, best goal reached, wood progress, deaths, blocked actions, sensor history, and action history.
- QA reports now include `neuralEvolution` with champion comparison, baseline comparison, fitness validity, contamination state, and recommended next training target.
- Feedback UI now includes a Neural Evolution section with quick/standard/evolution run buttons, population controls, mutation settings, champion reset/export/import, stop training, and optional Visual Clone Arena metadata.
- Added `npm run smoke:neural-population` for population, champion persistence, manual-input contamination, quick champion evaluation, and blocked target safety coverage.

### Changed

- `npm run train:neural` now accepts survival modes such as `--mode=quick`, `--mode=standard`, and `--mode=evolution` instead of only running the standalone neural-train path.
- Manual input during neural training now contaminates the episode, invalidates fitness, and prevents champion saving.

## Neural Survival Agent Foundation

### Added

- Added a lightweight neural survival agent foundation with MLP networks, genomes, population evolution, sensors, action mapping, fitness scoring, and champion serialization.
- Added `neural-train` autonomous simulation mode plus `npm run train:neural` for headless population training.
- Added `npm run smoke:neural-ai` to verify forward pass, mutation, serialization, fitness rewards/penalties, recovery safety, and champion generation.
- Feedback UI now exposes Run Neural Training and shows neural generation, fitness, selected action, and decision reason during neural-assisted runs.
- QA reports now include a `neuralAgent` snapshot with action scores, sensor state, fitness, mutation rate, and training mode.

### Changed

- Autonomous playtests can run as hybrid planner/neural sessions: the survival planner still chooses goals, while the neural layer only biases local movement/action selection.
- Neural control is explicitly blocked from triggering hard recovery; physical recovery remains owned by the existing validation state machine.

## Starter Progression False Completion And Post-Test Cleanup

### Fixed

- Autonomous simulations now abort as failed if starter survival has zero mining actions and zero wood after 90 seconds.
- Evolution mode now stops on starter false-completion failures instead of continuing later segments that could hide the regression.
- Craft Planks no longer waits indefinitely when wood is missing; the planner routes back to real wood gathering.
- Engine-backed autoplaytests clear autonomous movement, targets, mining state, landing impact, and recovery state on completion so automated death loops cannot continue after `auto-test-complete`.
- Hard recovery is reserved for physical invalid states; return-to-base survival recovery now uses soft safe-base relocation.

### Added

- Report fields for `falseCompletionDetected`, `earlyAbortReason`, `postCompletionEventsDetected`, `postCompletionDeaths`, `woodProgressBy90s`, `craftPlanksBlockedByMissingWood`, and `hardRecoveryMisuseDetected`.
- Death diagnostics now preserve position, vertical velocity, fall distance, and health before/after when terrain deaths are reported.

## Hard Recovery Loop And Stale Simulation Reports

### Fixed

- Hard recovery no longer reports success unless the player is above terrain, in a loaded chunk, grounded or safely falling, outside solid blocks, and has a valid camera target.
- Hard recovery now clears current AI/mining targets, blacklists the failed target location, and forces a replan instead of retrying the same failed action.
- Feedback reports now include `lastSimulationSnapshot` when generated during or after an autonomous simulation.

### Added

- Recovery loop detection for more than 3 hard recoveries in 15 seconds, with emergency teleport fallback and AI Director issue/task generation.
- Report fields for `recoveryLoopCycles`, `hardRecoveryCount`, `lastFailedGoal`, `lastFailedAction`, `failedTargetPosition`, `blacklistedTargets`, `emergencyTeleportUsed`, and `lastSimulationSnapshot`.

## Autonomous Recovery State Machine

### Fixed

- Recovery pause no longer emits telemetry every simulation tick after hard recovery.
- Completed autonomous reports now refresh `runtimeStats.simulation` from the final simulation snapshot after AI memory is saved.

### Added

- Recovery state machine diagnostics for `idle`, `hardRecovering`, `pausedAfterRecovery`, `resumed`, and `failed`.
- Report fields for `recoveryPauseSpamCount`, `recoveryLoopDetected`, recovery cycle state, and single-shot pause/resume markers.

## Autonomous Void Recovery And Camera Reset

### Fixed

- Autonomous playtests now detect sky-only/void camera states, below-terrain player positions, abnormal ungrounded states, and excessive distance from the last safe terrain/base point.
- Hard recovery teleports the bot to a safe grounded position, resets vertical velocity, refreshes grounded state, and recenters the third-person camera before progression resumes.
- Resource reserve wood recovery now avoids repeating unreachable trunk targets and can retrieve stored wood before exploring for a new target.

### Added

- Autonomous reports now include `cameraVoidDetected`, `playerLostRecoveryCount`, `lastSafePosition`, `recoveryTeleportUsed`, `recoverySuccess`, `skyOnlyFrames`, and `gatherWoodBlockedReason`.
- Smoke coverage now simulates a void/fall state and verifies that the bot returns to visible terrain, grounds correctly, and resumes survival progression.

## AI Survival Recovery And Memory Consistency

### Fixed

- AI memory diagnostics now expose persistence source plus load/save run counts, making run-count mismatches traceable across browser and file-backed simulations.
- Terrain death learning now preserves dangerous-biome context instead of being overwritten by biome rating recalculation.
- Headless autonomous reports no longer treat fixed-step simulation cadence as real render FPS drops.

### Added

- Survival recovery behavior for low hunger, low health, food search/eating, return-to-base, and risky-terrain avoidance.
- Report fields for `deathPosition`, `terrainDeathContext`, `survivalRecoveryActions`, `foodSearchActions`, and `blockedPlacementReasons`.
- Smoke coverage for low-survival recovery, terrain-death memory learning, memory persistence counters, and exact shelter block reasons.

## AI Furnace Progression Diagnostics

### Fixed

- Furnace crafting now accepts Stone, Rock, or Sandstone as valid stone material, preventing stone-count/resource-type mismatches from blocking `Obtain Furnace`.
- `Obtain Furnace` now uses furnace-compatible material counts for planner requirements.
- Autonomous playtests report a blocked furnace loop if furnace crafting fails for more than 10 consecutive attempts.

### Added

- Furnace report fields for recipe registration, recipe requirements, attempted material counts, and craft block reason.
- Smoke coverage for rock-only furnace crafting and repeated blocked furnace attempts.

## Goal-Oriented AI Stone Progression

### Fixed

- Gather Stone now requires a real pickaxe instead of relying on assumed hand-mining readiness.
- Craft Tools now only validates stick creation; Craft Wooden Pickaxe owns the actual mining-tool gate.
- Autonomous reports now create gameplay issues/tasks if Gather Stone starts without a valid mining tool.

### Added

- Wooden Pickaxe recipe and a dedicated Craft Wooden Pickaxe planner goal.
- Autonomous reports now include the actual equipped tool and pickaxe inventory deltas.
- Smoke coverage for the pickaxe gate before stone progression.

## Player Inventory Initialization Consistency

### Fixed

- Fresh player sessions now use the shared `survival-start` inventory profile instead of the old rich debug hotbar.
- Save restoration can replace inventory contents without re-injecting starter resources.
- Debug-rich inventory is only available through explicit debug/test setup.

### Added

- Runtime inventory snapshots now expose `inventoryInitializationSource`.
- Added `npm run smoke:inventory-init` to verify fresh, multiplayer, save-restore, and debug inventory initialization paths.

## Autonomous Playtest Inventory Profiles

### Added

- Autonomous playtests now support `empty`, `survival-start`, and `debug-rich` starting inventory profiles.
- The Feedback panel exposes a Starting Inventory selector for local bot runs.
- `npm run simulate:ai` now accepts `-- --inventory=empty`, `-- --inventory=survival-start`, and `-- --inventory=debug-rich`.
- AI reports now include `startingInventoryProfile`, `initialInventory`, `currentInventory`, and `inventoryDelta`.

### Changed

- The default autonomous profile is now `survival-start`, with no tools or building resources.
- The old rich hotbar is preserved behind the explicit `debug-rich` profile.
- Stone progression now gathers enough material for both shelter construction and furnace access from low-resource starts.

## AI Survival Validation And Shelter Progression

### Fixed

- Build Shelter now rejects Grass, Leaves, Water, Campfire, and decorative blocks before placement.
- Shelter and Survive Night goals now validate real world safety instead of assumed progress.
- Gather Wood, crafting, furnace, smelting, and equipment goals now require the expected inventory or world delta before reporting success.
- Exported autonomous QA JSON preserves generated `issues` and `aiTasks` alongside the full simulation result.

### Added

- Shelter validation diagnostics for valid placed blocks, rejected invalid shelter blocks, partial wall/roof coverage, safety score, and night safety.
- AI reports now include `shelterValidation`, `validShelterBlocksPlaced`, `invalidShelterBlocksRejected`, `blockedGoals`, and `recoveryActions`.
- Autonomous smoke coverage now verifies real wood deltas, invalid shelter rejection, night safety validation, export preservation, and blocked-goal recovery.

## AI Tree Detection And Wood Targeting

### Fixed

- Gather Wood now scans loaded chunks for real tree trunk blocks instead of sampling the top block of a tree column.
- AI wood targeting now uses `BLOCK_IDS.wood` as the trunk block and rejects `BLOCK_IDS.leaves` unless leaves actually drop wood.
- The bot now moves toward, faces, mines, and validates trunk targets through real wood inventory delta.
- Wood search recovers by expanding scan radius and moving toward dense vegetation when a tree-capable biome has no visible trunk target.

### Added

- Resource scanner diagnostics for nearest wood target, target distance, scanned wood blocks, rejected leaves, and blocked reasons.
- AI reports now include resource scan results, wood target counts, and wood target rejection counts.

## AI Report Export And Gather Wood Loop

### Fixed

- Exported autonomous QA JSON now preserves generated `issues` and `aiTasks`.
- Gather Wood now advances only from real wood inventory delta, not leaf mining.
- Autonomous mining and goal execution now use cooldowns to prevent unrealistic action spam.
- Mining spam above the QA threshold now produces an exported issue and AI task.

### Added

- AI reports now expose `inventorySnapshot`, `resourceDeltas`, `goalTransitions`, and `failedActions`.
- Autonomous playtest smoke coverage now verifies report aliases, mining throttling, and mining-spam task generation.

## AI Planner Execution Validation

### Fixed

- Prevented autonomous craft actions from logging success when the inventory does not actually change.
- Prevented combat success validation without confirmed entity damage.
- Goal progress now uses resource deltas from the simulation start instead of pre-existing inventory counts.
- Repeated same-action loops and 30 second no-progress goal states now produce AI Director bottlenecks and gameplay tasks.

### Added

- AI reports now include inventory initial/current/delta snapshots.
- AI reports now include crafted items and failed craft attempts.
- Autonomous playtest smoke coverage now verifies fake crafting loop detection and missing-sticks bottlenecks.

## Goal Oriented Survival AI

### Added

- Survival goal planner for autonomous playtests with prioritized goals, requirements, success criteria, and failure criteria.
- Goal route covering wood gathering, plank/tool crafting, stone gathering, shelter building, night survival, furnace access, ore smelting, and equipment upgrades.
- AI plan overlay in the Feedback panel with current goal, subgoal, reason, progress, and target.
- AI Director report fields for completed goals, failed goals, progression tier reached, time spent per goal, and bottlenecks.

### Changed

- Autonomous playtests now execute progression plans instead of random timed action loops.
- Headless and in-engine playtest adapters expose planner state and goal-specific execution hooks.
- Autonomous playtest smoke coverage now validates planner/report shape.

## Autonomous Playtest Simulation

### Added

- Autonomous bot playtest foundation with exploration, mining, placement, collection, crafting, combat, survival, and save/load checks.
- Quick, Standard, and Stress simulation modes.
- In-game `Run Auto Test` control inside the Feedback panel.
- `npm run simulate:ai` headless-friendly report generation into `reports/`.
- Failure detection for stuck states, vertical collision snaps, death loops, console errors, FPS drops, and save/load issues.
- Autonomous playtest smoke coverage in `npm run verify:alpha`.

## AI Director Evolution Foundation

### Added

- Local telemetry for FPS, session duration, console events, gameplay events, deaths, mining, building, and combat counts.
- In-game Feedback panel for generating, copying, and downloading local AI Session Report JSON.
- Auto QA report generation with runtime stats, browser/system capabilities, issue summaries, and AI task proposals.
- AI task generator foundation with bug, UX, performance, gameplay, and polish classifications.
- GitHub issue templates for bug reports, feature requests, and AI task proposals.
- AI Director workflow documentation and Alpha smoke coverage.

## Public Alpha Prep And Deploy Readiness

### Added

- Vercel, Netlify, Render, and Railway deployment configuration.
- Runtime config support for public WebSocket URLs, release labels, and feedback links.
- Public Alpha banner, version display, feedback placeholder, and improved loading/fallback surfaces.
- Production build, runtime config, and WebGL fallback smoke tests.
- Deployment guide and public test flow documentation.

### Changed

- Package version is now `0.1.0-alpha`.
- Dedicated server supports platform `PORT` and deployment host binding.
- Alpha verification now includes public deploy readiness checks.

## Visual Identity And Game Feel

### Added

- Stylized sky gradient with sun and moon visuals.
- Lightweight ambient particle system for biome/weather atmosphere.
- Voxel feedback particles for mining, block placement, hits, and landing.
- Procedural audio feedback foundation for footsteps, mining, hits, landing, ambient pressure, and UI cues.
- Visual/game-feel smoke test added to the Alpha verification suite.

### Changed

- Lighting and fog now react more smoothly to day/night and weather.
- Grass plants, water, and campfires receive lightweight per-instance animation.
- Player avatar animation now includes idle, walk, jump, landing, and mining feedback states.
- Third-person camera now has subtle movement bob and impact shake.

## UX, Camera, And Collision Fixes

### Added

- Third-person orbit camera with mouse rotation and camera-relative movement.
- Voxel humanoid player avatar foundation for future skins.
- Camera/collision smoke test for movement direction, pause gating, and vertical snap protection.

### Changed

- Technical debug overlay is hidden by default and can be toggled with `F3` or settings.
- Legacy Alpha settings migrate the debug overlay back to hidden for a cleaner first impression.
- Combat HUD hides itself when there is no active target, cooldown, or damage feedback.
- Player ground detection now limits upward snapping and ignores tree canopy blocks as walkable support.
- Pause/menu flow now gates camera and movement input while open.

## Alpha Stabilization

### Added

- Alpha verification script for build, settings, inventory/crafting, save migration, and dedicated server smoke checks.
- Alpha v0.1 release checklist.
- AI-agent contribution workflow notes.
- Dedicated server health feedback before entering multiplayer from the main menu.

### Changed

- Tuned Alpha survival drain, sprint stamina, hostile spawn pressure, and mining pacing for a smoother first play pass.
- Improved boot fallback messaging for WebGL or renderer startup failures.
- Made save storage resolution safe for headless QA scripts.
- Added CORS headers to dedicated server status endpoints used by the browser menu.

## Alpha Foundation

### Added

- Alpha main menu with solo play, multiplayer entry, Studio entry, settings, controls, and credits.
- Local settings for graphics quality, render distance, audio volume, controls help, and debug overlay.
- First-launch onboarding and compact controls hint.
- Render distance presets connected to chunk streaming.
- Vite release packaging config that splits Three.js into a separate build chunk.
- Alpha release notes, smoke test list, and known issues documentation.

### Previous Milestones

- Dedicated server and world hosting.
- Creator platform and Studio tools.
- Survival, combat, AI, weather, structures, persistence, and multiplayer foundations.
