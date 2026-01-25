# Removing claude-watch Hooks

## Using the Uninstall Command (Recommended)

The easiest way to remove claude-watch hooks is to use the built-in uninstall command:

```bash
claude-watch --uninstall
```

This will automatically remove all claude-watch hooks from your Claude Code settings.

## Manual Removal

If you need to remove the hooks manually (e.g., if claude-watch is no longer installed or the uninstall command isn't working), follow these steps:

### 1. Locate the Settings File

Claude Code settings are stored at:

```
~/.claude/settings.json
```

### 2. Open the File

```bash
# View the current contents
cat ~/.claude/settings.json

# Edit with your preferred editor
nano ~/.claude/settings.json
# or
vim ~/.claude/settings.json
# or
code ~/.claude/settings.json
```

### 3. Identify claude-watch Hooks

Look for the `"hooks"` section in the JSON. claude-watch hooks can be identified by commands containing `claude-watch-hook`. They look like this:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/claude-watch/dist/hooks/claude-watch-hook.js\" session-start"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/claude-watch/dist/hooks/claude-watch-hook.js\" user-prompt-submit"
          }
        ]
      }
    ]
    // ... more hooks
  }
}
```

### 4. Remove the Hooks

Remove entries for the following hook events that contain `claude-watch-hook` in the command:

- `SessionStart`
- `UserPromptSubmit`
- `Stop`
- `PermissionRequest`
- `Notification` (may have multiple entries with different matchers)
- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`
- `SessionEnd`

**Important:** Only remove entries that contain `claude-watch-hook`. If you have other hooks configured (from other tools), leave those in place.

### 5. Clean Up Empty Sections

After removing the hooks, if a hook event has no remaining entries, you can remove the entire event key. If the `hooks` object is empty, you can remove it entirely:

**Before:**
```json
{
  "hooks": {
    "SessionStart": []
  },
  "someOtherSetting": true
}
```

**After:**
```json
{
  "someOtherSetting": true
}
```

### 6. Validate the JSON

Make sure the resulting file is valid JSON. Common issues:
- Trailing commas (not allowed in JSON)
- Missing closing braces or brackets
- Unmatched quotes

You can validate with:

```bash
cat ~/.claude/settings.json | python3 -m json.tool
```

If valid, it will print the formatted JSON. If invalid, it will show an error.

### 7. Restart Claude Code

After modifying the settings file, restart any running Claude Code sessions for the changes to take effect.

## Removing the Data Directory

If you want to completely remove claude-watch data:

```bash
rm -rf ~/.claude-watch
```

This removes the SQLite database and any other claude-watch data.
