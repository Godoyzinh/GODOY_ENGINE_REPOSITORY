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
- Build a permanent base.

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
- AI memory: `memorySnapshot`, learned knowledge, new knowledge, learned lessons, strategy changes, optimization suggestions, biome ratings, strategy hints, biome statistics, progression times, resource discovery metrics, discovered structures, storage reserves, and base tier state.
- Starting inventory profile plus explicit `initialInventory`, `currentInventory`, and `inventoryDelta` aliases.
- Goal transition history, failed action evidence, and crafted item/failed craft attempt lists, including no-delta craft failures.
- Resource scan results for wood progression, including nearest trunk target, scan radius, scanned wood blocks, rejected leaves, target counts, and blocked reasons.
- Shelter validation results, including valid placed blocks, rejected invalid blocks, wall/roof coverage, safety score, and night safety status.
- Blocked goal and recovery action history for cases where the bot expands wood scans, gathers missing shelter material, or requests a safer shelter footprint.
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
