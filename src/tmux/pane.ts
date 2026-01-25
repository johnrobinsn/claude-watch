import { execSync } from "child_process";
import { isInTmux } from "./detect.js";

/**
 * Capture the contents of a tmux pane.
 * @param target - The tmux target in format "session:window.pane"
 * @returns The pane contents as a string, or null if capture failed
 */
export function capturePaneContent(target: string): string | null {
  if (!isInTmux()) {
    return null;
  }

  try {
    const result = execSync(`tmux capture-pane -p -t "${target}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 1000,
    });
    return result;
  } catch {
    return null;
  }
}

/**
 * Check if the pane content shows Claude is actively working.
 * Looks for "Esc to interrupt" which appears when Claude is processing.
 */
export function isPaneShowingWorking(content: string): boolean {
  if (!content) return false;

  // "Esc to interrupt" appears when Claude is actively working
  return content.includes("Esc to interrupt") || content.includes("esc to interrupt");
}

/**
 * Check if the pane content shows Claude is at the prompt (idle).
 * Claude is idle if "Esc to interrupt" is NOT present.
 */
export function isPaneShowingPrompt(content: string): boolean {
  if (!content) return false;

  // If "Esc to interrupt" is present, Claude is still working
  if (isPaneShowingWorking(content)) {
    return false;
  }

  return true;
}
