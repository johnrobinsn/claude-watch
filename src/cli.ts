#!/usr/bin/env node

import { program } from "commander";
import {
  createServeCommand,
  createSetupCommand,
  createUninstallCommand,
  runTui,
  runServe,
} from "./commands/index.js";
import { runSetup, runCleanup } from "./setup/index.js";
import { DEFAULT_SERVER_PORT } from "./utils/paths.js";
import { VERSION } from "./utils/version.js";

// Deprecation warning helper
function deprecationWarning(oldFlag: string, newCommand: string): void {
  console.warn(
    `\x1b[33m⚠ Warning: --${oldFlag} is deprecated. Use "claude-watch ${newCommand}" instead.\x1b[0m`
  );
  console.warn("");
}

program
  .name("claude-watch")
  .description("TUI dashboard for monitoring Claude Code sessions")
  .version(VERSION);

// Register subcommands
program.addCommand(createServeCommand());
program.addCommand(createSetupCommand());
program.addCommand(createUninstallCommand());

// BACKWARD COMPATIBILITY: Support old flags on root command
program
  .option("--setup", "Run interactive setup wizard (deprecated: use 'setup' command)")
  .option("--uninstall", "Remove hooks (deprecated: use 'uninstall' command)")
  .option("--cleanup", "Remove hooks (alias for --uninstall)")
  .option("--serve", "Start HTTP server alongside TUI (use with --serve-port, --serve-host)")
  .option("--serve-only", "Run HTTP server only (deprecated: use 'serve' command)")
  .option("--serve-port <number>", "Server port for --serve/--serve-only", String(DEFAULT_SERVER_PORT))
  .option("--serve-host <address>", "Server host for --serve/--serve-only", "127.0.0.1");

// Hide deprecated options from help
program.options.forEach((opt) => {
  if (["--setup", "--uninstall", "--cleanup", "--serve-only", "--serve-port", "--serve-host"].includes(opt.long || "")) {
    opt.hidden = true;
  }
});

// Default action: handle deprecated flags or run TUI
program.action(async (options) => {
  // Handle deprecated --setup flag
  if (options.setup) {
    deprecationWarning("setup", "setup");
    await runSetup();
    process.exit(0);
  }

  // Handle deprecated --uninstall or --cleanup flag
  if (options.uninstall || options.cleanup) {
    if (options.uninstall) {
      deprecationWarning("uninstall", "uninstall");
    }
    await runCleanup();
    process.exit(0);
  }

  // Handle deprecated --serve-only flag
  if (options.serveOnly) {
    deprecationWarning("serve-only", "serve");
    await runServe({ port: options.servePort, host: options.serveHost });
    return;
  }

  // Default: run TUI (with optional --serve)
  await runTui({
    serve: options.serve,
    port: options.servePort,
    host: options.serveHost,
  });
});

program.parse();
