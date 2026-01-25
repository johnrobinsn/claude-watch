import Database from "better-sqlite3";

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

CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_last_update ON sessions(last_update);
`;

export function initializeSchema(db: Database.Database): void {
  // Enable WAL mode for better concurrent access
  db.pragma("journal_mode = WAL");

  // Run schema creation
  db.exec(SCHEMA_SQL);
}
