import { Command } from "commander";
import { runCleanup } from "../setup/index.js";

export async function runUninstallCommand(): Promise<void> {
  await runCleanup();
  process.exit(0);
}

export function createUninstallCommand(): Command {
  return new Command("uninstall")
    .description("Remove claude-watch hooks and configuration")
    .action(runUninstallCommand);
}
