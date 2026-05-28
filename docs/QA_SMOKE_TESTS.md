# QA Smoke Tests

Run these before tagging an Alpha build.

## Client

- `npm run build` completes successfully.
- Open `http://127.0.0.1:5173/`.
- Main menu appears on first launch.
- Play Solo hides the menu and the world renders.
- Settings change graphics quality, render distance, audio volume, controls help, and debug visibility.
- First-launch onboarding can be dismissed and stays dismissed after reload.
- `Esc` opens the menu after play starts.
- `F1` opens controls help.

## Gameplay

- Player can move, jump, sprint, crouch, and fly in creative mode.
- Blocks can be mined and placed.
- Hotbar selection works with number keys and scroll wheel.
- Crafting and consumable use still work.
- Combat hit/cooldown UI still updates.

## Studio

- Backquote toggles Studio mode.
- `F` selects a block.
- Arrow keys and Page Up/Page Down move selected Studio block.
- `Ctrl+Z` and `Ctrl+Y` undo/redo Studio edits.
- `B` cycles prefab selection.
- `V` places the selected prefab when space is clear.
- `O` records publish metadata.

## Multiplayer

- Start server with `npm run dedicated:server`.
- Health endpoint returns `ok: true`.
- Two browser tabs can join `?multiplayer=1`.
- Player snapshots replicate.
- Block edits replicate.
- Studio edit permissions reject viewer edits.
- Admin status includes hosted worlds, active editors, published worlds, and network metrics.

## Packaging

- `npm run build` outputs app and Three.js chunks.
- README command flow is accurate.
- Alpha release notes and known issues are present.
