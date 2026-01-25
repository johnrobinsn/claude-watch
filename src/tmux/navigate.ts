import { execSync } from "child_process";
import { isInTmux } from "./detect.js";

/**
 * Switch to a different tmux session/window/pane.
 * @param target - The target in format "session:window.pane"
 * @returns true if successful, false otherwise
 */
export function switchToTarget(target: string): boolean {
  if (!isInTmux()) {
    return false;
  }

  try {
    execSync(`tmux switch-client -t "${target}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Switch to a specific session (useful for the dashboard binding).
 * @param sessionName - The tmux session name
 * @returns true if successful, false otherwise
 */
export function switchToSession(sessionName: string): boolean {
  if (!isInTmux()) {
    return false;
  }

  try {
    execSync(`tmux switch-client -t "${sessionName}"`, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}
