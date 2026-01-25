# Demo Data Script

Generate a demo database with mock sessions for screenshots and demos.

## Usage

```bash
# Create the demo database
node scripts/demo-data.js create

# Run claude-watch with the demo database
claude-watch --demo-db ~/.claude-watch/demo.db

# Clean up when done
node scripts/demo-data.js clean
```

## Commands

| Command | Description |
|---------|-------------|
| `create` | Creates a demo database at `~/.claude-watch/demo.db` |
| `clean` | Removes the demo database |

## Demo Sessions

The script creates 7 sessions showing all states:

| State | Color | Count | Details |
|-------|-------|-------|---------|
| busy | Green | 3 | Running: Bash, Running: Edit, Working... |
| idle | Yellow | 2 | |
| permission | Red | 1 | |
| waiting | Red | 1 | With prompt text |

## Notes

- The `--demo-db` flag disables tmux pane polling, so states won't change
- Real tmux sessions are not shown in demo mode
- The demo database is stored separately from your real data
