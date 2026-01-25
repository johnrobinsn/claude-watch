#!/usr/bin/env node

import { program } from "commander";
import { render } from "ink";
import React from "react";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { App } from "./app.js";
import { runSetup, runUninstall } from "./setup/index.js";
import { closeDatabase } from "./db/index.js";
import { isInTmux, getTmuxSessionName } from "./tmux/detect.js";
import { DATABASE_PATH } from "./utils/paths.js";

const version = "0.1.0";

program
  .name("claude-watch")
  .description("TUI dashboard for monitoring Claude Code sessions")
  .version(version);

const WATCH_SESSION = "watch";

program
  .option("--setup", "Run interactive setup wizard")
  .option("--uninstall", "Remove claude-watch hooks and configuration")
  .option("--demo-db <path>", "Use a demo database (disables tmux polling)")
  .action(async (options) => {
    if (options.setup) {
      await runSetup();
      process.exit(0);
    }

    if (options.uninstall) {
      await runUninstall();
      process.exit(0);
    }

    // Check if running in tmux
    if (!isInTmux()) {
      console.error("claude-watch requires tmux to run.");
      console.error("");
      console.error("Start tmux first, then run claude-watch:");
      console.error("  tmux new-session -s watch");
      console.error("  claude-watch");
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
        // Check if watch session exists
        let sessionExists = false;
        try {
          execSync(`tmux has-session -t ${WATCH_SESSION} 2>/dev/null`, { stdio: "ignore" });
          sessionExists = true;
        } catch {
          sessionExists = false;
        }

        if (sessionExists) {
          // Check if claude-watch is running in the session
          let claudeWatchRunning = false;
          try {
            const paneCmd = execSync(
              `tmux list-panes -t ${WATCH_SESSION} -F "#{pane_current_command}"`,
              { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
            ).trim();
            // Check if node or claude-watch is running (our process)
            claudeWatchRunning = paneCmd.includes("node") || paneCmd.includes("claude-watch");
          } catch {
            claudeWatchRunning = false;
          }

          if (!claudeWatchRunning) {
            // claude-watch not running, start it in the existing session
            execSync(`tmux send-keys -t ${WATCH_SESSION} ${escapeArg(fullCmd)} Enter`, { stdio: "inherit" });
          }

          // Switch to the session
          execSync(`tmux switch-client -t ${WATCH_SESSION}`, { stdio: "inherit" });
        } else {
          // Session doesn't exist, create it with claude-watch running
          execSync(`tmux new-session -d -s ${WATCH_SESSION} ${escapeArg(fullCmd)}`, { stdio: "inherit" });
          execSync(`tmux switch-client -t ${WATCH_SESSION}`, { stdio: "inherit" });
        }
      } catch (error) {
        console.error("Failed to switch to watch session:", error);
        process.exit(1);
      }

      process.exit(0);
    }

    // We're in the watch session, run the TUI

    // Check if setup has been run
    if (!existsSync(DATABASE_PATH)) {
      console.error("claude-watch has not been set up yet.");
      console.error("");
      console.error("Run the setup wizard first:");
      console.error("  claude-watch --setup");
      process.exit(1);
    }

    // Add tmux keybinding dynamically (prefix + W to switch to watch session)
    try {
      execSync(`tmux bind-key W switch-client -t ${WATCH_SESSION}`, { stdio: "ignore" });
    } catch {
      // Ignore errors - binding might already exist
    }

    // Enter alternate screen buffer (like vim, htop)
    process.stdout.write("\x1b[?1049h");
    process.stdout.write("\x1b[H"); // Move cursor to top-left

    const { waitUntilExit } = render(React.createElement(App, { demoDb: options.demoDb }));

    try {
      await waitUntilExit();
    } finally {
      // Exit alternate screen buffer, restore previous content
      process.stdout.write("\x1b[?1049l");
      closeDatabase();
    }
  });

program.parse();
