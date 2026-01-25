import { describe, it, expect } from "vitest";
import {
  getClaudeWatchHooks,
  mergeHooks,
  removeClaudeWatchHooks,
} from "../../src/setup/hooks.js";

describe("setup/hooks", () => {
  describe("getClaudeWatchHooks", () => {
    it("should return hooks for all required events", () => {
      const hooks = getClaudeWatchHooks();

      expect(hooks.SessionStart).toBeDefined();
      expect(hooks.Stop).toBeDefined();
      expect(hooks.PermissionRequest).toBeDefined();
      expect(hooks.Notification).toBeDefined();
      expect(hooks.PreToolUse).toBeDefined();
      expect(hooks.PostToolUse).toBeDefined();
      expect(hooks.SessionEnd).toBeDefined();
    });

    it("should include claude-watch-hook command in all hooks", () => {
      const hooks = getClaudeWatchHooks();

      for (const eventHooks of Object.values(hooks)) {
        for (const matcher of eventHooks) {
          for (const hook of matcher.hooks) {
            expect(hook.command).toContain("claude-watch-hook");
          }
        }
      }
    });

    it("should have matchers for Notification hooks", () => {
      const hooks = getClaudeWatchHooks();

      const notificationHooks = hooks.Notification;
      expect(notificationHooks.some((h) => h.matcher === "idle_prompt")).toBe(true);
      expect(notificationHooks.some((h) => h.matcher === "permission_prompt")).toBe(true);
    });
  });

  describe("mergeHooks", () => {
    it("should merge new hooks into empty config", () => {
      const newHooks = getClaudeWatchHooks();
      const merged = mergeHooks(undefined, newHooks);

      expect(Object.keys(merged).length).toBeGreaterThan(0);
      expect(merged.SessionStart).toBeDefined();
    });

    it("should preserve existing hooks when merging", () => {
      const existing = {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command" as const, command: "existing-command" }],
          },
        ],
      };

      const newHooks = getClaudeWatchHooks();
      const merged = mergeHooks(existing, newHooks);

      // Should have both the existing and new hooks
      expect(merged.PreToolUse.length).toBeGreaterThan(1);
      expect(merged.PreToolUse.some((h) => h.hooks.some((hook) => hook.command === "existing-command"))).toBe(true);
    });

    it("should not duplicate claude-watch hooks", () => {
      const newHooks = getClaudeWatchHooks();
      const merged1 = mergeHooks(undefined, newHooks);
      const merged2 = mergeHooks(merged1, newHooks);

      // Should not add duplicates
      expect(merged1.SessionStart.length).toBe(merged2.SessionStart.length);
    });
  });

  describe("removeClaudeWatchHooks", () => {
    it("should remove claude-watch hooks", () => {
      const hooks = getClaudeWatchHooks();
      const cleaned = removeClaudeWatchHooks(hooks);

      // All claude-watch hooks should be removed
      for (const eventHooks of Object.values(cleaned)) {
        for (const matcher of eventHooks) {
          for (const hook of matcher.hooks) {
            expect(hook.command).not.toContain("claude-watch-hook");
          }
        }
      }
    });

    it("should preserve non-claude-watch hooks", () => {
      const hooks = {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command" as const, command: "some-other-hook" }],
          },
          {
            hooks: [{ type: "command" as const, command: "node claude-watch-hook" }],
          },
        ],
      };

      const cleaned = removeClaudeWatchHooks(hooks);

      expect(cleaned.PreToolUse).toBeDefined();
      expect(cleaned.PreToolUse.length).toBe(1);
      expect(cleaned.PreToolUse[0].hooks[0].command).toBe("some-other-hook");
    });

    it("should remove event entirely if no hooks remain", () => {
      const hooks = getClaudeWatchHooks();
      const cleaned = removeClaudeWatchHooks(hooks);

      // Most events should be removed entirely
      expect(Object.keys(cleaned).length).toBe(0);
    });
  });
});
