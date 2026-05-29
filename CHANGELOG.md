# Changelog

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
