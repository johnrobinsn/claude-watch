import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Header } from "../../src/components/Header.js";

describe("Header", () => {
  it("should render title", () => {
    const { lastFrame } = render(<Header claudeCount={0} tmuxCount={0} />);

    const output = lastFrame();
    expect(output).toContain("claude-watch");
  });

  it("should show claude count", () => {
    const { lastFrame } = render(<Header claudeCount={2} tmuxCount={0} />);

    const output = lastFrame();
    expect(output).toContain("2 claude");
  });

  it("should show tmux count", () => {
    const { lastFrame } = render(<Header claudeCount={0} tmuxCount={3} />);

    const output = lastFrame();
    expect(output).toContain("3 tmux");
  });

  it("should show both counts", () => {
    const { lastFrame } = render(<Header claudeCount={2} tmuxCount={3} />);

    const output = lastFrame();
    expect(output).toContain("2 claude");
    expect(output).toContain("3 tmux");
  });

  it("should show no sessions when both are zero", () => {
    const { lastFrame } = render(<Header claudeCount={0} tmuxCount={0} />);

    const output = lastFrame();
    expect(output).toContain("no sessions");
  });
});
