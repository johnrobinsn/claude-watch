import { Command } from "commander";
import { existsSync, mkdirSync } from "fs";
import { CLAUDE_WATCH_DIR, SESSIONS_DIR, DEFAULT_SERVER_PORT } from "../utils/paths.js";

export interface ServeOptions {
  port: string;
  host: string;
}

export async function runServe(options: ServeOptions): Promise<void> {
  // Auto-create data directories if needed
  if (!existsSync(CLAUDE_WATCH_DIR)) {
    mkdirSync(CLAUDE_WATCH_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }

  const { startServer } = await import("../server/index.js");
  await startServer({
    port: parseInt(options.port),
    host: options.host,
  });
  // Keep process running (server is running)
}

export function createServeCommand(): Command {
  return new Command("serve")
    .description("Start HTTP server only (no TUI, no tmux required)")
    .option("--port <number>", "Server port", String(DEFAULT_SERVER_PORT))
    .option("--host <address>", "Server host (use 0.0.0.0 for LAN)", "127.0.0.1")
    .action(runServe);
}
