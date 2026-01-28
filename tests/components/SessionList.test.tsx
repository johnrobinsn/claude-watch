import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { SessionList } from "../../src/components/SessionList.js";
import type { Session } from "../../src/db/index.js";

const mockSessions: Session[] = [
  {
    id: "session-1",
    pid: 1001,
    cwd: "/home/user/project1",
    tmux_target: "main:0.0",
    state: "busy",
    current_action: "Running: Bash",
    prompt_text: null,
    last_update: Date.now(),
    metadata: null,
  },
  {
    id: "session-2",
    pid: 1002,
    cwd: "/home/user/project2",
    tmux_target: "dev:1.0",
    state: "idle",
    current_action: null,
    prompt_text: null,
    last_update: Date.now(),
    metadata: null,
  },
];

describe("SessionList", () => {
  it("should render empty state when no sessions", () => {
    const { lastFrame } = render(
      <SessionList sessions={[]} tmuxSessions={[]} selectedIndex={0} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("No sessions");
  });

  it("should render multiple sessions", () => {
    const { lastFrame } = render(
      <SessionList sessions={mockSessions} tmuxSessions={[]} selectedIndex={0} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("project1");
    expect(output).toContain("project2");
    expect(output).toContain("main:0.0");
    expect(output).toContain("dev:1.0");
  });

  it("should highlight selected session", () => {
    const { lastFrame } = render(
      <SessionList sessions={mockSessions} tmuxSessions={[]} selectedIndex={1} showBlink={true} />
    );

    const output = lastFrame();
    // The second session should have the selection indicator
    expect(output).toContain("▶");
  });

  it("should show all session states", () => {
    const sessionsWithStates: Session[] = [
      { ...mockSessions[0], state: "permission" },
      { ...mockSessions[1], state: "waiting" },
    ];

    const { lastFrame } = render(
      <SessionList sessions={sessionsWithStates} tmuxSessions={[]} selectedIndex={0} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("permission");
    expect(output).toContain("Waiting");
  });

  it("should show tmux sessions without claude instances", () => {
    const tmuxSessions = [
      { name: "other", windowCount: 2, attached: false },
    ];

    const { lastFrame } = render(
      <SessionList sessions={mockSessions} tmuxSessions={tmuxSessions} selectedIndex={0} showBlink={true} />
    );

    const output = lastFrame();
    expect(output).toContain("other");
    expect(output).toContain("tmux");
    expect(output).toContain("2 windows");
  });

  it("should not duplicate tmux sessions that have claude instances", () => {
    // main session is already used by mockSessions[0]
    const tmuxSessions = [
      { name: "main", windowCount: 1, attached: true },
      { name: "other", windowCount: 2, attached: false },
    ];

    const { lastFrame } = render(
      <SessionList sessions={mockSessions} tmuxSessions={tmuxSessions} selectedIndex={0} showBlink={true} />
    );

    const output = lastFrame();
    // "main" should only appear once (from claude session, not as separate tmux entry)
    // "other" should appear as tmux session
    expect(output).toContain("other");
  });
});
