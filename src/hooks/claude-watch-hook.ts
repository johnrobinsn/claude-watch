#!/usr/bin/env node

/**
 * Claude Watch Hook Script
 *
 * This script is called by Claude Code hooks to update the session state
 * using JSON files (one per session).
 *
 * Usage: node claude-watch-hook.js <event>
 * Events: session-start, stop, permission-request, notification-idle,
 *         notification-permission, pre-tool-use, post-tool-use, session-end
 *
 * Hook input is received via stdin as JSON.
 */

import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

// Paths
const CLAUDE_WATCH_DIR = join(homedir(), ".claude-watch");
const SESSIONS_DIR = join(CLAUDE_WATCH_DIR, "sessions");
const DEBUG_LOG_PATH = join(CLAUDE_WATCH_DIR, "debug.log");

// Schema version
const SCHEMA_VERSION = 1;

function debugLog(message: string): void {
  const timestamp = new Date().toISOString();
  appendFileSync(DEBUG_LOG_PATH, `${timestamp} ${message}\n`);
}

interface Session {
  v: number;
  id: string;
  pid: number;
  cwd: string;
  tmux_target: string | null;
  state: string;
  current_action: string | null;
  prompt_text: string | null;
  last_update: number;
}

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

function ensureSessionsDir(): void {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getSessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

function readSession(id: string): Session | null {
  const path = getSessionPath(id);
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as Session;
  } catch {
    return null;
  }
}

function writeSession(session: Session): void {
  ensureSessionsDir();
  const path = getSessionPath(session.id);
  const tmpPath = path + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(session, null, 2));
  renameSync(tmpPath, path);
}

function deleteSessionFile(id: string): void {
  const path = getSessionPath(id);
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Ignore
  }
}

// Delete any existing sessions with the same tmux_target (cleanup stale sessions)
function deleteSessionsByTmuxTarget(tmuxTarget: string, excludeId?: string): void {
  try {
    if (!existsSync(SESSIONS_DIR)) return;

    const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const id = file.replace(".json", "");
      if (id === excludeId) continue;

      const session = readSession(id);
      if (session && session.tmux_target === tmuxTarget) {
        debugLog(`deleteSessionsByTmuxTarget: removing stale session ${id} with target ${tmuxTarget}`);
        deleteSessionFile(id);
      }
    }
  } catch {
    // Ignore errors during cleanup
  }
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
  try {
    let pid = process.ppid;
    debugLog(`getClaudePid: starting from ppid=${pid}`);

    for (let i = 0; i < 10; i++) {
      if (pid <= 1) break;

      const psOutput = execSync(`ps -p ${pid} -o ppid=,comm=,args=`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();

      debugLog(`getClaudePid: level ${i}, pid=${pid}, ps output: ${psOutput}`);

      const isClaudeCode =
        psOutput.includes("claude") && !psOutput.includes("claude-watch");

      if (isClaudeCode) {
        debugLog(`getClaudePid: found Claude at pid=${pid}`);
        return pid;
      }

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

function formatToolAction(
  toolName: string,
  toolInput?: HookInput["tool_input"]
): string {
  const name = toolName.replace(/^mcp__[^_]+__/, "");

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

    const timeout = setTimeout(() => {
      reject(new Error("Timeout reading stdin"));
    }, 5000);

    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Failed to parse hook input"));
      }
    });
    process.stdin.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function handleSessionStart(input: HookInput): void {
  const tmuxTarget = getTmuxTarget();

  // Clean up any stale sessions with the same tmux_target before creating new one
  if (tmuxTarget) {
    deleteSessionsByTmuxTarget(tmuxTarget, input.session_id);
  }

  const session: Session = {
    v: SCHEMA_VERSION,
    id: input.session_id,
    pid: getClaudePid(),
    cwd: input.cwd,
    tmux_target: tmuxTarget,
    state: "idle",
    current_action: null,
    prompt_text: null,
    last_update: Date.now(),
  };
  writeSession(session);
}

function handleUserPromptSubmit(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "busy";
  session.current_action = "Thinking...";
  session.last_update = Date.now();
  writeSession(session);
}

function handleStop(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "idle";
  session.current_action = null;
  session.last_update = Date.now();
  writeSession(session);
}

function handlePermissionRequest(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "waiting";
  session.current_action = "Waiting...";
  session.last_update = Date.now();
  writeSession(session);
}

function handleNotificationIdle(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "idle";
  session.current_action = null;
  session.last_update = Date.now();
  writeSession(session);
}

function handleNotificationPermission(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "permission";
  session.current_action = "Waiting for permission";
  session.last_update = Date.now();
  writeSession(session);
}

function handleNotificationElicitation(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "waiting";
  session.current_action = "Waiting for input";
  session.last_update = Date.now();
  writeSession(session);
}

function handlePreToolUse(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "busy";
  session.current_action = input.tool_name
    ? formatToolAction(input.tool_name, input.tool_input)
    : "Working...";
  session.last_update = Date.now();
  writeSession(session);
}

function handlePostToolUse(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "busy";
  session.current_action = null;
  session.last_update = Date.now();
  writeSession(session);
}

function handlePostToolUseFailure(input: HookInput): void {
  const session = readSession(input.session_id);
  if (!session) return;

  session.tmux_target = getTmuxTarget() ?? session.tmux_target;
  session.state = "busy";
  session.current_action = null;
  session.last_update = Date.now();
  writeSession(session);
}

function handleSessionEnd(input: HookInput): void {
  deleteSessionFile(input.session_id);
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
        handleSessionStart(input);
        debugLog(`main: session-start completed`);
        break;
      case "user-prompt-submit":
        handleUserPromptSubmit(input);
        debugLog(`main: user-prompt-submit completed`);
        break;
      case "stop":
        handleStop(input);
        debugLog(`main: stop completed`);
        break;
      case "permission-request":
        handlePermissionRequest(input);
        debugLog(`main: permission-request completed`);
        break;
      case "notification-idle":
        handleNotificationIdle(input);
        debugLog(`main: notification-idle completed`);
        break;
      case "notification-permission":
        handleNotificationPermission(input);
        debugLog(`main: notification-permission completed`);
        break;
      case "notification-elicitation":
        handleNotificationElicitation(input);
        debugLog(`main: notification-elicitation completed`);
        break;
      case "pre-tool-use":
        handlePreToolUse(input);
        debugLog(`main: pre-tool-use completed`);
        break;
      case "post-tool-use":
        handlePostToolUse(input);
        debugLog(`main: post-tool-use completed`);
        break;
      case "post-tool-use-failure":
        handlePostToolUseFailure(input);
        debugLog(`main: post-tool-use-failure completed`);
        break;
      case "session-end":
        handleSessionEnd(input);
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
