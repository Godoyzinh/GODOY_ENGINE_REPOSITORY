# Alpha Release Notes

## Godoy Engine Alpha v0.1.0-alpha

This Alpha packages the project as a playable sandbox survival creation prototype.

## Highlights

- Main menu and first-launch onboarding.
- Solo and multiplayer launch flow with dedicated server health feedback.
- Settings for graphics quality, render distance, audio volume, controls help, and debug visibility.
- Third-person orbit camera, camera-relative movement, and a simple voxel humanoid avatar.
- Stylized sky gradient, sun/moon visuals, tuned fog/lighting, ambient particles, and light voxel game-feel effects.
- Procedural audio cue foundation for footsteps, mining, hits, landing, ambient pressure, and UI interaction.
- Minimal gameplay HUD by default with technical debug data hidden behind settings or `F3`.
- In-game Studio entry point with existing selection, prefab, undo/redo, and publish foundations.
- Dedicated server command and admin endpoints.
- Public Alpha banner, version display, feedback placeholder, and improved loading/WebGL fallback messaging.
- Deployment configs for Vercel, Netlify, Render, and Railway.
- Runtime config for public WebSocket server URLs and feedback links.
- Local AI Director foundation with telemetry, QA reports, issue summaries, and AI task proposals.
- In-game Feedback panel for copying or downloading local session reports.
- Alpha verification script covering build, release config, WebGL fallback, settings, inventory/crafting, save migration, and server smoke checks.
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

## Public Alpha Deploy

1. Deploy the dedicated server on Render or Railway.
2. Confirm `/health` returns `ok: true`.
3. Set `VITE_GODOY_WS_URL` to the deployed `wss://` server URL on Vercel or Netlify.
4. Deploy the static client.
5. Test solo and multiplayer flows from the deployed client URL.

## Server Commands

```bash
npm run dedicated:server
npm run multiplayer:server
npm start
npm run verify:alpha
```

Both commands currently start the same dedicated server entry point.

`npm run verify:alpha` runs the Alpha release smoke suite.

## AI Session Reports

Use the in-game `Feedback` button to generate a local JSON report. Reports stay on the player's machine until copied or downloaded and are intended for bug reports, AI task proposals, and QA triage.

## WebGL Fallback

If the browser cannot create a WebGL context, the app shows a fallback error screen. Try updating GPU drivers, enabling hardware acceleration, or using a current Chrome/Edge/Firefox build.
