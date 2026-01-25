import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  upsertSession,
  updateSession,
  getSession,
  getAllSessions,
  deleteSession,
  getSessionPids,
  deleteSessionsByPids,
} from "../../src/db/sessions.js";
import { initializeSchema } from "../../src/db/schema.js";

describe("sessions", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initializeSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("upsertSession", () => {
    it("should insert a new session", () => {
      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/home/user/project",
      });

      const session = getSession(db, "session-1");
      expect(session).not.toBeNull();
      expect(session?.id).toBe("session-1");
      expect(session?.pid).toBe(1234);
      expect(session?.cwd).toBe("/home/user/project");
      expect(session?.state).toBe("busy");
    });

    it("should update an existing session", () => {
      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/home/user/project",
      });

      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/home/user/other-project",
        state: "idle",
      });

      const session = getSession(db, "session-1");
      expect(session?.cwd).toBe("/home/user/other-project");
      expect(session?.state).toBe("idle");
    });

    it("should store tmux_target", () => {
      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/home/user/project",
        tmux_target: "main:0.1",
      });

      const session = getSession(db, "session-1");
      expect(session?.tmux_target).toBe("main:0.1");
    });

    it("should handle null tmux_target", () => {
      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/home/user/project",
        tmux_target: null,
      });

      const session = getSession(db, "session-1");
      expect(session?.tmux_target).toBeNull();
    });
  });

  describe("updateSession", () => {
    beforeEach(() => {
      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/home/user/project",
      });
    });

    it("should update state", () => {
      updateSession(db, "session-1", { state: "waiting" });

      const session = getSession(db, "session-1");
      expect(session?.state).toBe("waiting");
    });

    it("should update current_action", () => {
      updateSession(db, "session-1", { current_action: "Running: Bash" });

      const session = getSession(db, "session-1");
      expect(session?.current_action).toBe("Running: Bash");
    });

    it("should update prompt_text", () => {
      updateSession(db, "session-1", { prompt_text: "What should I do next?" });

      const session = getSession(db, "session-1");
      expect(session?.prompt_text).toBe("What should I do next?");
    });

    it("should update last_update timestamp", () => {
      const before = Date.now();
      updateSession(db, "session-1", { state: "idle" });
      const after = Date.now();

      const session = getSession(db, "session-1");
      expect(session?.last_update).toBeGreaterThanOrEqual(before);
      expect(session?.last_update).toBeLessThanOrEqual(after);
    });
  });

  describe("getAllSessions", () => {
    it("should return empty array when no sessions", () => {
      const sessions = getAllSessions(db);
      expect(sessions).toEqual([]);
    });

    it("should return all sessions sorted by priority", () => {
      upsertSession(db, {
        id: "session-1",
        pid: 1001,
        cwd: "/project1",
        state: "busy",
      });
      upsertSession(db, {
        id: "session-2",
        pid: 1002,
        cwd: "/project2",
        state: "waiting",
      });
      upsertSession(db, {
        id: "session-3",
        pid: 1003,
        cwd: "/project3",
        state: "permission",
      });
      upsertSession(db, {
        id: "session-4",
        pid: 1004,
        cwd: "/project4",
        state: "idle",
      });

      const sessions = getAllSessions(db);
      expect(sessions.length).toBe(4);
      // Permission first, then waiting, then idle, then busy
      expect(sessions[0].state).toBe("permission");
      expect(sessions[1].state).toBe("waiting");
      expect(sessions[2].state).toBe("idle");
      expect(sessions[3].state).toBe("busy");
    });
  });

  describe("deleteSession", () => {
    it("should delete a session", () => {
      upsertSession(db, {
        id: "session-1",
        pid: 1234,
        cwd: "/project",
      });

      deleteSession(db, "session-1");

      const session = getSession(db, "session-1");
      expect(session).toBeNull();
    });

    it("should not throw when deleting non-existent session", () => {
      expect(() => deleteSession(db, "non-existent")).not.toThrow();
    });
  });

  describe("getSessionPids", () => {
    it("should return all PIDs", () => {
      upsertSession(db, { id: "s1", pid: 1001, cwd: "/p1" });
      upsertSession(db, { id: "s2", pid: 1002, cwd: "/p2" });
      upsertSession(db, { id: "s3", pid: 1003, cwd: "/p3" });

      const pids = getSessionPids(db);
      expect(pids).toContain(1001);
      expect(pids).toContain(1002);
      expect(pids).toContain(1003);
      expect(pids.length).toBe(3);
    });
  });

  describe("deleteSessionsByPids", () => {
    it("should delete sessions by PIDs", () => {
      upsertSession(db, { id: "s1", pid: 1001, cwd: "/p1" });
      upsertSession(db, { id: "s2", pid: 1002, cwd: "/p2" });
      upsertSession(db, { id: "s3", pid: 1003, cwd: "/p3" });

      deleteSessionsByPids(db, [1001, 1003]);

      const sessions = getAllSessions(db);
      expect(sessions.length).toBe(1);
      expect(sessions[0].id).toBe("s2");
    });

    it("should handle empty PID array", () => {
      upsertSession(db, { id: "s1", pid: 1001, cwd: "/p1" });

      deleteSessionsByPids(db, []);

      const sessions = getAllSessions(db);
      expect(sessions.length).toBe(1);
    });
  });
});
