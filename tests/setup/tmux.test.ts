import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We need to mock the paths module before importing tmux setup
const testDir = join(tmpdir(), `claude-watch-test-${Date.now()}`);
const testTmuxConf = join(testDir, ".tmux.conf");

vi.mock("../../src/utils/paths.js", () => ({
  TMUX_CONF_PATH: testTmuxConf,
}));

describe("setup/tmux", () => {
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    vi.resetModules();
  });

  describe("getTmuxConfigAddition", () => {
    it("should return config with default session name", async () => {
      const { getTmuxConfigAddition } = await import("../../src/setup/tmux.js");
      const config = getTmuxConfigAddition();

      expect(config).toContain("claude-watch binding");
      expect(config).toContain("bind W switch-client -t watch");
    });

    it("should return config with custom session name", async () => {
      const { getTmuxConfigAddition } = await import("../../src/setup/tmux.js");
      const config = getTmuxConfigAddition("custom");

      expect(config).toContain("bind W switch-client -t custom");
    });
  });

  describe("hasTmuxBinding", () => {
    it("should return false when no tmux.conf exists", async () => {
      const { hasTmuxBinding } = await import("../../src/setup/tmux.js");
      expect(hasTmuxBinding()).toBe(false);
    });

    it("should return false when tmux.conf exists but has no binding", async () => {
      writeFileSync(testTmuxConf, "set -g mouse on\n");

      vi.resetModules();
      const { hasTmuxBinding } = await import("../../src/setup/tmux.js");
      expect(hasTmuxBinding()).toBe(false);
    });

    it("should return true when tmux.conf has the binding", async () => {
      writeFileSync(testTmuxConf, "# claude-watch binding\nbind W switch-client -t watch\n");

      vi.resetModules();
      const { hasTmuxBinding } = await import("../../src/setup/tmux.js");
      expect(hasTmuxBinding()).toBe(true);
    });
  });

  describe("addTmuxBinding", () => {
    it("should create tmux.conf if it does not exist", async () => {
      const { addTmuxBinding } = await import("../../src/setup/tmux.js");
      addTmuxBinding();

      expect(existsSync(testTmuxConf)).toBe(true);
      const content = readFileSync(testTmuxConf, "utf-8");
      expect(content).toContain("claude-watch binding");
      expect(content).toContain("bind W switch-client -t watch");
    });

    it("should append to existing tmux.conf", async () => {
      writeFileSync(testTmuxConf, "set -g mouse on\n");

      vi.resetModules();
      const { addTmuxBinding } = await import("../../src/setup/tmux.js");
      addTmuxBinding();

      const content = readFileSync(testTmuxConf, "utf-8");
      expect(content).toContain("set -g mouse on");
      expect(content).toContain("claude-watch binding");
    });

    it("should not add duplicate binding", async () => {
      writeFileSync(testTmuxConf, "# claude-watch binding\nbind W switch-client -t watch\n");

      vi.resetModules();
      const { addTmuxBinding } = await import("../../src/setup/tmux.js");
      addTmuxBinding();

      const content = readFileSync(testTmuxConf, "utf-8");
      const matches = content.match(/claude-watch binding/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe("removeTmuxBinding", () => {
    it("should do nothing if no tmux.conf exists", async () => {
      const { removeTmuxBinding } = await import("../../src/setup/tmux.js");
      expect(() => removeTmuxBinding()).not.toThrow();
    });

    it("should remove binding from tmux.conf", async () => {
      writeFileSync(
        testTmuxConf,
        "set -g mouse on\n# claude-watch binding\nbind W switch-client -t watch\nset -g status on\n"
      );

      vi.resetModules();
      const { removeTmuxBinding } = await import("../../src/setup/tmux.js");
      removeTmuxBinding();

      const content = readFileSync(testTmuxConf, "utf-8");
      expect(content).not.toContain("claude-watch binding");
      expect(content).not.toContain("switch-client -t watch");
      expect(content).toContain("set -g mouse on");
      expect(content).toContain("set -g status on");
    });
  });

  describe("getTmuxBindingDiff", () => {
    it("should show new binding when none exists", async () => {
      const { getTmuxBindingDiff } = await import("../../src/setup/tmux.js");
      const diff = getTmuxBindingDiff();

      expect(diff).toContain("Changes to ~/.tmux.conf");
      expect(diff).toContain("bind W switch-client");
    });

    it("should indicate when binding already exists", async () => {
      writeFileSync(testTmuxConf, "# claude-watch binding\nbind W switch-client -t watch\n");

      vi.resetModules();
      const { getTmuxBindingDiff } = await import("../../src/setup/tmux.js");
      const diff = getTmuxBindingDiff();

      expect(diff).toContain("already configured");
    });
  });
});
