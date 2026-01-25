import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StatusBar } from "../../src/components/StatusBar.js";

describe("StatusBar", () => {
  it("should show keyboard shortcuts", () => {
    const { lastFrame } = render(<StatusBar inTmux={true} />);

    const output = lastFrame();
    expect(output).toContain("[Enter]");
    expect(output).toContain("Jump to session");
    expect(output).toContain("[↑↓/jk]");
    expect(output).toContain("Navigate");
    expect(output).toContain("[q]");
    expect(output).toContain("Quit");
  });

  it("should show warning when not in tmux", () => {
    const { lastFrame } = render(<StatusBar inTmux={false} />);

    const output = lastFrame();
    expect(output).toContain("not in tmux");
    expect(output).toContain("navigation disabled");
  });

  it("should not show warning when in tmux", () => {
    const { lastFrame } = render(<StatusBar inTmux={true} />);

    const output = lastFrame();
    expect(output).not.toContain("not in tmux");
  });
});
