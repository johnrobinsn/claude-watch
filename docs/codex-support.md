# Codex Support Research

Research into adding OpenAI Codex CLI support to claude-watch alongside Claude Code.

## Architecture Comparison

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| Config file | `~/.claude/settings.json` | `~/.codex/config.toml` |
| Hook format | JSON on stdin | JSON as CLI argument |
| Data storage | `~/.claude-watch/sessions/*.json` | `~/.codex/history.jsonl` |
| Language | Node.js | Rust |

## Codex Notify Hook

### Configuration

```toml
# ~/.codex/config.toml
notify = ["path/to/script.sh"]
```

### Supported Events

**Only ONE event type**: `agent-turn-complete`

### Payload Format

```json
{
  "type": "agent-turn-complete",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "turn-id": "12345",
  "cwd": "/Users/example/project",
  "input-messages": ["User prompt here"],
  "last-assistant-message": "Codex response here"
}
```

### Fields

| Field | Description |
|-------|-------------|
| `thread-id` | Conversation/session UUID |
| `turn-id` | ID for this specific turn |
| `cwd` | Working directory |
| `input-messages` | What the user sent to start the turn |
| `last-assistant-message` | Final response from Codex |

## Event Coverage Comparison

| Event | Claude Code Hook | Codex notify | Codex OTel |
|-------|------------------|--------------|------------|
| Session start | `SessionStart` ✅ | ❌ | ✅ `codex.conversation_starts` |
| User prompt | `UserPromptSubmit` ✅ | ❌ | ✅ `codex.user_prompt` |
| Tool execution | `PreToolUse`/`PostToolUse` ✅ | ❌ | ✅ |
| Turn complete | `Stop` ✅ | ✅ `agent-turn-complete` | ✅ |
| Permission needed | `PermissionRequest` ✅ | ❌ | ✅ `approval-requested` |
| User interrupt (Esc) | ❌ (tmux polling) | ❌ | ❌ |
| Session end | `SessionEnd` ✅ | ❌ | ❓ |

## State Mapping

| claude-watch State | Claude Code Trigger | Codex Trigger |
|--------------------|---------------------|---------------|
| `busy` | UserPromptSubmit, PreToolUse | Infer from no recent turn-complete |
| `idle` | Stop | agent-turn-complete |
| `waiting` | Notification (idle_prompt) | ❌ Not available |
| `permission` | PermissionRequest | ❌ Not available (OTel only) |

## OTel Alternative

Codex supports OpenTelemetry for full event coverage, but requires:

- Running an OTLP collector
- Complex configuration
- Overkill for a TUI monitoring tool

```toml
[otel]
exporter = "otlp-http"
endpoint = "https://your-collector.com/v1/logs"
```

## Built-in Codex Notifications

Codex already has terminal notifications:

```toml
[tui]
notification_method = "auto"  # "osc9", "bel", or "auto"
```

And custom commands:

```toml
# macOS sound
notify = ["bash", "-lc", "afplay /System/Library/Sounds/Blow.aiff"]

# Linux desktop notification
notify = ["notify-send", "Codex", "Turn complete"]

# Push notification via ntfy.sh
notify = ["curl", "-d", "Codex done", "ntfy.sh/my-topic"]
```

## tmux Polling Challenges

For Claude Code, we poll tmux panes to detect Escape interruptions by looking for text like "Interrupted" or "User declined".

For Codex, this is harder because:

1. Codex uses ratatui modal overlays for approvals
2. Complex TUI rendering with cursor positioning and ANSI styling
3. Text patterns less recognizable via `tmux capture-pane`
4. Different approval types (exec, patch, elicitation) look different

## Implementation Options

### Option 1: Minimal (notify only)

- Only show sessions after first turn completes
- No "waiting" or "permission" states
- Easy setup, reliable but limited

### Option 2: Hybrid (notify + tmux polling)

- Use notify for turn complete → idle
- Poll tmux panes for state detection (experimental)
- Better UX but requires tmux and pattern matching work

### Option 3: Full OTel

- Complete event coverage
- Requires users to run OTLP collector
- Probably overkill

## Recommended Approach

Start with **Option 1** (notify hook only):

1. Create `codex-watch-hook.sh` that receives JSON as argument
2. Write to same session JSON format as Claude Code
3. Add `source: "codex"` field to distinguish sessions
4. Setup routine to add hook to `~/.codex/config.toml`

Limitations to accept for v1:

- Sessions appear only after first turn completes
- No "waiting for approval" state
- Same tmux interrupt detection gap as Claude Code

## Missing Data for Codex

| Data | Claude Code | Codex |
|------|-------------|-------|
| PID | ✅ Available | ❌ Not in notify payload |
| tmux target | ✅ Detected at session start | ❌ Would need separate detection |
| Window name | ✅ Can capture | ❌ Same challenge |

## Files to Create/Modify

For Codex support:

- `src/hooks/codex-watch-hook.ts` (or .sh) - New hook script
- `src/db/sessions-json.ts` - Add `source` field to Session type
- `src/setup/codex.ts` - Setup for config.toml modification
- `src/components/SessionEntry.tsx` - Show source indicator (Claude vs Codex)

## References

- [Codex GitHub](https://github.com/openai/codex)
- [Codex Advanced Configuration](https://developers.openai.com/codex/config-advanced/)
- [Hook Discussion #2150](https://github.com/openai/codex/discussions/2150)
