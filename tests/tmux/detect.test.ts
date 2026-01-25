import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("tmux/detect", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules to get fresh state
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("isInTmux", () => {
    it("should return true when TMUX env var is set", async () => {
      process.env.TMUX = "/tmp/tmux-1000/default,12345,0";
      const { isInTmux } = await import("../../src/tmux/detect.js");
      expect(isInTmux()).toBe(true);
    });

    it("should return false when TMUX env var is not set", async () => {
      delete process.env.TMUX;
      const { isInTmux } = await import("../../src/tmux/detect.js");
      expect(isInTmux()).toBe(false);
    });

    it("should return false when TMUX env var is empty", async () => {
      process.env.TMUX = "";
      const { isInTmux } = await import("../../src/tmux/detect.js");
      expect(isInTmux()).toBe(false);
    });
  });

  describe("getTmuxTarget", () => {
    it("should return null when not in tmux", async () => {
      delete process.env.TMUX;
      const { getTmuxTarget } = await import("../../src/tmux/detect.js");
      expect(getTmuxTarget()).toBeNull();
    });

    // Note: We can't easily test the positive case without actually being in tmux
    // This would be tested via integration tests
  });

  describe("getTmuxSessionName", () => {
    it("should return null when not in tmux", async () => {
      delete process.env.TMUX;
      const { getTmuxSessionName } = await import("../../src/tmux/detect.js");
      expect(getTmuxSessionName()).toBeNull();
    });
  });
});
