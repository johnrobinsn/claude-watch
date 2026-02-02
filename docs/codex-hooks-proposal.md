# Codex Notify Hook Enhancement Proposal

**Goal:** Extend Codex's `notify` hook system to support session monitoring tools like claude-watch.

**Target repo:** https://github.com/johnrobinsn/codex (fork of openai/codex)

## Current State

Codex has a minimal notify hook that only fires one event:

```rust
// codex-rs/core/src/user_notification.rs
pub(crate) enum UserNotification {
    AgentTurnComplete {
        thread_id: String,
        turn_id: String,
        cwd: String,
        input_messages: Vec<String>,
        last_assistant_message: Option<String>,
    },
}
```

This is configured via `notify` in `~/.codex/config.toml`:

```toml
notify = ["/path/to/script", "arg1"]
```

The script receives JSON as a CLI argument.

## Proposed Events

### Event Type Enum

Extend `UserNotification` to support multiple event types:

```rust
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub(crate) enum UserNotification {
    // Existing event (unchanged)
    #[serde(rename_all = "kebab-case")]
    AgentTurnComplete {
        thread_id: String,
        turn_id: String,
        cwd: String,
        input_messages: Vec<String>,
        last_assistant_message: Option<String>,
    },

    // NEW: Session lifecycle
    #[serde(rename_all = "kebab-case")]
    SessionStart {
        thread_id: String,
        cwd: String,
        pid: u32,
    },

    #[serde(rename_all = "kebab-case")]
    SessionEnd {
        thread_id: String,
    },

    // NEW: User prompt submitted (agent is now busy)
    #[serde(rename_all = "kebab-case")]
    UserPromptSubmit {
        thread_id: String,
        turn_id: String,
        cwd: String,
        prompt: String,
    },

    // NEW: Approval request (agent waiting for user)
    #[serde(rename_all = "kebab-case")]
    ApprovalRequested {
        thread_id: String,
        turn_id: String,
        approval_type: ApprovalType,
        description: String,
    },

    // NEW: Approval response (user responded)
    #[serde(rename_all = "kebab-case")]
    ApprovalResponse {
        thread_id: String,
        turn_id: String,
        approved: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ApprovalType {
    Exec,       // Shell command execution
    Patch,      // File edit/patch
    Elicitation, // MCP tool input
}
```

### JSON Payload Examples

**session-start:**
```json
{
  "type": "session-start",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "cwd": "/Users/example/project",
  "pid": 12345
}
```

**user-prompt-submit:**
```json
{
  "type": "user-prompt-submit",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "turn-id": "1",
  "cwd": "/Users/example/project",
  "prompt": "Fix the bug in main.rs"
}
```

**approval-requested:**
```json
{
  "type": "approval-requested",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "turn-id": "1",
  "approval-type": "exec",
  "description": "cargo build --release"
}
```

**approval-response:**
```json
{
  "type": "approval-response",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "turn-id": "1",
  "approved": true
}
```

**agent-turn-complete:** (existing, unchanged)
```json
{
  "type": "agent-turn-complete",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666",
  "turn-id": "1",
  "cwd": "/Users/example/project",
  "input-messages": ["Fix the bug in main.rs"],
  "last-assistant-message": "I've fixed the bug..."
}
```

**session-end:**
```json
{
  "type": "session-end",
  "thread-id": "b5f6c1c2-1111-2222-3333-444455556666"
}
```

## State Mapping for claude-watch

| Event | claude-watch State |
|-------|-------------------|
| `session-start` | Create session entry, state = `idle` |
| `user-prompt-submit` | state = `busy` |
| `approval-requested` | state = `permission` |
| `approval-response` (approved) | state = `busy` |
| `approval-response` (denied) | state = `idle` |
| `agent-turn-complete` | state = `idle` |
| `session-end` | Delete session entry |

## Implementation Plan

### Files to Modify

1. **`codex-rs/core/src/user_notification.rs`**
   - Add new enum variants to `UserNotification`
   - Add `ApprovalType` enum
   - Update serialization tests

2. **`codex-rs/core/src/codex.rs`**
   - Add `session-start` notification in `Session::new()`
   - Add `session-end` notification in `Session::drop()` or explicit cleanup
   - Add `user-prompt-submit` notification when turn begins

3. **`codex-rs/tui/src/chatwidget.rs`**
   - Add `approval-requested` notification in:
     - `handle_exec_approval_now()` (line ~2015)
     - `handle_patch_set_now()` (line ~2044)
     - `handle_elicitation_request_now()` (line ~2053)
   - Add `approval-response` notification when user approves/denies

4. **`codex-rs/core/src/codex_delegate.rs`** (if exists)
   - May need to thread notifier through to TUI events

### Hook Points in Existing Code

**Session Start:**
```rust
// codex-rs/core/src/codex.rs, Session::new()
// Around line 712-740
async fn new(...) -> Result<Self, SessionCreationError> {
    let (conversation_id, rollout_params) = ...;

    // NEW: Notify session start
    if let Some(notifier) = &session_configuration.notifier {
        notifier.notify(&UserNotification::SessionStart {
            thread_id: conversation_id.to_string(),
            cwd: session_configuration.cwd.display().to_string(),
            pid: std::process::id(),
        });
    }
    ...
}
```

**User Prompt Submit:**
```rust
// codex-rs/core/src/codex.rs
// When a new turn begins with user input
// The existing code calls new_turn_with_sub_id()
```

**Approval Requested:**
```rust
// codex-rs/tui/src/chatwidget.rs
// handle_exec_approval_now() - line ~2015
// handle_patch_set_now() - line ~2044
// handle_elicitation_request_now() - line ~2053
```

**Turn Complete:** (already implemented)
```rust
// codex-rs/core/src/codex.rs, line 3489
sess.notifier().notify(&UserNotification::AgentTurnComplete { ... });
```

### Threading the Notifier

The main challenge is that approval events happen in the TUI crate, not the core crate. The `UserNotifier` needs to be accessible from `ChatWidget`.

Options:
1. Pass `UserNotifier` to `ChatWidget` at construction
2. Use a channel to send notification requests from TUI to core
3. Move approval notification logic to core (requires restructuring)

**Recommended:** Option 1 - pass `UserNotifier` reference to TUI components.

## Backwards Compatibility

All changes are additive:
- New events won't break existing notify scripts (they just need to handle unknown `type` values)
- `agent-turn-complete` payload unchanged
- No config file changes needed

## Testing

1. **Unit tests** in `user_notification.rs`:
   - Verify JSON serialization for all event types
   - Verify kebab-case field naming

2. **Integration tests**:
   - Verify events fire at correct times
   - Verify PID is correct in session-start

## Example Notify Script

```bash
#!/bin/bash
# ~/.local/bin/codex-notify.sh

event_json="$1"
event_type=$(echo "$event_json" | jq -r '.type')
thread_id=$(echo "$event_json" | jq -r '."thread-id"')

case "$event_type" in
  "session-start")
    echo "Session started: $thread_id"
    ;;
  "user-prompt-submit")
    echo "Working..."
    ;;
  "approval-requested")
    echo "Waiting for approval"
    ;;
  "agent-turn-complete")
    echo "Done"
    ;;
esac
```

## References

- Current notify implementation: `codex-rs/core/src/user_notification.rs`
- Approval handling: `codex-rs/tui/src/chatwidget.rs:2015-2060`
- Tool events (internal): `codex-rs/core/src/tools/events.rs`
- TUI notifications (internal): `codex-rs/tui/src/chatwidget.rs:6075-6105`
