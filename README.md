# Godoy Engine

AI-native sandbox engine inspired by Roblox, Minecraft, and creation platforms.

Current phase: Alpha foundation.

## What Is Included

- Procedural voxel world with chunk streaming
- Survival gameplay loop with inventory, crafting, mining, combat, and hostile entities
- Multiplayer foundation with a server-authoritative dedicated server
- In-game Studio tools with selection, transform helpers, prefabs, permissions, and publishing metadata
- Alpha shell with main menu, onboarding, settings, controls help, and debug toggle

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
- Mouse: look
- Left mouse: mine / interact
- Right mouse: place block
- `1-9` or mouse wheel: hotbar selection
- `E`: consume selected item
- `R`: craft first available recipe
- `Q`: melee attack
- `T`: sleep / day skip
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

This runs the production build plus settings, inventory/crafting, save migration, and dedicated server smoke checks.

## QA Docs

- [Alpha Release Notes](docs/ALPHA_RELEASE_NOTES.md)
- [Alpha v0.1 Checklist](docs/ALPHA_V0_1_CHECKLIST.md)
- [Smoke Tests](docs/QA_SMOKE_TESTS.md)
- [Known Issues](docs/KNOWN_ISSUES.md)
- [AI Agent Workflow](docs/AI_AGENT_WORKFLOW.md)
- [Technical Standards](docs/TECHNICAL_STANDARDS.md)
