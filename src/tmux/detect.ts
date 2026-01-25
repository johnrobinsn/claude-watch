import { execSync } from "child_process";

/**
 * Check if we're running inside tmux.
 */
export function isInTmux(): boolean {
  return !!process.env.TMUX;
}

/**
 * Get the current tmux target in the format session:window.pane.
 * Returns null if not running in tmux.
 */
export function getTmuxTarget(): string | null {
  if (!isInTmux()) {
    return null;
  }

  try {
    const result = execSync(
      'tmux display-message -p "#{session_name}:#{window_index}.#{pane_index}"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Get just the tmux session name.
 * Returns null if not running in tmux.
 */
export function getTmuxSessionName(): string | null {
  if (!isInTmux()) {
    return null;
  }

  try {
    const result = execSync('tmux display-message -p "#{session_name}"', {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return null;
  }
}

export interface TmuxSession {
  name: string;
  windowCount: number;
  attached: boolean;
}

/**
 * Get all tmux sessions.
 * Returns empty array if not running in tmux or on error.
 */
export function getAllTmuxSessions(): TmuxSession[] {
  if (!isInTmux()) {
    return [];
  }

  try {
    // Format: session_name:window_count:attached_flag
    const result = execSync(
      'tmux list-sessions -F "#{session_name}:#{session_windows}:#{session_attached}"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );

    return result
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, windowCount, attached] = line.split(":");
        return {
          name,
          windowCount: parseInt(windowCount, 10) || 1,
          attached: attached === "1",
        };
      });
  } catch {
    return [];
  }
}
