# AI Agent Workflow

Godoy Engine is built for AI-assisted development. Agents should preserve the project shape before expanding it.

## Before Editing

- Read `README.md`, `docs/MASTER_DOCUMENT.md`, `docs/TECHNICAL_STANDARDS.md`, and the relevant release/QA docs.
- Read `docs/AI_DIRECTOR_WORKFLOW.md` when a task comes from telemetry, feedback, or an AI Session Report.
- Check current Git status.
- Identify which existing system owns the behavior.
- Prefer extending a focused module over creating a parallel implementation.

## While Editing

- Keep simulation state separate from Three.js render objects.
- Preserve server-authoritative multiplayer boundaries.
- Avoid feature creep during stabilization or release passes.
- Keep functions and files AI-readable.
- Update docs when behavior, commands, tests, or release requirements change.
- Treat AI-generated tasks as proposals that require human review.
- Do not send telemetry or reports to external services.

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

## Branch And PR Rules

- Never commit directly to `main`.
- Use a focused branch, preferably with the `codex/` prefix.
- Keep one task or report-driven fix per branch.
- Open a PR or draft PR for review before merging.
- Do not commit `.env` files, generated QA reports, secrets, tokens, or machine-local absolute paths.

## AI Director Loop

- Use the in-game Feedback panel to generate local AI Session Reports.
- Review report JSON before sharing.
- Convert useful tasks into GitHub issues with the AI task proposal template.
- Classify work as bug, UX, performance, gameplay, or polish.
- Preserve chunk streaming, multiplayer authority, save compatibility, and Alpha UI stability.
- Never allow reports or task generators to make autonomous destructive changes.
