# claude-watch

A terminal UI dashboard for monitoring multiple Claude Code sessions running in tmux. See at a glance which sessions need attention, which are idle, and which are actively working—then jump to any session with a single keystroke.

**Requires tmux.** claude-watch is designed to run inside tmux and leverages tmux for session management, navigation, and state detection.

<!--[claude-watch dashboard](https://placeholder-for-screenshot.png)-->
https://github.com/user-attachments/assets/74d77eee-191e-4224-aa87-9985efd1ace7

## Features

- **Real-time monitoring** of all Claude Code sessions across tmux
- **Color-coded status indicators**:
  - 🔴 Red — Waiting for permission or user input
  - 🟡 Yellow — Idle at prompt
  - 🟢 Green — Actively working
- **tmux session list** — Also shows non-Claude tmux sessions for easy navigation
- **Quick navigation** — Press Enter to jump directly to any session
- **Fullscreen TUI** — Uses alternate screen buffer, restores terminal on exit
- **Automatic session management** — Automatically creates and switches to a dedicated `watch` session
- **Automatic cleanup** — Removes stale sessions when Claude processes exit

## Installation

### From npm (recommended)

```bash
npm install -g @johnrobinsn/claude-watch
```

### From source

```bash
git clone https://github.com/johnrobinsn/claude-watch.git
cd claude-watch
npm install
npm run build
npm link  # Makes 'claude-watch' available globally
```

## Setup

Run the interactive setup wizard:

```bash
claude-watch --setup
```

This will:

1. **Create the data directory** at `~/.claude-watch/`
2. **Install Claude Code hooks** in `~/.claude/settings.json`

The tmux keybinding (`prefix + w`) is added automatically when claude-watch starts.

## Usage

### Starting the dashboard

From any tmux session, simply run:

```bash
claude-watch
```

This will automatically:
1. Create a `watch` session if it doesn't exist
2. Switch you to the `watch` session
3. Start the dashboard

If you run claude-watch outside of tmux, it will print an error and exit.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `Enter` | Jump to selected session |
| `h` | Toggle help dialog |
| `q` | Quit dashboard |

### Quick access

From any tmux session, press `prefix + w` to jump to the dashboard.

## How It Works

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│  Hook Scripts    │────▶│  JSON Files     │
│  (running)      │     │  (on events)     │     │  (sessions/)    │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
┌─────────────────┐     ┌──────────────────┐              │
│  tmux panes     │────▶│  Pane Polling    │──────────────┤
│  (capture)      │     │  (every 2s)      │              │
└─────────────────┘     └──────────────────┘              │
                                                          ▼
                                               ┌─────────────────┐
                                               │  claude-watch   │
                                               │  TUI (polling)  │
                                               └─────────────────┘
```

### Claude Code Hooks

claude-watch uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to track session state changes:

| Hook | Purpose |
|------|---------|
| `SessionStart` | Register new session with PID and working directory |
| `UserPromptSubmit` | Mark session as busy ("Thinking...") |
| `PreToolUse` | Update status with current tool name |
| `PostToolUse` | Clear tool-specific status |
| `Stop` | Mark session as idle when turn ends |
| `Notification` | Handle idle prompts, permission requests, elicitations |
| `SessionEnd` | Remove session from tracking |

### Tmux Pane Polling

> **NOTE:** This heuristic exists because Claude Code does not currently provide a hook for when the user interrupts Claude with the Escape key. If a `UserInterrupt` hook is added to Claude Code in the future, this polling mechanism should be revisited.

Hooks don't fire when the user presses Escape to interrupt Claude mid-response. To handle this, claude-watch polls tmux panes every 2 seconds:

- If `"Esc to interrupt"` is visible → Claude is working (busy)
- If `"Esc to interrupt"` is NOT visible → Claude is idle

This bidirectional sync ensures the dashboard accurately reflects the true state even when hooks don't fire.

### Data Storage

Session state is stored as individual JSON files in `~/.claude-watch/sessions/`, one file per session. This approach eliminates native compilation requirements and allows atomic updates via temp file + rename.

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

## Development

### Prerequisites

- Node.js >= 18
- npm
- tmux (for full functionality)

### Running locally

```bash
# Clone the repository
git clone https://github.com/johnrobinsn/claude-watch.git
cd claude-watch

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run directly
node dist/cli.js

# Or link for global access
npm link
claude-watch
```

### Development workflow

```bash
# Watch mode (rebuild on changes)
npm run build -- --watch

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check test coverage
npm run coverage

# Lint code
npm run lint

# Format code
npm run format
```

### Project structure

```
claude-watch/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── app.tsx             # Main React/Ink app
│   ├── components/         # UI components
│   │   ├── Header.tsx
│   │   ├── HelpDialog.tsx
│   │   ├── SessionEntry.tsx
│   │   ├── SessionList.tsx
│   │   └── StatusBar.tsx
│   ├── db/                 # Session storage (JSON files)
│   │   ├── sessions-json.ts
│   │   └── index.ts
│   ├── hooks/              # Claude Code hook handler
│   │   └── claude-watch-hook.ts
│   ├── setup/              # Setup wizard
│   │   ├── hooks.ts
│   │   └── index.ts
│   ├── tmux/               # tmux integration
│   │   ├── detect.ts
│   │   ├── navigate.ts
│   │   └── pane.ts
│   └── utils/
│       ├── paths.ts
│       ├── pid.ts
│       └── version.ts
└── tests/                  # Test files (mirrors src/)
```

## Upgrading

### From npm

```bash
npm update -g @johnrobinsn/claude-watch
claude-watch --setup  # Reinstall hooks with updated paths
```

### From source

```bash
cd claude-watch
git pull
npm install
npm run build
claude-watch --setup  # Reinstall hooks with updated paths
```

## Uninstall

Remove hooks from Claude Code settings:

```bash
claude-watch --cleanup
```

This will remove claude-watch hooks from `~/.claude/settings.json`.

To fully uninstall the package:

```bash
# Remove hooks first
claude-watch --cleanup

# Uninstall the npm package
npm uninstall -g @johnrobinsn/claude-watch

# Remove data directory (optional)
rm -rf ~/.claude-watch
```

## Troubleshooting

### Sessions not appearing

1. Ensure you ran `claude-watch --setup` to install hooks
2. Restart any running Claude Code sessions (hooks are loaded at startup)
3. Check that `~/.claude/settings.json` contains the claude-watch hooks

### Status not updating

1. Check that hooks are installed: `cat ~/.claude/settings.json | grep claude-watch`
2. Ensure sessions directory exists: `ls ~/.claude-watch/sessions/`
3. Restart Claude Code sessions to pick up new hooks

### "No sessions" when Claude is running

The Claude session may have started before hooks were installed. Restart Claude Code to pick up the new hooks.

### tmux binding not working

The `prefix + w` binding is added dynamically when claude-watch starts. If it's not working:

1. Ensure claude-watch has been started at least once in this tmux server
2. Check binding exists: `tmux list-keys | grep "switch-client -t watch"`

## Requirements

- **Node.js** >= 18
- **tmux** (required)
- **Claude Code** with hooks support

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request
