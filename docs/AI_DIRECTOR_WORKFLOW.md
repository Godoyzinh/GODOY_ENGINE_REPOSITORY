# AI Director Workflow

The AI Director foundation turns local play sessions into reviewable development signals. It does not upload data, edit code, open issues, or modify Git automatically.

## Local Loop

1. Play the Alpha normally.
2. Click the in-game `Feedback` button.
3. Generate an AI Session Report.
4. Review the JSON before sharing it.
5. Copy or download the report.
6. Convert useful generated tasks into GitHub issues or PR plans.

## Autonomous Playtest Loop

The autonomous playtest simulation lets the game exercise itself and generate an AI Session Report. The bot now follows a goal-oriented survival plan instead of a random timed action loop.

Run from the game:

1. Open the `Feedback` panel.
2. Choose Quick, Standard, or Stress.
3. Choose a Starting Inventory profile.
4. Click `Run Auto Test`.
5. Wait for the report to complete.
6. Review, copy, or download the JSON.

Run from the CLI:

```bash
npm run simulate:ai
npm run simulate:ai -- --mode=standard
npm run simulate:ai -- --mode=stress
npm run simulate:ai -- --duration=60 --neural
npm run simulate:ai -- --mode=standard --duration=300 --neural
npm run simulate:ai -- --inventory=empty
npm run simulate:ai -- --inventory=survival-start
npm run simulate:ai -- --inventory=debug-rich
npm run simulate:ai -- --duration=300
npm run simulate:ai -- --mode=evolution
npm run simulate:ai -- --duration=1800
```

Simulation modes:

- Quick Smoke: 60 seconds.
- Standard Test: 5 minutes.
- Stress Test: 15 minutes.
- Evolution Test: 30 minutes by default. The CLI splits this into multiple runs that reuse the same AI memory. A `--duration` of 1800 seconds or more automatically uses evolution mode when `--mode` is left as the default (`quick`).
- Quick, Standard, and Evolution can run planner-only, neural-assisted champion evaluation, or neural training metadata with `--neural`.

Starting inventory profiles:

- Empty: no wood, stone, planks, sticks, tools, furnace, or food.
- Survival Start: minimal food only, with no tools or building resources.
- Debug Rich: the old rich hotbar for fast system checks.

Goal route:

- Gather wood.
- Craft planks.
- Craft sticks.
- Craft a wooden pickaxe.
- Gather stone.
- Build shelter.
- Survive night pressure.
- Obtain a furnace.
- Smelt ore.
- Upgrade equipment.
- Explore the world after iron tier.
- Discover a new biome.
- Discover a structure.
- Create storage.
- Build Base Tier 1.
- Validate storage store/retrieve.
- Build Base Tier 2.
- Create resource reserves.
- Build a permanent base.
- Continue exploration after the current progression ceiling instead of idling in Maintain Survival.

The CLI writes JSON reports into `reports/`. Generated report files are ignored by Git.

## Persistent AI Memory

Autonomous playtests maintain local AI memory so future runs can use evidence from prior sessions. The CLI writes `data/AI_MEMORY.json`, and the browser stores the same schema in localStorage. This file is generated runtime data and is ignored by Git.

AI memory stores:

- successful and failed strategies
- biome statistics
- progression times per goal
- resource discovery metrics
- discovered structures
- resource efficiency
- death causes
- blocked action statistics
- crafting success and failure rates
- shelter success rates
- storage reserves and base tier progress
- learned knowledge shown inside the Feedback panel

Memory is advisory only. It can influence goal reasons and target selection, but it must not skip validation, simulate success, edit source code, commit, push, or upload data.

## What The Report Contains

