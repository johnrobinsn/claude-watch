import { Command } from "commander";
import { render } from "ink";
import React from "react";
import { execSync } from "child_process";
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from "fs";
import { createInterface } from "readline";
import { join } from "path";
import { App } from "../app.js";
import { isInTmux, getTmuxSessionName } from "../tmux/detect.js";
import { CLAUDE_WATCH_DIR, SESSIONS_DIR, DEFAULT_SERVER_PORT } from "../utils/paths.js";
import { VERSION } from "../utils/version.js";
import { isPidAlive } from "../utils/pid.js";
import {
  checkHooksStatus,
  getInstalledHooksVersion,
  installHooks,
  saveClaudeSettings,
} from "../setup/hooks.js";

const WATCH_SESSION = "watch";

/**
 * Prompt user for input and return their response.
 */
function promptUser(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export interface TuiOptions {
  serve?: boolean;
  port: string;
  host: string;
}

export async function runTui(options: TuiOptions): Promise<void> {
  // Check if running in tmux
  if (!isInTmux()) {
    console.error("claude-watch requires tmux to run.");
    console.error("");
    console.error("Start tmux first, then run claude-watch from inside tmux.");
    process.exit(1);
  }

  // Check if we're in the correct session
  const currentSession = getTmuxSessionName();
  if (currentSession !== WATCH_SESSION) {
    console.log(`Switching to '${WATCH_SESSION}' session...`);

    // Build command to re-invoke claude-watch the same way it was originally called
    const cwd = process.cwd();
    // Escape single quotes in args for shell safety
    const escapeArg = (arg: string) => `'${arg.replace(/'/g, "'\\''")}'`;
    const originalCmd = process.argv.map(escapeArg).join(" ");
    const fullCmd = `cd ${escapeArg(cwd)} && ${originalCmd}`;

    try {
      // Kill any existing watch session that isn't running claude-watch,
      // then (re)create it with the command passed directly to new-session.
      //
      // We avoid tmux send-keys entirely because it races with shell init
      // on macOS: zsh's compinit prompt intercepts keystrokes before the
      // shell is ready, mangling the command (e.g. "cd" becoming "åWcd").
      // Passing the command to new-session bypasses interactive shell init.

      let needsCreate = true;
      try {
        execSync(`tmux has-session -t ${WATCH_SESSION} 2>/dev/null`, { stdio: "ignore" });
        // Session exists - check if claude-watch is already running
        try {
          const paneCmd = execSync(
            `tmux list-panes -t ${WATCH_SESSION} -F "#{pane_current_command}"`,
            { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
          ).trim();
          if (paneCmd.includes("node") || paneCmd.includes("claude-watch")) {
            // Already running, just switch to it
            needsCreate = false;
          } else {
            // Session exists but claude-watch isn't running — add a new window
            execSync(`tmux new-window -t ${WATCH_SESSION} ${escapeArg(fullCmd)}`, { stdio: "ignore" });
            needsCreate = false;
          }
        } catch {
          // Can't list panes — add a new window in the existing session
          execSync(`tmux new-window -t ${WATCH_SESSION} ${escapeArg(fullCmd)}`, { stdio: "ignore" });
          needsCreate = false;
        }
      } catch {
        // Session doesn't exist
      }

      if (needsCreate) {
        execSync(`tmux new-session -d -s ${WATCH_SESSION} ${escapeArg(fullCmd)}`, { stdio: "ignore" });
      }
      execSync(`tmux switch-client -t ${WATCH_SESSION}`, { stdio: "inherit" });
    } catch (error) {
      console.error("Failed to switch to watch session:", error);
      process.exit(1);
    }

    process.exit(0);
  }

  // We're in the watch session, run the TUI

  // Auto-create data directories if needed
  if (!existsSync(CLAUDE_WATCH_DIR)) {
    mkdirSync(CLAUDE_WATCH_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  // Check hooks version and prompt if needed
  const hooksStatus = checkHooksStatus();
  if (hooksStatus !== "current") {
    const installedVersion = getInstalledHooksVersion();
    const action = hooksStatus === "install" ? "installed" : "updated";
    const currentInfo = installedVersion ? `installed: ${installedVersion}` : "not installed";

    console.log(`claude-watch hooks need to be ${action} (${currentInfo}, required: ${VERSION})`);
    console.log("");

    const answer = await promptUser(`${hooksStatus === "install" ? "Install" : "Update"} hooks now? [Y/n/q]: `);
    const normalized = answer.toLowerCase().trim();

    if (normalized === "q") {
      console.log("Exiting.");
      process.exit(0);
    } else if (normalized === "n") {
      console.log("Skipping hook installation. Some features may not work correctly.");
      console.log("");
    } else {
      // Default to Yes
      console.log("Installing hooks...");
      const { newSettings } = installHooks();
      saveClaudeSettings(newSettings);
      console.log("Hooks installed successfully.");
      console.log("");
    }
  }

  // Check if another instance is already running
  const lockFile = join(CLAUDE_WATCH_DIR, "claude-watch.lock");
  if (existsSync(lockFile)) {
    try {
      const lock = JSON.parse(readFileSync(lockFile, "utf-8"));
      if (lock.pid && isPidAlive(lock.pid)) {
        if (lock.version === VERSION) {
          console.log("claude-watch is already running.");
          if (lock.tmux_target) {
            try {
              execSync(`tmux switch-client -t "${lock.tmux_target}"`, { stdio: "inherit" });
            } catch {
              // Ignore - may already be in the right pane
            }
          }
          process.exit(0);
        } else {
          // Different version — kill old instance and restart
          console.log(`Restarting claude-watch (${lock.version || "unknown"} → ${VERSION})...`);
          process.kill(lock.pid, "SIGTERM");
          execSync("sleep 0.5", { stdio: "ignore" });
        }
      }
    } catch {
      // Stale or corrupt lock file, proceed
    }
  }

  // Move window and pane to base indices so claude-watch is always at the first position
  try {
    const baseIndex = execSync('tmux show-options -gv base-index', {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    execSync(`tmux move-window -t ${baseIndex}`, { stdio: "ignore" });
  } catch {
    // Ignore - already at base index or move not possible
  }
  try {
    const paneBaseIndex = execSync('tmux show-options -gv pane-base-index', {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    execSync(`tmux swap-pane -t .${paneBaseIndex}`, { stdio: "ignore" });
  } catch {
    // Ignore - already at base pane index or swap not possible
  }

  // Write lock file
  const tmuxTarget = `${WATCH_SESSION}:${(() => {
    try {
      return execSync('tmux display-message -p "#{window_index}.#{pane_index}"', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return "1.1";
    }
  })()}`;
  writeFileSync(lockFile, JSON.stringify({ pid: process.pid, tmux_target: tmuxTarget, version: VERSION }));

  // Rename current window to "watch"
  try {
    execSync(`tmux rename-window watch`, { stdio: "ignore" });
  } catch {
    // Ignore errors
  }

  // Add tmux keybinding dynamically (prefix + W to switch to watch session pane)
  try {
    execSync(`tmux bind-key W switch-client -t "${tmuxTarget}"`, { stdio: "ignore" });
  } catch {
    // Ignore errors - binding might already exist
  }

  // Start HTTP server if --serve flag is provided
  if (options.serve) {
    const { startServer } = await import("../server/index.js");
    await startServer({ port: parseInt(options.port), host: options.host });
  }

  // Enter alternate screen buffer (like vim, htop)
  process.stdout.write("\x1b[?1049h");
  process.stdout.write("\x1b[H"); // Move cursor to top-left

  const { waitUntilExit } = render(React.createElement(App));

  try {
    await waitUntilExit();
  } finally {
    // Exit alternate screen buffer, restore previous content
    process.stdout.write("\x1b[?1049l");
    try { unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

export function createTuiCommand(): Command {
  return new Command("tui")
    .description("Run the TUI dashboard (requires tmux)")
    .option("--serve", "Start HTTP server alongside TUI")
    .option("--port <number>", "Server port", String(DEFAULT_SERVER_PORT))
    .option("--host <address>", "Server host (use 0.0.0.0 for LAN)", "127.0.0.1")
    .action(runTui);
}
