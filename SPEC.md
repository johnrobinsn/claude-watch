# claude-watch Specification

A TUI dashboard for monitoring and navigating Claude Code sessions, with deep tmux integration.

## Overview

claude-watch monitors all running Claude Code sessions via hooks and displays them in a prioritized, interactive list. When running under tmux, users can instantly jump to any session that needs attention and quickly return to the dashboard.

## Architecture

### Components

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│  JSON Files      │◀────│  claude-watch   │
│  (with hooks)   │     │  ~/.claude-watch │     │  (Ink TUI)      │
└─────────────────┘     │  /sessions/      │     └─────────────────┘
                        └──────────────────┘
```

### IPC Mechanism

**Per-session JSON files** at `~/.claude-watch/sessions/{session_id}.json`

Rationale:
- Hooks can write even when claude-watch isn't running
- Atomic writes via temp file + rename prevent corruption
- No native compilation required (unlike SQLite bindings)
- Easy debugging via `cat` or any JSON tool
- Simple recovery on claude-watch restart
- Straightforward test fixtures

Schema (JSON):
```json
{
  "v": 1,
  "id": "session-uuid",
  "pid": 12345,
  "cwd": "/path/to/project",
  "tmux_target": "main:1.0",
  "window_name": "vim",
  "state": "busy",
  "current_action": "Running: Bash",
  "prompt_text": null,
  "last_update": 1706745600000
}
```

### Data Location

All data stored in `~/.claude-watch/`:
- `sessions/` - Per-session JSON files
- `claude-watch.lock` - Lock file to prevent duplicate instances

## Hooks Integration

### Required Hooks

Claude-watch installs the following hooks in `~/.claude/settings.json`:

| Hook Event | Purpose |
|------------|---------|
| `SessionStart` | Register new session with PID, cwd, tmux target |
| `Stop` | Mark session as idle/waiting (fast detection) |
| `PermissionRequest` | Mark session as waiting for permission (red state) |
| `Notification` | Catch `idle_prompt` after 60s, `permission_prompt` |
| `PreToolUse` | Update current_action with tool being executed |
| `PostToolUse` | Clear current_action or update state |
| `SessionEnd` | Remove session from database |

### tmux Detection

Hooks detect tmux environment via:
```bash
if [ -n "$TMUX" ]; then
    TMUX_TARGET=$(tmux display-message -p '#{session_name}:#{window_index}.#{pane_index}')
fi
```

### Input Detection Strategy

Multi-signal approach for responsive detection:

1. **Immediate**: `Stop` hook fires when Claude finishes responding → set state to `idle`
2. **Immediate**: `PermissionRequest` hook → set state to `permission` (red)
3. **Fallback**: `Notification` with `idle_prompt` matcher after 60s idle → set state to `waiting`

State transitions:
- `busy` → `idle` (Stop hook, waiting for user input)
- `idle` → `busy` (PreToolUse hook)
- `idle` → `waiting` (Notification idle_prompt)
- `*` → `permission` (PermissionRequest hook)
- `permission` → `busy` (PreToolUse after permission granted)

## TUI Design

### Technology

- **Framework**: Ink (React-like components for terminal)
- **Language**: TypeScript
- **Node.js**: ≥18 LTS

### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ claude-watch                                    3 sessions      │
├─────────────────────────────────────────────────────────────────┤
│ ● ~/projects/api          main:1.0    Waiting: permission       │
│ ● ~/projects/webapp       dev:2.1     Idle                      │
│ ○ ~/projects/cli          main:0.0    Running: Bash (npm test)  │
│                                                                 │
│                                                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [Enter] Jump to session  [↑↓/jk] Navigate  [q] Quit             │
└─────────────────────────────────────────────────────────────────┘
```

### Status Indicators

Unicode symbols with ANSI colors:

| State | Symbol | Color | Meaning |
|-------|--------|-------|---------|
| Waiting/Permission | ● | Red | Needs user input or permission |
| Idle | ● | Yellow | Claude finished, may need input |
| Busy | ● | Green (blinking) | Claude is working |

The green busy indicator blinks on/off to show activity.

### Entry Content

Each session entry displays:
1. Status bullet (colored)
2. Working directory (truncated path)
3. tmux target (`session:window.pane`) or "no tmux"
4. Current action or state description

### Sort Order

Sessions sorted by priority (needs attention first):
1. Red (waiting/permission) - by last_update descending
2. Yellow (idle) - by last_update descending
3. Green (busy) - by last_update descending

### Input Handling

Supports both keyboard and mouse:

**Keyboard:**
- `↑`/`k` - Move selection up
- `↓`/`j` - Move selection down
- `Enter` - Jump to selected session
- `q` - Quit claude-watch

**Mouse:**
- Click to select session
- Double-click to jump to session
- Scroll wheel to navigate list

## tmux Integration

### Dedicated Session

claude-watch is designed to run in its own tmux session (named `watch`). This allows the `prefix + w` binding to reliably return to the dashboard.

### Keybinding

Default binding: `prefix + w`

This overrides the default tmux `choose-tree` binding but provides quick access to the dashboard. The binding is added dynamically when claude-watch starts:

```tmux
bind-key w switch-client -t "watch:1.1"
```

### Cross-Session Navigation

