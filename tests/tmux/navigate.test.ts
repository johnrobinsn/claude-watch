import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("tmux/navigate", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("switchToTarget", () => {
    it("should return false when not in tmux", async () => {
      delete process.env.TMUX;
      const { switchToTarget } = await import("../../src/tmux/navigate.js");
      expect(switchToTarget("main:0.0")).toBe(false);
    });
  });

  describe("switchToSession", () => {
    it("should return false when not in tmux", async () => {
      delete process.env.TMUX;
      const { switchToSession } = await import("../../src/tmux/navigate.js");
      expect(switchToSession("watch")).toBe(false);
    });
  });
});
