import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { TMUX_CONF_PATH } from "../utils/paths.js";

const CLAUDE_WATCH_MARKER = "# claude-watch binding";
const DEFAULT_BINDING = 'bind W switch-client -t watch';

export function getTmuxConfigAddition(sessionName: string = "watch"): string {
  return `
${CLAUDE_WATCH_MARKER}
bind W switch-client -t ${sessionName}
`;
}

export function hasTmuxBinding(): boolean {
  if (!existsSync(TMUX_CONF_PATH)) {
    return false;
  }

  const content = readFileSync(TMUX_CONF_PATH, "utf-8");
  return content.includes(CLAUDE_WATCH_MARKER);
}

export function addTmuxBinding(sessionName: string = "watch"): void {
  if (hasTmuxBinding()) {
    return; // Already configured
  }

  const addition = getTmuxConfigAddition(sessionName);

  if (!existsSync(TMUX_CONF_PATH)) {
    writeFileSync(TMUX_CONF_PATH, addition.trim() + "\n", "utf-8");
  } else {
    appendFileSync(TMUX_CONF_PATH, "\n" + addition.trim() + "\n", "utf-8");
  }
}

export function removeTmuxBinding(): void {
  if (!existsSync(TMUX_CONF_PATH)) {
    return;
  }

  const content = readFileSync(TMUX_CONF_PATH, "utf-8");
  const lines = content.split("\n");
  const filteredLines: string[] = [];
  let skipNext = false;

  for (const line of lines) {
    if (line.includes(CLAUDE_WATCH_MARKER)) {
      skipNext = true;
      continue;
    }
    if (skipNext && line.startsWith("bind W switch-client")) {
      skipNext = false;
      continue;
    }
    skipNext = false;
    filteredLines.push(line);
  }

  // Remove trailing empty lines
  while (filteredLines.length > 0 && filteredLines[filteredLines.length - 1] === "") {
    filteredLines.pop();
  }

  writeFileSync(TMUX_CONF_PATH, filteredLines.join("\n") + "\n", "utf-8");
}

export function getTmuxBindingDiff(sessionName: string = "watch"): string {
  const lines: string[] = [];
  lines.push("Changes to ~/.tmux.conf:");
  lines.push("");

  if (hasTmuxBinding()) {
    lines.push("  (claude-watch binding already configured)");
  } else {
    lines.push(`  + ${CLAUDE_WATCH_MARKER}`);
    lines.push(`  + bind W switch-client -t ${sessionName}`);
  }

  return lines.join("\n");
}
