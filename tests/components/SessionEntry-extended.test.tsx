import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { SessionEntry } from "../../src/components/SessionEntry.js";
import type { Session } from "../../src/db/index.js";
import type { DisplayItem } from "../../src/components/SessionEntry.js";

describe("SessionEntry extended", () => {
  const baseSession: Session = {
    id: "test-session",
    pid: 1234,
    cwd: "/home/user/project",
    tmux_target: "main:0.1",
    state: "busy",
    current_action: null,
    prompt_text: null,
    last_update: Date.now(),
    metadata: null,
  };

  function makeClaudeItem(session: Session): DisplayItem {
    return { type: "claude", session };
  }

  describe("getStateText edge cases", () => {
    it("should show prompt text for waiting state when available", () => {
      const session: Session = {
        ...baseSession,
        state: "waiting",
        prompt_text: "What should I do?",
      };

      const { lastFrame } = render(
        <SessionEntry item={makeClaudeItem(session)} isSelected={false} showBlink={true} width={120} />
      );

      const output = lastFrame();
      // Prompt text appears in the state column (may be truncated due to column width)
      expect(output).toContain("Waiting: What should");
    });

    it("should truncate long prompt text", () => {
      const session: Session = {
        ...baseSession,
        state: "waiting",
        prompt_text: "This is a very long prompt that should be truncated because it exceeds the maximum length",
      };

      const { lastFrame } = render(
        <SessionEntry item={makeClaudeItem(session)} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      expect(output).toContain("…");
    });

    it("should show Working... when busy with no action", () => {
      const session: Session = {
        ...baseSession,
        state: "busy",
        current_action: null,
      };

      const { lastFrame } = render(
        <SessionEntry item={makeClaudeItem(session)} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      expect(output).toContain("Working...");
    });

    it("should handle unknown state gracefully", () => {
      const session: Session = {
        ...baseSession,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: "unknown" as any,
        current_action: null,
      };

      const { lastFrame } = render(
        <SessionEntry item={makeClaudeItem(session)} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      expect(output).toContain("unknown");
    });
  });

  describe("truncatePath edge cases", () => {
    it("should handle path that starts with HOME", () => {
      const originalHome = process.env.HOME;
      process.env.HOME = "/home/testuser";

      const session: Session = {
        ...baseSession,
        cwd: "/home/testuser/projects/myproject",
      };

      const { lastFrame } = render(
        <SessionEntry item={makeClaudeItem(session)} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      // Should show ~ instead of full home path
      expect(output).toBeDefined();

      process.env.HOME = originalHome;
    });

    it("should handle USERPROFILE on Windows-like systems", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      delete process.env.HOME;
      process.env.USERPROFILE = "/home/winuser";

      const session: Session = {
        ...baseSession,
        cwd: "/home/winuser/documents/project",
      };

      const { lastFrame } = render(
        <SessionEntry item={makeClaudeItem(session)} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      expect(output).toBeDefined();

      process.env.HOME = originalHome;
      process.env.USERPROFILE = originalUserProfile;
    });
  });

  describe("tmux session entries", () => {
    it("should render tmux session with window count", () => {
      const item: DisplayItem = {
        type: "tmux",
        tmuxSession: { name: "dev", windowCount: 3, attached: false },
      };

      const { lastFrame } = render(
        <SessionEntry item={item} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      expect(output).toContain("tmux");
      expect(output).toContain("dev");
      expect(output).toContain("3 windows");
    });

    it("should show attached status for tmux session", () => {
      const item: DisplayItem = {
        type: "tmux",
        tmuxSession: { name: "main", windowCount: 1, attached: true },
      };

      const { lastFrame } = render(
        <SessionEntry item={item} isSelected={false} showBlink={true} />
      );

      const output = lastFrame();
      expect(output).toContain("attached");
    });
  });
});
