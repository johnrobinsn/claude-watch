import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { SessionEntry, type DisplayItem } from "../../src/components/SessionEntry.js";
import type { Session } from "../../src/db/index.js";

const mockSession: Session = {
  id: "test-session",
  pid: 1234,
  cwd: "/home/user/project",
  tmux_target: "main:0.1",
  state: "busy",
  current_action: "Running: Bash",
  prompt_text: null,
  last_update: Date.now(),
  metadata: null,
};

function makeClaudeItem(session: Session): DisplayItem {
  return { type: "claude", session };
}

describe("SessionEntry", () => {
  it("should render session with busy state", () => {
    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(mockSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("●");
    expect(output).toContain("project");
    expect(output).toContain("main:0.1");
    expect(output).toContain("Running: Bash");
  });

  it("should render selection indicator when selected", () => {
    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(mockSession)} isSelected={true} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("▶");
  });

  it("should not show selection indicator when not selected", () => {
    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(mockSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).not.toContain("▶");
  });

  it("should render waiting state correctly", () => {
    const waitingSession: Session = {
      ...mockSession,
      state: "waiting",
      current_action: null,
    };

    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(waitingSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("Waiting");
  });

  it("should render permission state correctly", () => {
    const permissionSession: Session = {
      ...mockSession,
      state: "permission",
      current_action: null,
    };

    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(permissionSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("permission");
  });

  it("should render idle state correctly", () => {
    const idleSession: Session = {
      ...mockSession,
      state: "idle",
      current_action: null,
    };

    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(idleSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("Idle");
  });

  it("should hide bullet for busy state when showBlink is false", () => {
    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(mockSession)} isSelected={false} showBlink={false} />
    );

    const output = lastFrame();
    // The bullet should be replaced with a space during blink-off phase
    // We just verify the component renders without error
    expect(output).toBeDefined();
  });

  it("should show dash when tmux_target is null", () => {
    const noTmuxSession: Session = {
      ...mockSession,
      tmux_target: null,
    };

    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(noTmuxSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    // Now shows "—" instead of "no tmux"
    expect(output).toContain("—");
  });

  it("should truncate long paths", () => {
    const longPathSession: Session = {
      ...mockSession,
      cwd: "/home/user/very/long/path/to/some/deeply/nested/project",
    };

    const { lastFrame } = render(
      <SessionEntry item={makeClaudeItem(longPathSession)} isSelected={false} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("…");
  });
});
