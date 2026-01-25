import Database from "better-sqlite3";

export type SessionState = "busy" | "idle" | "waiting" | "permission";

export interface Session {
  id: string;
  pid: number;
  cwd: string;
  tmux_target: string | null;
  state: SessionState;
  current_action: string | null;
  prompt_text: string | null;
  last_update: number;
  metadata: string | null;
}

export interface SessionInput {
  id: string;
  pid: number;
  cwd: string;
  tmux_target?: string | null;
  state?: SessionState;
  current_action?: string | null;
  prompt_text?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface SessionUpdate {
  state?: SessionState;
  current_action?: string | null;
  prompt_text?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function upsertSession(db: Database.Database, input: SessionInput): void {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, pid, cwd, tmux_target, state, current_action, prompt_text, last_update, metadata)
    VALUES (@id, @pid, @cwd, @tmux_target, @state, @current_action, @prompt_text, @last_update, @metadata)
    ON CONFLICT(id) DO UPDATE SET
      pid = @pid,
      cwd = @cwd,
      tmux_target = @tmux_target,
      state = @state,
      current_action = @current_action,
      prompt_text = @prompt_text,
      last_update = @last_update,
      metadata = @metadata
  `);

  stmt.run({
    id: input.id,
    pid: input.pid,
    cwd: input.cwd,
    tmux_target: input.tmux_target ?? null,
    state: input.state ?? "busy",
    current_action: input.current_action ?? null,
    prompt_text: input.prompt_text ?? null,
    last_update: Date.now(),
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export function updateSession(db: Database.Database, id: string, update: SessionUpdate): void {
  const fields: string[] = ["last_update = @last_update"];
  const params: Record<string, unknown> = {
    id,
    last_update: Date.now(),
  };

  if (update.state !== undefined) {
    fields.push("state = @state");
    params.state = update.state;
  }

  if (update.current_action !== undefined) {
    fields.push("current_action = @current_action");
    params.current_action = update.current_action;
  }

  if (update.prompt_text !== undefined) {
    fields.push("prompt_text = @prompt_text");
    params.prompt_text = update.prompt_text;
  }

  if (update.metadata !== undefined) {
    fields.push("metadata = @metadata");
    params.metadata = update.metadata ? JSON.stringify(update.metadata) : null;
  }

  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE id = @id`);
  stmt.run(params);
}

export function getSession(db: Database.Database, id: string): Session | null {
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
  return (stmt.get(id) as Session) ?? null;
}

export function getAllSessions(db: Database.Database): Session[] {
  const stmt = db.prepare(`
    SELECT * FROM sessions
    ORDER BY
      CASE state
        WHEN 'permission' THEN 1
        WHEN 'waiting' THEN 2
        WHEN 'idle' THEN 3
        WHEN 'busy' THEN 4
        ELSE 5
      END,
      last_update DESC
  `);
  return stmt.all() as Session[];
}

export function deleteSession(db: Database.Database, id: string): void {
  const stmt = db.prepare("DELETE FROM sessions WHERE id = ?");
  stmt.run(id);
}

export function deleteSessionsByPids(db: Database.Database, pids: number[]): void {
  if (pids.length === 0) return;

  const placeholders = pids.map(() => "?").join(",");
  const stmt = db.prepare(`DELETE FROM sessions WHERE pid IN (${placeholders})`);
  stmt.run(...pids);
}

export function getSessionPids(db: Database.Database): number[] {
  const stmt = db.prepare("SELECT pid FROM sessions");
  return (stmt.all() as { pid: number }[]).map((row) => row.pid);
}
