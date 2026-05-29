# AI Agent Workflow

Godoy Engine is built for AI-assisted development. Agents should preserve the project shape before expanding it.

## Before Editing

- Read `README.md`, `docs/MASTER_DOCUMENT.md`, `docs/TECHNICAL_STANDARDS.md`, and the relevant release/QA docs.
- Check current Git status.
- Identify which existing system owns the behavior.
- Prefer extending a focused module over creating a parallel implementation.

## While Editing

- Keep simulation state separate from Three.js render objects.
- Preserve server-authoritative multiplayer boundaries.
- Avoid feature creep during stabilization or release passes.
- Keep functions and files AI-readable.
- Update docs when behavior, commands, tests, or release requirements change.

## Before Commit

- Run `npm run verify:alpha`.
- Confirm untracked generated files are intentional.
- Review `git diff --check`.
- Commit only after checks pass.

## Stabilization Priorities

- Fix player-visible bugs first.
- Add smoke coverage for regressions.
- Improve error messages when systems are unavailable.
- Tune balance conservatively.
- Document known limitations instead of hiding Alpha constraints.
