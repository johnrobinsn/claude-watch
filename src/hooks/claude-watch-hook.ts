#!/usr/bin/env node

/**
 * Claude Watch Hook Script
 *
 * This script is called by Claude Code hooks to update the session state
 * in the claude-watch database.
 *
 * Usage: node claude-watch-hook.js <event>
 * Events: session-start, stop, permission-request, notification-idle,
 *         notification-permission, pre-tool-use, post-tool-use, session-end
 *
 * Hook input is received via stdin as JSON.
 */

import { execSync } from "child_process";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, appendFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

// Paths
const CLAUDE_WATCH_DIR = join(homedir(), ".claude-watch");
const DATABASE_PATH = join(CLAUDE_WATCH_DIR, "state.db");
const DEBUG_LOG_PATH = join(CLAUDE_WATCH_DIR, "debug.log");

function debugLog(message: string): void {
  const timestamp = new Date().toISOString();
  appendFileSync(DEBUG_LOG_PATH, `${timestamp} ${message}\n`);
}

// Schema
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    pid INTEGER NOT NULL,
    cwd TEXT NOT NULL,
    tmux_target TEXT,
    state TEXT NOT NULL DEFAULT 'busy',
    current_action TEXT,
    prompt_text TEXT,
    last_update INTEGER NOT NULL,
    metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_last_update ON sessions(last_update);
`;

interface HookInput {
  session_id: string;
  cwd: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    file_path?: string;
    description?: string;
  };
}

function getDatabase(): Database.Database {
  if (!existsSync(CLAUDE_WATCH_DIR)) {
    mkdirSync(CLAUDE_WATCH_DIR, { recursive: true });
  }

  const db = new Database(DATABASE_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);
  return db;
}

function getTmuxTarget(): string | null {
  if (!process.env.TMUX) {
    return null;
  }

  try {
    const result = execSync(
      'tmux display-message -p "#{session_name}:#{window_index}.#{pane_index}"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return result.trim();
  } catch {
    return null;
  }
}

function getClaudePid(): number {
  // Walk up the process tree to find the Claude Code process
  // The hook is run by: Claude -> shell -> node (this script)
  // We need to find the Claude process (node running @anthropic-ai/claude-code)

  try {
    let pid = process.ppid;
    debugLog(`getClaudePid: starting from ppid=${pid}`);

    // Walk up to 10 levels to find Claude
    for (let i = 0; i < 10; i++) {
      if (pid <= 1) break;

      // Get process info using ps
      const psOutput = execSync(`ps -p ${pid} -o ppid=,comm=,args=`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      debugLog(`getClaudePid: level ${i}, pid=${pid}, ps output: ${psOutput}`);

      // Check if this is the Claude process
      // Match "claude" but NOT "claude-watch" (our hook)
      const isClaudeCode =
        psOutput.includes("claude") &&
        !psOutput.includes("claude-watch");

      if (isClaudeCode) {
        debugLog(`getClaudePid: found Claude at pid=${pid}`);
        return pid;
      }

      // Get parent PID and continue up the tree
      const ppid = parseInt(psOutput.split(/\s+/)[0], 10);
      if (isNaN(ppid) || ppid <= 1) break;

      pid = ppid;
    }
  } catch (e) {
    debugLog(`getClaudePid: error - ${e}`);
  }

  debugLog(`getClaudePid: returning 0 (not found)`);
  return 0;
}

function formatToolAction(toolName: string, toolInput?: HookInput["tool_input"]): string {
  const name = toolName.replace(/^mcp__[^_]+__/, ""); // Strip MCP prefix

  switch (toolName) {
    case "Bash":
      if (toolInput?.command) {
        const cmd = toolInput.command.slice(0, 30);
        return `Bash: ${cmd}${toolInput.command.length > 30 ? "..." : ""}`;
      }
      return "Running: Bash";

    case "Read":
    case "Edit":
    case "Write":
      if (toolInput?.file_path) {
        const file = toolInput.file_path.split("/").pop() || toolInput.file_path;
        return `${toolName}: ${file}`;
      }
      return `Running: ${toolName}`;

    case "Grep":
    case "Glob":
      return `Searching...`;

    case "Task":
      return "Running agent...";

    default:
      return `Running: ${name}`;
  }
}

async function readStdin(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = "";

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Failed to parse hook input"));
      }
    });
    process.stdin.on("error", reject);

    // Timeout after 5 seconds
    setTimeout(() => {
      reject(new Error("Timeout reading stdin"));
    }, 5000);
  });
}

async function handleSessionStart(input: HookInput): Promise<void> {
  const db = getDatabase();

  // Start as 'idle' - Claude shows prompt immediately, user needs to give input
  // State changes to 'busy' when PreToolUse fires
  const stmt = db.prepare(`
    INSERT INTO sessions (id, pid, cwd, tmux_target, state, last_update)
    VALUES (?, ?, ?, ?, 'idle', ?)
    ON CONFLICT(id) DO UPDATE SET
      pid = excluded.pid,
      cwd = excluded.cwd,
      tmux_target = excluded.tmux_target,
      state = 'idle',
      current_action = NULL,
      last_update = excluded.last_update
  `);

  stmt.run(input.session_id, getClaudePid(), input.cwd, getTmuxTarget(), Date.now());
  db.close();
}

async function handleUserPromptSubmit(input: HookInput): Promise<void> {
  const db = getDatabase();

  // User submitted a prompt, Claude is now working
  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'busy', current_action = 'Thinking...', last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handleStop(input: HookInput): Promise<void> {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'idle', current_action = NULL, last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handlePermissionRequest(input: HookInput): Promise<void> {
  const db = getDatabase();

  // PermissionRequest fires for both permission dialogs and elicitations
  // Set a generic waiting state - Notification hooks will update with specifics
  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'waiting', current_action = 'Waiting...', last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handleNotificationIdle(input: HookInput): Promise<void> {
  const db = getDatabase();

  // idle_prompt means Claude is at the prompt waiting for user input
  // This is 'idle' state (not 'waiting' which is for questions/elicitations)
  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'idle', current_action = NULL, last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handleNotificationPermission(input: HookInput): Promise<void> {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'permission', current_action = 'Waiting for permission', last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handleNotificationElicitation(input: HookInput): Promise<void> {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'waiting', current_action = 'Waiting for input', last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handlePreToolUse(input: HookInput): Promise<void> {
  const db = getDatabase();

  const action = input.tool_name
    ? formatToolAction(input.tool_name, input.tool_input)
    : "Working...";

  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'busy', current_action = ?, last_update = ?
    WHERE id = ?
  `);

  stmt.run(action, Date.now(), input.session_id);
  db.close();
}

