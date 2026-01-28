import { homedir } from "os";
import { join } from "path";

export const CLAUDE_WATCH_DIR = join(homedir(), ".claude-watch");
export const SESSIONS_DIR = join(CLAUDE_WATCH_DIR, "sessions");
export const CONFIG_PATH = join(CLAUDE_WATCH_DIR, "config.json");

export const CLAUDE_DIR = join(homedir(), ".claude");
export const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

export const DEFAULT_SERVER_PORT = 3456;