- FPS and session duration.
- Console error and warning summaries.
- Counts for deaths, mining, building, combat, and report exports.
- Autonomous playtest actions, failures, and completion state when a bot run generated the report.
- Goal planner state: current goal, current subgoal, reason, progress, target, completed goals, failed goals, progression tier reached, time spent per goal, and bottlenecks.
- Inventory initial/current/delta snapshots for autonomous playtests, also exported as `inventorySnapshot` and `resourceDeltas`.
- Actual equipped tool, including missing-pickaxe evidence if Gather Stone starts without a valid mining tool.
- Furnace crafting diagnostics: recipe presence, valid stone-material options, attempted counts, and block reason.
- AI memory: `memorySnapshot`, persistence source, load/save run counts, learned knowledge, new knowledge, learned lessons, strategy changes, optimization suggestions, biome ratings, strategy hints, biome statistics, progression times, resource discovery metrics, discovered structures, storage reserves, and base tier state.
- Storage persistence: reports include placed storage chests, reserve contents, and persisted chest counts for engine-backed auto tests.
- Starting inventory profile plus explicit `initialInventory`, `currentInventory`, and `inventoryDelta` aliases.
- Goal transition history, failed action evidence, and crafted item/failed craft attempt lists, including no-delta craft failures.
- Resource scan results for wood progression, including nearest trunk target, scan radius, scanned wood blocks, rejected leaves, target counts, and blocked reasons.
- Shelter validation results, including valid placed blocks, rejected invalid blocks, wall/roof coverage, safety score, and night safety status.
- Blocked goal and recovery action history for cases where the bot expands wood scans, gathers missing shelter material, requests a safer shelter footprint, searches food, eats food, returns to base, pauses low-health exploration, or avoids risky terrain.
- Terrain safety and death context, including `deathPosition`, `terrainDeathContext`, and survival recovery evidence when terrain risk or low survival stats interrupt exploration.
- Player/camera safety evidence for autonomous runs, including `cameraVoidDetected`, `playerLostRecoveryCount`, `lastSafePosition`, `recoveryTeleportUsed`, `recoverySuccess`, `skyOnlyFrames`, and `gatherWoodBlockedReason`.
- Recovery state-machine evidence, including `recoveryState`, `lastRecoveryState`, `recoveryPauseSpamCount`, `recoveryLoopDetected`, and single-shot pause/resume markers.
- Hard recovery loop evidence, including `recoveryLoopCycles`, `hardRecoveryCount`, `lastFailedGoal`, `lastFailedAction`, `failedTargetPosition`, `blacklistedTargets`, and `emergencyTeleportUsed`.
- Starter false-completion evidence, including `falseCompletionDetected`, `earlyAbortReason`, `woodProgressBy90s`, `craftPlanksBlockedByMissingWood`, and `hardRecoveryMisuseDetected`.
- Post-completion cleanup evidence, including `postCompletionEventsDetected`, `postCompletionDeaths`, and terrain death context with position, `velocityY`, `fallDistance`, `healthBefore`, and `healthAfter`.
- Neural survival agent evidence when enabled, including `neuralAgent.enabled`, generation, champion/current fitness, population size, mutation rate, selected action, action scores, sensor snapshot, decision reason, training mode, whether the selected action executed, neural action counts, neural mine attempts, neural explore steps, neural wood collected, and fitness invalid reason.
- Neural champion evidence separates `bestCandidate` from `champion`: failed or invalid genomes may be preserved for diagnostics, but only positive-fitness runs that collect wood and complete real goals can become valid champions.
- `lastSimulationSnapshot` is included when Feedback reports are generated during or after an autonomous run, even if there is no active `runtimeStats.simulation`.
- Recent sanitized gameplay events.
- Runtime stats for renderer, settings, terrain, entities, survival, networking, and persistence.
- Browser/system capabilities needed for QA.
- AI task proposals classified as bug, UX, performance, gameplay, or polish.

## Privacy Rules

- Reports stay local unless the player copies or downloads them.
- The runtime never sends reports to external APIs.
- Autonomous playtests never commit, push, or modify source files.
- Reports exclude player identity, full page URLs, auth tokens, chat text, and stack traces.
- Players should review report JSON before posting it publicly.

## Task Proposal Rules

