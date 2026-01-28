import { Command } from "commander";
import { runSetup } from "../setup/index.js";

export async function runSetupCommand(): Promise<void> {
  await runSetup();
  process.exit(0);
}

export function createSetupCommand(): Command {
  return new Command("setup")
    .description("Run interactive setup wizard")
    .action(runSetupCommand);
}