When jumping to a Claude session in a different tmux session:
- Uses `tmux switch-client -t <target>` for full session switch
- Works across tmux sessions, not just windows/panes

### Session Navigation Command

claude-watch executes:
```bash
tmux switch-client -t "<session>:<window>.<pane>"
```

## Installation & Setup

### Distribution

Published as npm global package:
```bash
npm install -g claude-watch
```

### Setup Command

```bash
claude-watch --setup
```

This command:
1. Creates `~/.claude-watch/` directory
2. Creates `~/.claude-watch/sessions/` directory for session files
3. **Shows diff** of proposed changes to `~/.claude/settings.json`
4. **Prompts for confirmation** before modifying hooks

### Hook Installation

The setup preserves existing hooks by:
1. Reading current `~/.claude/settings.json`
2. Parsing existing hook configurations
3. Merging claude-watch hooks with existing ones
4. Showing a clear diff of changes
5. Only writing after user confirmation

### Cleanup

```bash
claude-watch --cleanup
```

Removes hooks from Claude Code settings. Optionally clean up data directory manually.

## Session Lifecycle

### Registration

On `SessionStart`:
1. Hook captures PID, cwd, tmux target (if available)
2. Creates/updates session JSON file in `~/.claude-watch/sessions/`
3. Sets initial state to `busy`

### State Updates

Hooks update session state in real-time as Claude works.

### Cleanup

**PID Polling**: claude-watch periodically (every 5s) checks if session PIDs are still alive. Dead sessions are automatically removed.

**On Startup**: claude-watch checks all existing sessions for liveness and removes stale JSON files silently.

**SessionEnd Hook**: Removes session JSON file when Claude exits normally.

## Testing Strategy

### Unit Tests

**TUI Components**: Use `ink-testing-library` to test components in isolation:
- Render components with mock props
- Assert on rendered output
- Test keyboard/mouse event handling

**Storage Layer**: Test JSON file operations with temp directory:
- Session CRUD operations
- Atomic write handling
- File cleanup

**Hook Scripts**: Test hook logic with mock inputs:
- tmux detection
- State transitions
- Error handling

### Integration Tests

**End-to-End**: Mock Claude hooks by writing JSON files directly:
- Simulate session lifecycle events
- Verify TUI reflects state changes
- Test navigation commands

No real Claude sessions needed in CI - hooks are simulated via direct JSON file writes.

### Coverage

**Tool**: NYC/Istanbul
**Threshold**: 80% line and branch coverage enforced in CI

Coverage report integrated with test runs:
```bash
npm test -- --coverage
```

## Configuration

Optional `~/.claude-watch/config.json`:

```json
{
  "pollInterval": 5000,
  "tmuxSession": "watch",
  "tmuxBinding": "w"
}
```

Most users won't need to configure anything.

## CLI Interface

```bash
# Start the TUI dashboard
claude-watch

# Run setup wizard
claude-watch --setup

# Remove hooks from Claude Code settings
claude-watch --cleanup

# Show version
claude-watch --version

# Show help
claude-watch --help
```

## Error Handling

- **File write failures**: Atomic writes via temp + rename prevent corruption
- **tmux not available**: Show sessions but disable navigation
- **Hook write failures**: Log to stderr, don't crash
- **Invalid session data**: Skip malformed JSON files, log warning

## Future Considerations

Not in initial scope, but may be added later:
- Session filtering/search
- Vim-style navigation (g/G)
- Session dismissal/hiding
- Custom sort orders
- Notification sounds/desktop notifications
- Multi-monitor awareness

## Dependencies

### Platform Support

Works on any platform where Node.js and tmux are available:
- **Linux** (all major distributions)
- **macOS** (Intel and Apple Silicon)

### Runtime
- Node.js ≥18
- Ink (TUI framework)
- Commander (CLI parsing)
- tmux (required for full functionality)

### Development
- TypeScript
- Vitest or Jest
- ink-testing-library
- NYC/Istanbul (coverage)
- ESLint + Prettier

## Project Structure

```
claude-watch/
├── src/
│   ├── cli.ts              # Entry point, argument parsing
│   ├── app.tsx             # Main Ink application
│   ├── components/         # Ink components
│   │   ├── Header.tsx
│   │   ├── HelpDialog.tsx
│   │   ├── SessionEntry.tsx
│   │   ├── SessionList.tsx
│   │   └── StatusBar.tsx
│   ├── db/
│   │   ├── sessions-json.ts # Session CRUD (JSON files)
│   │   └── index.ts
│   ├── hooks/              # Claude Code hook handler
│   │   └── claude-watch-hook.ts
│   ├── tmux/
│   │   ├── detect.ts       # tmux environment detection
│   │   ├── navigate.ts     # Session navigation
│   │   └── pane.ts         # Pane content capture
│   ├── setup/
│   │   ├── hooks.ts        # Hook installation
│   │   └── index.ts        # Setup wizard
│   └── utils/
│       ├── paths.ts        # Path utilities
│       ├── pid.ts          # PID liveness checking
│       └── version.ts      # Version constant
├── tests/
│   ├── components/
│   ├── db/
│   ├── setup/
│   └── tmux/
├── package.json
├── tsconfig.json
└── README.md
```
