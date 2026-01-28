import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createApp } from "../../src/server/index.js";
import { setSessionsDir, upsertSession } from "../../src/db/sessions-json.js";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Create a temporary test sessions directory
const TEST_DIR = join(tmpdir(), "claude-watch-test-" + Date.now());
const TEST_SESSIONS_DIR = join(TEST_DIR, "sessions");

describe("Server API - Sessions", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // Create test directory
    if (!existsSync(TEST_SESSIONS_DIR)) {
      mkdirSync(TEST_SESSIONS_DIR, { recursive: true });
    }

    // Set sessions dir for tests
    setSessionsDir(TEST_SESSIONS_DIR);

    // Create app
    app = createApp();
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("GET /health", () => {
    it("should return ok status", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeDefined();
    });
  });

  describe("GET /api/sessions", () => {
    it("should return sessions response structure", async () => {
      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty("sessions");
      expect(data).toHaveProperty("count");
      expect(data).toHaveProperty("timestamp");
      expect(Array.isArray(data.sessions)).toBe(true);
    });

    it("should return empty array when no sessions exist", async () => {
      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessions).toEqual([]);
      expect(data.count).toBe(0);
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("should return 404 for non-existent session", async () => {
      const res = await app.request("/api/sessions/nonexistent-id-12345");
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("Session not found");
    });

    it("should return session when it exists", async () => {
      // Create a test session
      upsertSession({
        id: "test-session-id",
        pid: 12345,
        cwd: "/test/path",
        tmux_target: null,
        state: "idle",
      });

      const res = await app.request("/api/sessions/test-session-id");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session.id).toBe("test-session-id");
      expect(data.session.cwd).toBe("/test/path");
      expect(data.session.state).toBe("idle");
    });
  });
});

describe("Server API - CORS", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it("should include CORS headers", async () => {
    const res = await app.request("/health", {
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("should respond to OPTIONS requests", async () => {
    const res = await app.request("/api/sessions", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });
    expect(res.status).toBe(204);
  });
});
