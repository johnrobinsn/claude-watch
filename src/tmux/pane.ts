import { execSync } from "child_process";
import { isInTmux } from "./detect.js";

/**
 * Find the tmux pane target for a given PID by checking process ancestry.
 * @param targetPid - The PID to find
 * @returns The pane target (e.g., "0:3.1") or null if not found
 */
export function findPaneForPid(targetPid: number): string | null {
  if (!isInTmux()) {
    return null;
  }

  try {
    // Get all panes with their PIDs
    const panesOutput = execSync(
      'tmux list-panes -a -F "#{session_name}:#{window_index}.#{pane_index} #{pane_pid}"',
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 1000 }
    );

    // Get full process tree
    const psOutput = execSync("ps -eo pid,ppid", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 1000,
    });

    // Build parent map: pid -> ppid
    const parentMap = new Map<number, number>();
    for (const line of psOutput.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const pid = parseInt(parts[0], 10);
        const ppid = parseInt(parts[1], 10);
        if (!isNaN(pid) && !isNaN(ppid)) {
          parentMap.set(pid, ppid);
        }
      }
    }

    // Get all ancestors of targetPid
    const ancestors = new Set<number>();
    let current = targetPid;
    while (current > 1 && parentMap.has(current)) {
      ancestors.add(current);
      current = parentMap.get(current)!;
    }
    ancestors.add(current); // Include the last one

    // Find which pane's pid is an ancestor of targetPid
    for (const line of panesOutput.split("\n")) {
      const match = line.match(/^(\S+)\s+(\d+)$/);
      if (match) {
        const paneTarget = match[1];
        const panePid = parseInt(match[2], 10);
        if (ancestors.has(panePid)) {
          return paneTarget;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

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

/**
 * Detect if the pane shows user interruption or cancellation.
 * Only detects FRESH signals from the most recent interaction.
 *
 * Structure of Claude Code pane:
 *   ❯ user command           ← interaction start (● or ❯)
 *     ⎿  Interrupted...      ← signal we're looking for
 *   ─────────────────────    ← TOP separator
 *   ❯ [user input]           ← prompt area (may have text)
 *   ─────────────────────    ← BOTTOM separator
 *     status line
 *
 * Algorithm:
 * 1. Find the two separators around the prompt area
 * 2. Scan backwards from TOP separator to find ● or ❯ (interaction start)
 * 3. Check the slice between interaction start and TOP separator for signals
 *
 * @returns 'interrupted' if user pressed Esc during work,
 *          'declined' if user cancelled a prompt,
 *          null if no interruption detected
 */
export function detectRecentInterruption(content: string): 'interrupted' | 'declined' | null {
  if (!content) return null;

  const lines = content.split('\n');

  // If there's active UI (menu or working), don't detect old interruptions
  const bottomLines = lines.slice(-5).join('\n');
  if (bottomLines.includes('Esc to cancel') || bottomLines.includes('Esc to interrupt')) {
    return null;
  }

  // Find the BOTTOM separator (last separator in the pane)
  let bottomSepIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('─────')) {
      bottomSepIdx = i;
      break;
    }
  }
  if (bottomSepIdx === -1) return null;

  // Find the TOP separator (second-to-last separator, above the prompt)
  let topSepIdx = -1;
  for (let i = bottomSepIdx - 1; i >= 0; i--) {
    if (lines[i].startsWith('─────')) {
      topSepIdx = i;
      break;
    }
  }
  if (topSepIdx === -1) return null;

  // Scan backwards from TOP separator to find the interaction start (● or ❯)
  let interactionStartIdx = -1;
  for (let i = topSepIdx - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith('●') || line.startsWith('❯')) {
      interactionStartIdx = i;
      break;
    }
  }
  if (interactionStartIdx === -1) return null;

  // Check the slice from interaction start to TOP separator for signals
  const slice = lines.slice(interactionStartIdx, topSepIdx).join('\n');

  if (slice.includes('Interrupted')) return 'interrupted';
  if (slice.includes('User declined to answer')) return 'declined';

  return null;
}
