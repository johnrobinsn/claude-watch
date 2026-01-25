import { createInterface } from "readline";
import { mkdirSync, existsSync } from "fs";
import { CLAUDE_WATCH_DIR } from "../utils/paths.js";
import { getDatabase, closeDatabase } from "../db/index.js";
import { installHooks, saveClaudeSettings, uninstallHooks } from "./hooks.js";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} [y/N] `);
  return answer === "y" || answer === "yes";
}

export async function runSetup(): Promise<void> {
  console.log("\n claude-watch Setup\n");

  // Step 1: Create data directory
  console.log("Step 1: Creating data directory...");
  if (!existsSync(CLAUDE_WATCH_DIR)) {
    mkdirSync(CLAUDE_WATCH_DIR, { recursive: true });
    console.log(`  Created ${CLAUDE_WATCH_DIR}`);
  } else {
    console.log(`  ${CLAUDE_WATCH_DIR} already exists`);
  }

  // Step 2: Initialize database
  console.log("\nStep 2: Initializing database...");
  try {
    getDatabase();
    console.log("  Database initialized successfully");
    closeDatabase();
  } catch (error) {
    console.error("  Failed to initialize database:", error);
    process.exit(1);
  }

  // Step 3: Configure Claude hooks
  console.log("\nStep 3: Configuring Claude Code hooks...");
  const { diff, newSettings } = installHooks();
  console.log("");
  console.log(diff);
  console.log("");

  const confirmHooks = await confirm("Apply these changes to Claude settings?");
  if (confirmHooks) {
    saveClaudeSettings(newSettings);
    console.log("  Hooks installed successfully");
  } else {
    console.log("  Skipped hook installation");
  }

  // Done
  console.log("\n Setup complete!\n");
  console.log("To start claude-watch, run from any tmux session:");
  console.log("  claude-watch");
  console.log("");
  console.log("This will automatically create a 'watch' session and add");
  console.log("a keybinding (prefix + W) to quickly return to the dashboard.");
  console.log("");
}

export async function runUninstall(): Promise<void> {
  console.log("\n claude-watch Uninstall\n");

  // Remove hooks
  console.log("Removing Claude Code hooks...");
  const confirmHooks = await confirm("Remove claude-watch hooks from Claude settings?");
  if (confirmHooks) {
    uninstallHooks();
    console.log("  Hooks removed successfully");
  } else {
    console.log("  Skipped");
  }

  // Optionally remove data directory
  console.log("\nData directory: " + CLAUDE_WATCH_DIR);
  console.log("  (Manual removal: rm -rf ~/.claude-watch)");

  console.log("\n Uninstall complete!\n");
}

export { installHooks, uninstallHooks } from "./hooks.js";
