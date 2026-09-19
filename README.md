# KOHLER AI Bathroom Designer & Planner

Interactive AI bathroom design and planning prototype. AI proposes and reasons;
deterministic systems validate and optimize. Offline-first (PRD N1/N2): after
`npm install`, the core loop runs with no network, no API keys, no GPU.

## Local commands

| Command | What it does |
|---|---|
| `npm install` | Single root install of all workspace dependencies. |
| `npm run build` | Build all workspaces in topological order (engine before web). |
| `npm test` | Run workspace test suites (Vitest). |
| `npm run typecheck` | Type-check all workspaces (`tsc --noEmit`). |
| `npm run dev` | Prebuild the engine, then start the Vite dev server for web. |
| `npm start` | Build everything, then run the server (offline run path). |

## Packages

| Package | Boundary |
|---|---|
| `packages/engine` (`@kolher/engine`) | Deterministic core. Pure TypeScript, zero runtime dependencies, DOM-free — the single authority for feasibility, compatibility and cost. |
| `packages/web` (`@kolher/web`) | Framework-free browser UI built with Vite; consumes the engine as an in-process workspace module. |
| `packages/server` (`@kolher/server`) | Thin Node built-in HTTP server (static host + optional AI proxy). Placeholder until T-012. |

Authoritative docs: `docs/PRD.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/DECISIONS.md`.
# Kohler-Test-Case-1-Submission
