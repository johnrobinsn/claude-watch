import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `claude-watch-db-test-${Date.now()}`);
const testDbPath = join(testDir, "test.db");

describe("db/index filesystem", () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    vi.resetModules();
  });

  describe("getDatabaseAt", () => {
    it("should create database at specified path", async () => {
      const { getDatabaseAt } = await import("../../src/db/index.js");
      const db = getDatabaseAt(testDbPath);

      expect(existsSync(testDbPath)).toBe(true);

      // Verify it works
      const stmt = db.prepare("SELECT 1 as test");
      const result = stmt.get() as { test: number };
      expect(result.test).toBe(1);

      db.close();
    });

    it("should create parent directory if it does not exist", async () => {
      const nestedPath = join(testDir, "nested", "dir", "db.sqlite");

      const { getDatabaseAt } = await import("../../src/db/index.js");
      const db = getDatabaseAt(nestedPath);

      expect(existsSync(nestedPath)).toBe(true);
      db.close();
    });

    it("should initialize schema", async () => {
      const { getDatabaseAt } = await import("../../src/db/index.js");
      const db = getDatabaseAt(testDbPath);

      // Schema should be initialized
      const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
      const result = stmt.get() as { name: string } | undefined;
      expect(result?.name).toBe("sessions");

      db.close();
    });
  });
});
