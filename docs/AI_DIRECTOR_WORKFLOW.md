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
3. Click `Run Auto Test`.
4. Wait for the report to complete.
5. Review, copy, or download the JSON.

Run from the CLI:

```bash
npm run simulate:ai
npm run simulate:ai -- --mode=standard
npm run simulate:ai -- --mode=stress
```

Simulation modes:

- Quick Smoke: 60 seconds.
- Standard Test: 5 minutes.
- Stress Test: 15 minutes.

Goal route:

- Gather wood.
- Craft planks.
- Craft basic tools.
- Gather stone.
- Build shelter.
- Survive night pressure.
- Obtain a furnace.
- Smelt ore.
- Upgrade equipment.

The CLI writes JSON reports into `reports/`. Generated report files are ignored by Git.

## What The Report Contains

- FPS and session duration.
- Console error and warning summaries.
- Counts for deaths, mining, building, combat, and report exports.
- Autonomous playtest actions, failures, and completion state when a bot run generated the report.
- Goal planner state: current goal, current subgoal, reason, progress, target, completed goals, failed goals, progression tier reached, time spent per goal, and bottlenecks.
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