AI-generated tasks are suggestions, not commands.

- Link each task to evidence from the report.
- Identify the likely owning module before editing.
- Keep the scope small enough to verify.
- Preserve multiplayer authority, chunk streaming, save compatibility, and UI stability.
- Add or update smoke tests for regressions.
- Treat repeated same-action loops and 30 second no-progress goal states as actionable gameplay tasks.
- Treat mining spam above the QA threshold as an actionable gameplay task, especially when resource deltas do not justify the action count.
- Treat wood target scan blocks as gameplay tasks when the bot is in Gather Wood and a tree-capable biome has no reachable trunk target.
- Treat invalid shelter material, failed shelter safety validation, and no-delta goal success as actionable gameplay tasks.
- Treat terrain deaths, blocked shelter placement reasons, and repeated survival recovery blocks as actionable gameplay tasks.
- Treat sky-only camera states, below-terrain player positions, failed hard recoveries, repeated hard recovery loops, and recovery pause spam as actionable UX tasks.
- Treat neural fitness regressions, blocked target repetition, and missing early wood progress as gameplay tasks; neural decisions may suggest local movement/action changes but must not request hard recovery.

## Neural Training

Use neural training only as an optional local control layer for autonomous playtests. Survival goals remain planner-owned; each survival run is treated as an episode that can produce fitness, progress, and champion evidence.

- `npm run smoke:neural-ai` verifies the neural network, mutation, serialization, fitness scoring, safety boundaries, and champion training.
- `npm run smoke:neural-population` verifies multi-agent population creation, champion save/load, manual-input contamination, quick champion evaluation, blocked target safety, and best-agent selection.
- `npm run train:neural -- --mode=quick --generations=10 --population=32 --duration=60` runs headless population training.
- `npm run train:neural -- --mode=standard --generations=5 --population=16 --duration=300` runs standard-length survival training.
- `npm run train:neural -- --mode=evolution --generations=3 --population=8 --duration=1800` runs long-form survival training.
- The CLI champion is saved locally to `data/AI_NEURAL_CHAMPION.json`; do not commit local champion data unless maintainers intentionally promote a fixture.
- In-game Neural Evolution controls can start Quick, Standard, Evolution, or Train Population runs and can export/import/reset the local champion JSON.
- The survival goal planner remains authoritative for high-level goals; neural output only biases local actions such as moving, turning, mining, collecting, exploring, jumping, or eating/recovering.
- Neural control must never teleport the player, trigger hard recovery, bypass inventory/world validation, or continue a broken run forever.
- Manual input during neural training marks `trainingContaminated = true`, sets `fitnessValid = false`, and blocks champion saving.
- Reports include `neuralEvolution` with planner-only fitness, champion episode fitness, neural-assisted fitness, whether neural improved, whether the champion improved, champion validity/status, best candidate diagnostics, population/agent evaluation counts, target sensor failures, selected action execution, best agent, best goal, wood collected, deaths, blocked actions, hard recovery misuse, ping-pong detection, and recommended next training target.
- A valid champion requires positive fitness, at least one real wood collection, a real completed goal, non-failed status, valid fitness, and uncontaminated training. If no agent meets those gates, reports should show `championSaved = false`, `championValid = false`, `championStatus = "no-valid-champion-yet"`, and a diagnostic `bestCandidate`.

## Branch And PR Rules

- Never modify `main` directly.
- Create work branches using the `codex/` prefix unless maintainers request another prefix.
- One focused change per branch.
- Run `npm run verify:alpha` before commit.
- Open a PR or draft PR for review before merging.
- Do not commit generated reports, `.env` files, secrets, or machine-local paths.

## No Autonomous Destructive Changes

The AI Director can propose:

- bug fixes
- UX polish
- performance investigations
- gameplay balance reviews
- documentation updates

The AI Director must not:

- delete player data
- rewrite stable systems without approval
- change deployment secrets
- push directly to protected branches
- create paid external API dependencies
- edit source code during simulation