async function handlePostToolUse(input: HookInput): Promise<void> {
  const db = getDatabase();

  // Tool completed, update timestamp, keep state as busy (more tools may follow)
  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'busy', current_action = NULL, last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handlePostToolUseFailure(input: HookInput): Promise<void> {
  const db = getDatabase();

  // Tool failed/cancelled, go back to busy (Claude will continue or stop)
  const stmt = db.prepare(`
    UPDATE sessions
    SET state = 'busy', current_action = NULL, last_update = ?
    WHERE id = ?
  `);

  stmt.run(Date.now(), input.session_id);
  db.close();
}

async function handleSessionEnd(input: HookInput): Promise<void> {
  const db = getDatabase();

  const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
  stmt.run(input.session_id);
  db.close();
}

async function main(): Promise<void> {
  const event = process.argv[2];

  debugLog(`main: event=${event}`);

  if (!event) {
    console.error("Usage: claude-watch-hook <event>");
    process.exit(1);
  }

  try {
    const input = await readStdin();
    debugLog(`main: session_id=${input.session_id}, cwd=${input.cwd}`);

    switch (event) {
      case "session-start":
        await handleSessionStart(input);
        debugLog(`main: session-start completed`);
        break;
      case "user-prompt-submit":
        await handleUserPromptSubmit(input);
        debugLog(`main: user-prompt-submit completed`);
        break;
      case "stop":
        await handleStop(input);
        debugLog(`main: stop completed`);
        break;
      case "permission-request":
        await handlePermissionRequest(input);
        debugLog(`main: permission-request completed`);
        break;
      case "notification-idle":
        await handleNotificationIdle(input);
        debugLog(`main: notification-idle completed`);
        break;
      case "notification-permission":
        await handleNotificationPermission(input);
        debugLog(`main: notification-permission completed`);
        break;
      case "notification-elicitation":
        await handleNotificationElicitation(input);
        debugLog(`main: notification-elicitation completed`);
        break;
      case "pre-tool-use":
        await handlePreToolUse(input);
        debugLog(`main: pre-tool-use completed`);
        break;
      case "post-tool-use":
        await handlePostToolUse(input);
        debugLog(`main: post-tool-use completed`);
        break;
      case "post-tool-use-failure":
        await handlePostToolUseFailure(input);
        debugLog(`main: post-tool-use-failure completed`);
        break;
      case "session-end":
        await handleSessionEnd(input);
        debugLog(`main: session-end completed`);
        break;
      default:
        debugLog(`main: unknown event ${event}`);
        console.error(`Unknown event: ${event}`);
        process.exit(1);
    }
  } catch (error) {
    debugLog(`main: error - ${error}`);
    process.exit(0);
  }
}

main();
