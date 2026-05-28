# Alpha Release Notes

## Godoy Engine Alpha

This Alpha packages the project as a playable sandbox survival creation prototype.

## Highlights

- Main menu and first-launch onboarding.
- Solo and multiplayer launch flow.
- Settings for graphics quality, render distance, audio volume, controls help, and debug visibility.
- In-game Studio entry point with existing selection, prefab, undo/redo, and publish foundations.
- Dedicated server command and admin endpoints.
- Release build output split into app and Three.js chunks.

## How To Play

1. Run `npm install`.
2. Run `npm run dev`.
3. Open `http://127.0.0.1:5173/`.
4. Use the main menu to start solo play or enter Studio mode.

## How To Test Multiplayer

1. Run `npm run dedicated:server`.
2. Run `npm run dev`.
3. Open `http://127.0.0.1:5173/?multiplayer=1` in two tabs.
4. Watch the debug overlay for network, world, and replication stats.

## Server Commands

```bash
npm run dedicated:server
npm run multiplayer:server
```

Both commands currently start the same dedicated server entry point.

## WebGL Fallback

If the browser cannot create a WebGL context, the app shows a fallback error screen. Try updating GPU drivers, enabling hardware acceleration, or using a current Chrome/Edge/Firefox build.
