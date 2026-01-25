import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getInMemoryDatabase, cleanupStaleSessions } from "../../src/db/index.js";
import { upsertSession } from "../../src/db/sessions.js";
import Database from "better-sqlite3";

describe("db/index", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = getInMemoryDatabase();
  });

  afterEach(() => {
    db.close();
  });

  describe("getInMemoryDatabase", () => {
    it("should create a working in-memory database", () => {
      expect(db).toBeDefined();

      // Verify schema is initialized by inserting a session
      upsertSession(db, {
        id: "test-session",
        pid: 1234,
        cwd: "/test",
      });

      const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
      const row = stmt.get("test-session");
      expect(row).toBeDefined();
    });
  });

  describe("cleanupStaleSessions", () => {
    it("should remove sessions with dead PIDs", () => {
      // Insert a session with a non-existent PID
      upsertSession(db, {
        id: "dead-session",
        pid: 999999999, // Very unlikely to exist
        cwd: "/test",
      });

      const removed = cleanupStaleSessions(db);
      expect(removed).toBe(1);

      const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
      const row = stmt.get("dead-session");
      expect(row).toBeUndefined();
    });

    it("should keep sessions with alive PIDs", () => {
      // Insert a session with our current PID
      upsertSession(db, {
        id: "alive-session",
        pid: process.pid,
        cwd: "/test",
      });

      const removed = cleanupStaleSessions(db);
      expect(removed).toBe(0);

      const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
      const row = stmt.get("alive-session");
      expect(row).toBeDefined();
    });

    it("should handle empty database", () => {
      const removed = cleanupStaleSessions(db);
      expect(removed).toBe(0);
    });
  });
});
