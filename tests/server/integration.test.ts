import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { setSessionsDir, upsertSession, getAllSessions } from "../../src/db/sessions-json.js";

// Test configuration
const TEST_PORT = 13456;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DIR = join(tmpdir(), "claude-watch-integration-" + Date.now());
const SESSIONS_DIR = join(TEST_DIR, "sessions");

describe("Integration: API Server", () => {
  let server: { stop: () => void } | null = null;

  beforeAll(async () => {
    // Ensure directory exists
    if (!existsSync(SESSIONS_DIR)) {
      mkdirSync(SESSIONS_DIR, { recursive: true });
    }

    // Set sessions dir for tests
    setSessionsDir(SESSIONS_DIR);

    // Start server
    const { startServer } = await import("../../src/server/index.js");
    server = await startServer({ port: TEST_PORT }) as { stop: () => void };

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(() => {
    // Stop server
    if (server && typeof server.stop === "function") {
      server.stop();
    }

    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear sessions for each test
    if (existsSync(SESSIONS_DIR)) {
      const files = readdirSync(SESSIONS_DIR);
      for (const file of files) {
        rmSync(join(SESSIONS_DIR, file));
      }
    }
  });

  describe("Health Check", () => {
    it("should return healthy status", async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.status).toBe("ok");
      expect(data.timestamp).toBeTypeOf("number");
    });
  });

  describe("GET /api/sessions", () => {
    it("should return empty sessions array when no sessions", async () => {
      const res = await fetch(`${BASE_URL}/api/sessions`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.sessions).toEqual([]);
      expect(data.count).toBe(0);
      expect(data.timestamp).toBeTypeOf("number");
    });

    it("should return sessions when they exist", async () => {
      // Insert test session
      upsertSession({
        id: "test-session-1",
        pid: 99999,
        cwd: "/test/project",
        state: "idle",
        tmux_target: "test:0.0",
      });

      const res = await fetch(`${BASE_URL}/api/sessions`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.count).toBe(1);
      expect(data.sessions[0].id).toBe("test-session-1");
      expect(data.sessions[0].cwd).toBe("/test/project");
      expect(data.sessions[0].state).toBe("idle");
    });

    it("should return sessions sorted by priority", async () => {
      // Insert sessions with different states
      upsertSession({ id: "s1", pid: 10001, cwd: "/p1", state: "busy", tmux_target: null });
      upsertSession({ id: "s2", pid: 10002, cwd: "/p2", state: "permission", tmux_target: null });
      upsertSession({ id: "s3", pid: 10003, cwd: "/p3", state: "idle", tmux_target: null });
      upsertSession({ id: "s4", pid: 10004, cwd: "/p4", state: "waiting", tmux_target: null });

      const res = await fetch(`${BASE_URL}/api/sessions`);
      const data = await res.json();

      expect(data.count).toBe(4);
      // Order: permission, waiting, idle, busy
      expect(data.sessions[0].state).toBe("permission");
      expect(data.sessions[1].state).toBe("waiting");
      expect(data.sessions[2].state).toBe("idle");
      expect(data.sessions[3].state).toBe("busy");
    });
  });

  describe("GET /api/sessions/:id", () => {
    it("should return 404 for non-existent session", async () => {
      const res = await fetch(`${BASE_URL}/api/sessions/nonexistent-session`);
      expect(res.status).toBe(404);

      const data = await res.json();
      expect(data.error).toBe("Session not found");
      expect(data.id).toBe("nonexistent-session");
    });

    it("should return session when it exists", async () => {
      upsertSession({
        id: "test-session-123",
        pid: 88888,
        cwd: "/my/project",
        state: "busy",
        current_action: "Running: Bash",
        tmux_target: "dev:1.2",
      });

      const res = await fetch(`${BASE_URL}/api/sessions/test-session-123`);
      expect(res.ok).toBe(true);

      const data = await res.json();
      expect(data.session.id).toBe("test-session-123");
      expect(data.session.pid).toBe(88888);
      expect(data.session.cwd).toBe("/my/project");
      expect(data.session.state).toBe("busy");
      expect(data.session.current_action).toBe("Running: Bash");
      expect(data.session.tmux_target).toBe("dev:1.2");
      expect(data.timestamp).toBeTypeOf("number");
    });
  });

  describe("CORS headers", () => {
    it("should include CORS headers in response", async () => {
      const res = await fetch(`${BASE_URL}/api/sessions`, {
        headers: { Origin: "http://localhost:3000" },
      });

      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    });
  });
});

describe("Integration: SSE Stream", () => {
  let server: { stop: () => void } | null = null;
  const SSE_TEST_PORT = 13457;
  const SSE_BASE_URL = `http://127.0.0.1:${SSE_TEST_PORT}`;
  const SSE_TEST_DIR = join(tmpdir(), "claude-watch-sse-" + Date.now());
  const SSE_SESSIONS_DIR = join(SSE_TEST_DIR, "sessions");

  beforeAll(async () => {
    // Ensure directory exists
    if (!existsSync(SSE_SESSIONS_DIR)) {
      mkdirSync(SSE_SESSIONS_DIR, { recursive: true });
    }

    // Set sessions dir for tests
    setSessionsDir(SSE_SESSIONS_DIR);

    const { startServer } = await import("../../src/server/index.js");
    server = await startServer({ port: SSE_TEST_PORT }) as { stop: () => void };
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(() => {
    if (server && typeof server.stop === "function") {
      server.stop();
    }

    // Clean up test directory
    if (existsSync(SSE_TEST_DIR)) {
      rmSync(SSE_TEST_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clear sessions for each test
    if (existsSync(SSE_SESSIONS_DIR)) {
      const files = readdirSync(SSE_SESSIONS_DIR);
      for (const file of files) {
        rmSync(join(SSE_SESSIONS_DIR, file));
      }
    }
  });

  it("should return event-stream content type", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    try {
      const res = await fetch(`${SSE_BASE_URL}/api/sessions/stream`, {
        signal: controller.signal,
      });

      expect(res.headers.get("content-type")).toContain("text/event-stream");
    } catch (e) {
      // AbortError is expected when we timeout
      if ((e as Error).name !== "AbortError") {
        throw e;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  });

  it("should receive connected event", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const res = await fetch(`${SSE_BASE_URL}/api/sessions/stream`, {
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let receivedConnected = false;
      let receivedSessions = false;

      // Read a few chunks
      for (let i = 0; i < 5; i++) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        if (text.includes("event: connected")) {
          receivedConnected = true;
        }
        if (text.includes("event: sessions")) {
          receivedSessions = true;
        }

        if (receivedConnected && receivedSessions) break;
      }

      expect(receivedConnected).toBe(true);
      expect(receivedSessions).toBe(true);

      reader.cancel();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        throw e;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  });

  it("should stream session updates", async () => {
    // Add a session first
    upsertSession({
      id: "stream-test-session",
      pid: 77777,
      cwd: "/stream/test",
      state: "busy",
      tmux_target: null,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
      const res = await fetch(`${SSE_BASE_URL}/api/sessions/stream`, {
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let foundSession = false;

      // Read until we find our session
      for (let i = 0; i < 10; i++) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        if (text.includes("stream-test-session")) {
          foundSession = true;
          break;
        }
      }

      expect(foundSession).toBe(true);

      reader.cancel();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        throw e;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  });
});
