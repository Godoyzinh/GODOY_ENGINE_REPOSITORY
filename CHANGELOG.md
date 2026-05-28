# Changelog

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
