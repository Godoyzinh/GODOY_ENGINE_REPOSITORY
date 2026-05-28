# Alpha v0.1 Checklist

Use this checklist before tagging or sharing an Alpha build.

## Required Verification

- `npm install` completes on a clean checkout.
- `npm run verify:alpha` passes.
- `npm run dev` starts the client.
- `npm run dedicated:server` starts the server.
- `http://127.0.0.1:8787/health` returns `ok: true`.
- Main menu opens on first launch.
- Play Solo enters the world without console errors.
- Join Multiplayer shows a clear offline message when the dedicated server is not running.
- Two multiplayer tabs can connect after the dedicated server starts.
- Settings persist after reload.
- Save migration smoke test passes.
- Inventory/crafting smoke test passes.

## Manual Play Pass

- Move, jump, sprint, crouch, and fly in creative mode.
- Mine and place blocks.
- Craft at least one recipe.
- Consume food from the selected hotbar slot.
- Trigger one hostile encounter.
- Toggle Studio mode, select a block, move it, undo, and redo.
- Place one prefab.
- Publish local world metadata.
- Sleep to skip night.

## Release Gate

- README command flow is accurate.
- Known limitations are documented.
- Alpha release notes are current.
- No generated runtime data is staged.
- `docs/FULL_CODE_SNAPSHOT.md` is excluded unless intentionally requested.
