import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const testDir = join(tmpdir(), `claude-watch-hooks-test-${Date.now()}`);
const testClaudeDir = join(testDir, ".claude");
const testSettingsPath = join(testClaudeDir, "settings.json");

vi.mock("../../src/utils/paths.js", () => ({
  CLAUDE_DIR: testClaudeDir,
  CLAUDE_SETTINGS_PATH: testSettingsPath,
}));

describe("setup/hooks integration", () => {
  beforeEach(() => {
    mkdirSync(testClaudeDir, { recursive: true });
    vi.resetModules();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe("loadClaudeSettings", () => {
    it("should return empty object when file does not exist", async () => {
      rmSync(testClaudeDir, { recursive: true });

      const { loadClaudeSettings } = await import("../../src/setup/hooks.js");
      const settings = loadClaudeSettings();
      expect(settings).toEqual({});
    });

    it("should parse existing settings", async () => {
      writeFileSync(testSettingsPath, JSON.stringify({ foo: "bar" }));

      const { loadClaudeSettings } = await import("../../src/setup/hooks.js");
      const settings = loadClaudeSettings();
      expect(settings).toEqual({ foo: "bar" });
    });

    it("should return empty object on invalid JSON", async () => {
      writeFileSync(testSettingsPath, "not valid json");

      const { loadClaudeSettings } = await import("../../src/setup/hooks.js");
      const settings = loadClaudeSettings();
      expect(settings).toEqual({});
    });
  });

  describe("saveClaudeSettings", () => {
    it("should create directory if it does not exist", async () => {
      rmSync(testClaudeDir, { recursive: true });

      const { saveClaudeSettings } = await import("../../src/setup/hooks.js");
      saveClaudeSettings({ test: "value" });

      expect(existsSync(testSettingsPath)).toBe(true);
      const content = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
      expect(content).toEqual({ test: "value" });
    });

    it("should overwrite existing settings", async () => {
      writeFileSync(testSettingsPath, JSON.stringify({ old: "data" }));

      vi.resetModules();
      const { saveClaudeSettings } = await import("../../src/setup/hooks.js");
      saveClaudeSettings({ new: "data" });

      const content = JSON.parse(readFileSync(testSettingsPath, "utf-8"));
      expect(content).toEqual({ new: "data" });
    });
  });

  describe("generateDiff", () => {
    it("should show no changes when settings are identical", async () => {
      const { generateDiff } = await import("../../src/setup/hooks.js");
      const diff = generateDiff({ foo: "bar" }, { foo: "bar" });
      expect(diff).toContain("No changes needed");
    });

    it("should show adding hooks when none exist", async () => {
      const { generateDiff } = await import("../../src/setup/hooks.js");
      const diff = generateDiff({}, { hooks: {} });
      expect(diff).toContain("Adding hooks configuration");
    });

    it("should show updating hooks when some exist", async () => {
      const { generateDiff } = await import("../../src/setup/hooks.js");
      const diff = generateDiff({ hooks: {} }, { hooks: { SessionStart: [] } });
      expect(diff).toContain("Updating hooks configuration");
    });
  });

  describe("installHooks", () => {
    it("should return diff and new settings", async () => {
      const { installHooks } = await import("../../src/setup/hooks.js");
      const { diff, newSettings } = installHooks();

      expect(diff).toBeDefined();
      expect(newSettings.hooks).toBeDefined();
      expect(newSettings.hooks?.SessionStart).toBeDefined();
    });

    it("should merge with existing settings", async () => {
      writeFileSync(testSettingsPath, JSON.stringify({ existingKey: "value" }));

      vi.resetModules();
      const { installHooks } = await import("../../src/setup/hooks.js");
      const { newSettings } = installHooks();

      expect(newSettings.existingKey).toBe("value");
      expect(newSettings.hooks).toBeDefined();
    });
  });

  describe("uninstallHooks", () => {
    it("should do nothing when no hooks exist", async () => {
      writeFileSync(testSettingsPath, JSON.stringify({}));

      vi.resetModules();
      const { uninstallHooks } = await import("../../src/setup/hooks.js");
      expect(() => uninstallHooks()).not.toThrow();
    });

    it("should remove claude-watch hooks", async () => {
      const { installHooks, saveClaudeSettings, uninstallHooks, loadClaudeSettings } = await import(
        "../../src/setup/hooks.js"
      );

      // First install
      const { newSettings } = installHooks();
      saveClaudeSettings(newSettings);

      // Then uninstall
      vi.resetModules();
      const { uninstallHooks: uninstall, loadClaudeSettings: load } = await import(
        "../../src/setup/hooks.js"
      );
      uninstall();

      const settings = load();
      expect(settings.hooks).toBeUndefined();
    });
  });
});
