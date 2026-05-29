# Godoy Engine

AI-native sandbox engine inspired by Roblox, Minecraft, and creation platforms.

Current phase: Public Alpha v0.1.0-alpha prep.

## What Is Included

- Procedural voxel world with chunk streaming
- Survival gameplay loop with inventory, crafting, mining, combat, and hostile entities
- Multiplayer foundation with a server-authoritative dedicated server
- In-game Studio tools with selection, transform helpers, prefabs, permissions, and publishing metadata
- Alpha shell with main menu, onboarding, settings, controls help, and debug toggle
- AI Director foundation with local telemetry, QA reports, feedback export, and task proposal generation
- Goal-oriented autonomous playtest simulation with survival progression planning and report export

## Requirements

- Node.js LTS or newer
- npm

## Install

```bash
npm install
```

## Run Solo

```bash
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

## Run Dedicated Server

```bash
npm run dedicated:server
```

Server health:

```txt
http://127.0.0.1:8787/health
```

Admin status:

```txt
http://127.0.0.1:8787/admin/status
```

## Multiplayer Test Flow

1. Start the dedicated server with `npm run dedicated:server`.
2. Start the client with `npm run dev`.
3. Open `http://127.0.0.1:5173/?multiplayer=1`.
4. Open a second browser tab or window with the same URL.
5. Move, place blocks, mine blocks, and confirm remote sync/debug metrics.

## Alpha Controls

- `Esc`: main menu
- `F1`: controls help
- `WASD`: move
- Mouse: third-person orbit camera
- Left mouse: mine / interact
- Right mouse: place block
- `F3`: toggle technical debug overlay
- `1-9` or mouse wheel: hotbar selection
- `E`: consume selected item
- `R`: craft first available recipe
- `Q`: melee attack
- `T`: sleep / day skip
- Feedback button: generate, copy, or download a local AI Session Report
- Feedback panel `Run Auto Test`: run autonomous playtest simulation
- `` ` ``: Studio mode
- `F`: select block in Studio
- `G`: cycle Studio tool
- Arrow keys / Page Up / Page Down: move selected Studio block
- `B`: cycle prefab
- `V`: place prefab
- `O`: publish world metadata
- `Ctrl+Z` / `Ctrl+Y`: Studio undo / redo

## Build

```bash
npm run build
```

The build separates Three.js into its own output chunk for cleaner Alpha packaging.

## Alpha Verification

```bash
npm run verify:alpha
```

This runs the production build plus release config, WebGL fallback, AI Director, settings, camera/collision, visual/game-feel, inventory/crafting, save migration, and dedicated server smoke checks.

## AI Director Feedback Loop

The in-game `Feedback` button generates a local AI Session Report. Reports include sanitized telemetry, runtime stats, browser capabilities, summarized issues, and proposed tasks classified as bug, UX, performance, gameplay, or polish.

Reports are never uploaded automatically. Review the JSON before copying it into a GitHub issue or AI task proposal.

## Autonomous Playtest Simulation

Run a headless-friendly bot simulation:

```bash
npm run simulate:ai
```

Optional modes:

```bash
npm run simulate:ai -- --mode=standard
npm run simulate:ai -- --mode=stress
```

Reports are written to `reports/` and ignored by Git by default. The simulation only generates telemetry, QA reports, and suggested tasks; it never commits, pushes, or edits source code at runtime.

The autonomous bot follows a survival progression plan instead of random action timers: gather wood, craft planks/tools, gather stone, build shelter, survive night pressure, obtain a furnace, smelt ore, and upgrade equipment. Reports include completed goals, failed goals, progression tier reached, time spent per goal, and bottlenecks.

## Public Alpha Deploy

The public Alpha uses a split deployment:

- Client: Vercel or Netlify static Vite build.
- Server: Render or Railway Node WebSocket service.

Client build variables:

```txt
VITE_GODOY_RELEASE_VERSION=v0.1.0-alpha
VITE_GODOY_RELEASE_CHANNEL=Public Alpha
VITE_GODOY_WS_URL=wss://YOUR_HOSTED_SERVER
VITE_GODOY_FEEDBACK_URL=https://YOUR_FEEDBACK_FORM_OR_ISSUE_TRACKER
```

Server runtime variables:

```txt
GODOY_MULTIPLAYER_HOST=0.0.0.0
GODOY_SERVER_TICK_RATE=20
GODOY_DEFAULT_WORLD_ID=public-alpha
GODOY_PERSIST_WORLDS=1
```

Deploy configs are included for `vercel.json`, `netlify.toml`, `render.yaml`, and `railway.json`.

Public test flow:

1. Deploy the dedicated server and confirm `/health` returns `ok: true`.
2. Set `VITE_GODOY_WS_URL` on the client host.
3. Deploy the client.
4. Open the deployed client and use Join Multiplayer.
5. Test two tabs against the deployed URL.

## QA Docs

- [Alpha Release Notes](docs/ALPHA_RELEASE_NOTES.md)
- [Alpha v0.1 Checklist](docs/ALPHA_V0_1_CHECKLIST.md)
- [Smoke Tests](docs/QA_SMOKE_TESTS.md)
- [Known Issues](docs/KNOWN_ISSUES.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [AI Director Workflow](docs/AI_DIRECTOR_WORKFLOW.md)
- [AI Agent Workflow](docs/AI_AGENT_WORKFLOW.md)
- [Technical Standards](docs/TECHNICAL_STANDARDS.md)
