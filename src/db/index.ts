import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { DATABASE_PATH } from "../utils/paths.js";
import { initializeSchema } from "./schema.js";
import { isPidAlive } from "../utils/pid.js";
import { getSessionPids, deleteSessionsByPids } from "./sessions.js";

let db: Database.Database | null = null;

/**
 * Get the database connection, creating it if necessary.
 */
export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  // Ensure directory exists
  const dir = dirname(DATABASE_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Open database
  db = new Database(DATABASE_PATH);

  // Initialize schema
  initializeSchema(db);

  return db;
}

/**
 * Get a database connection for a specific path (useful for testing).
 */
export function getDatabaseAt(path: string): Database.Database {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const testDb = new Database(path);
  initializeSchema(testDb);
  return testDb;
}

/**
 * Get an in-memory database (useful for testing).
 */
export function getInMemoryDatabase(): Database.Database {
  const memDb = new Database(":memory:");
  initializeSchema(memDb);
  return memDb;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Clean up stale sessions (PIDs that no longer exist).
 * Sessions with PID 0 are skipped (unknown PID, rely on SessionEnd hook).
 */
export function cleanupStaleSessions(database: Database.Database): number {
  const pids = getSessionPids(database);
  // Skip PID 0 (unknown PID) - these are cleaned up via SessionEnd hook only
  const deadPids = pids.filter((pid) => pid > 0 && !isPidAlive(pid));

  if (deadPids.length > 0) {
    deleteSessionsByPids(database, deadPids);
  }

  return deadPids.length;
}

export * from "./sessions.js";
export * from "./schema.js";
