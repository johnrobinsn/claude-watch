import Database from "better-sqlite3";
import { VERSION } from "../utils/version.js";

export const SCHEMA_SQL = `
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

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_last_update ON sessions(last_update);
`;

/**
 * Get a metadata value by key.
 */
export function getMetadata(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/**
 * Set a metadata value (insert or update).
 */
export function setMetadata(
  db: Database.Database,
  key: string,
  value: string
): void {
  db.prepare(
    "INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)"
  ).run(key, value);
}

export function initializeSchema(db: Database.Database): void {
  // Enable WAL mode for better concurrent access
  db.pragma("journal_mode = WAL");

  // Run schema creation
  db.exec(SCHEMA_SQL);

  // Store current version in metadata
  setMetadata(db, "version", VERSION);
}
