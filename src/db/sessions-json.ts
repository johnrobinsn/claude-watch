import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";
import { isPidAlive } from "../utils/pid.js";

// Paths
const CLAUDE_WATCH_DIR = join(homedir(), ".claude-watch");
const DEFAULT_SESSIONS_DIR = join(CLAUDE_WATCH_DIR, "sessions");

// Schema version
const SCHEMA_VERSION = 1;

// Allow overriding sessions directory for testing
let sessionsDir = DEFAULT_SESSIONS_DIR;

/**
 * Set sessions directory (for testing).
 */
export function setSessionsDir(dir: string | null): void {
  sessionsDir = dir ?? DEFAULT_SESSIONS_DIR;
}

export type SessionState = "busy" | "idle" | "waiting" | "permission";

export interface Session {
  v: number;
  id: string;
  pid: number;
  cwd: string;
  tmux_target: string | null;
  window_name: string | null;
  state: SessionState;
  current_action: string | null;
  prompt_text: string | null;
  last_update: number;
}

export interface SessionInput {
  id: string;
  pid: number;
  cwd: string;
  tmux_target?: string | null;
  window_name?: string | null;
  state?: SessionState;
  current_action?: string | null;
  prompt_text?: string | null;
}

export interface SessionUpdate {
  state?: SessionState;
  current_action?: string | null;
  prompt_text?: string | null;
  tmux_target?: string | null;
  window_name?: string | null;
}

/**
 * Ensure sessions directory exists.
 */
function ensureSessionsDir(): void {
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }
}

/**
 * Get the file path for a session.
 */
function getSessionPath(id: string): string {
  return join(sessionsDir, `${id}.json`);
}

/**
 * Atomically write a session file (temp + rename).
 */
function writeSessionFile(session: Session): void {
  ensureSessionsDir();
  const path = getSessionPath(session.id);
  const tmpPath = path + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(session, null, 2));
  renameSync(tmpPath, path);
}

/**
 * Read a session from its JSON file.
 */
export function getSession(id: string): Session | null {
  const path = getSessionPath(id);
  try {
    if (!existsSync(path)) return null;
    const data = readFileSync(path, "utf-8");
    return JSON.parse(data) as Session;
  } catch {
    return null;
  }
}

/**
 * Create or update a session.
 */
export function upsertSession(input: SessionInput): void {
  const existing = getSession(input.id);

  const session: Session = {
    v: SCHEMA_VERSION,
    id: input.id,
    pid: input.pid,
    cwd: input.cwd,
    tmux_target: input.tmux_target ?? existing?.tmux_target ?? null,
    window_name: input.window_name ?? existing?.window_name ?? null,
    state: input.state ?? existing?.state ?? "busy",
    current_action: input.current_action ?? existing?.current_action ?? null,
    prompt_text: input.prompt_text ?? existing?.prompt_text ?? null,
    last_update: Date.now(),
  };

  writeSessionFile(session);
}

/**
 * Update specific fields of a session.
 */
export function updateSession(id: string, update: SessionUpdate): void {
  const session = getSession(id);
  if (!session) return;

  if (update.state !== undefined) {
    session.state = update.state;
  }
  if (update.current_action !== undefined) {
    session.current_action = update.current_action;
  }
  if (update.prompt_text !== undefined) {
    session.prompt_text = update.prompt_text;
  }
  if (update.tmux_target !== undefined) {
    session.tmux_target = update.tmux_target;
  }
  if (update.window_name !== undefined) {
    session.window_name = update.window_name;
  }
  session.last_update = Date.now();

  writeSessionFile(session);
}

/**
 * Delete a session file.
 */
export function deleteSession(id: string): void {
  const path = getSessionPath(id);
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    // Ignore errors (file may already be deleted)
  }
}

/**
 * Get all sessions, sorted by priority (permission > waiting > idle > busy).
 */
export function getAllSessions(): Session[] {
  ensureSessionsDir();

  const sessions: Session[] = [];

  try {
    const files = readdirSync(sessionsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      try {
        const data = readFileSync(join(sessionsDir, file), "utf-8");
        sessions.push(JSON.parse(data) as Session);
      } catch {
        // Skip corrupt or deleted files
        continue;
      }
    }
  } catch {
    return [];
  }

  // Sort by priority: permission > waiting > idle > busy
  const priority: Record<SessionState, number> = {
    permission: 1,
    waiting: 2,
    idle: 3,
    busy: 4,
  };

  sessions.sort((a, b) => {
    const pa = priority[a.state] ?? 5;
    const pb = priority[b.state] ?? 5;
    if (pa !== pb) return pa - pb;
    return b.last_update - a.last_update;
  });

  return sessions;
}

/**
 * Get all session PIDs.
 */
export function getSessionPids(): number[] {
  return getAllSessions().map((s) => s.pid);
}

/**
 * Delete sessions by PIDs.
 */
export function deleteSessionsByPids(pids: number[]): void {
  if (pids.length === 0) return;

  const pidSet = new Set(pids);
  const sessions = getAllSessions();

  for (const session of sessions) {
    if (pidSet.has(session.pid)) {
      deleteSession(session.id);
    }
  }
}

/**
 * Clean up stale sessions (PIDs that no longer exist).
 */
export function cleanupStaleSessions(): number {
  ensureSessionsDir();

  let removed = 0;

  try {
    const files = readdirSync(sessionsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const path = join(sessionsDir, file);
      try {
        const data = readFileSync(path, "utf-8");
        const session = JSON.parse(data) as Session;

        // Skip PID 0 (unknown) - only session-end can clean those
        if (session.pid > 0 && !isPidAlive(session.pid)) {
          unlinkSync(path);
          removed++;
        }
      } catch {
        // Corrupted file - remove it
        try {
          unlinkSync(path);
          removed++;
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return removed;
}

/**
 * Get sessions directory path (for testing).
 */
export function getSessionsDir(): string {
  return sessionsDir;
}
