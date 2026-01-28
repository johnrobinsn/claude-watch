# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Server (Fork-specific)

The dev server runs at **http://localhost:3000** (started with `bun run dev:serve`).

To restart the server, run `bun dev:serve --host 0.0.0.0` in the appropriate tmux pane.

## Build & Development Commands

```bash
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode TypeScript compilation
npm run dev:serve      # Build + run with --watch (fork feature)
npm test               # Run vitest tests
npm run test:watch     # Watch mode tests
npm run lint           # ESLint check
npm run format         # Prettier formatting
```

Run a single test file:
```bash
npx vitest run tests/db/sessions.test.ts
```

## Architecture

claude-watch has three main components that work together:

### 1. Claude Code Hooks → JSON Files
The hook script (`src/hooks/claude-watch-hook.ts`) runs inside Claude Code's process. It receives events via stdin (SessionStart, UserPromptSubmit, PreToolUse, Stop, etc.) and writes state to per-session JSON files in `~/.claude-watch/sessions/`.

### 2. JSON Files → TUI/Web Server
The TUI (`src/app.tsx`) and HTTP server (`src/server/index.ts`, fork feature) poll the session files every 500ms.

### 3. State Detection
**Hooks are authoritative** for all state transitions. Pane content polling only catches one edge case: when the user presses Escape to interrupt (no hook fires for this). The `checkForInterruption()` function in `src/tmux/pane.ts` detects "Interrupted" or "User declined" messages and transitions to idle.

See `docs/state-transitions.md` for the full state machine documentation.

## Key Data Flow

```
Claude Code events → stdin → hook script → JSON files (~/.claude-watch/sessions/)
                                                ↓
                                TUI/Server polls every 500ms
                                                ↓
                                Pane check for Escape interruptions only
```

## Session States

| State | Color | Description |
|-------|-------|-------------|
| `idle` | Yellow | Ready for new task |
| `busy` | Green | Working (thinking, tool use) |
| `waiting` | Red | Asking user a question |
| `permission` | Red | Needs permission to proceed |

## Important Files

- `src/cli.ts` - Entry point, routes to subcommands
- `src/hooks/claude-watch-hook.ts` - Runs in Claude's process, writes JSON
- `src/db/sessions-json.ts` - Session CRUD operations on JSON files
- `src/tmux/pane.ts` - `checkForInterruption()` detects Escape interruptions
- `src/app.tsx` - TUI application
- `src/server/index.ts` - HTTP server (fork feature)

## tmux Integration

- TUI auto-creates a `watch` tmux session
- `prefix + w` keybinding jumps to watch session (set dynamically)
- Pane targets use format: `session:window.pane` (e.g., "main:1.0")
