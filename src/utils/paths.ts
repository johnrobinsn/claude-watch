import { homedir } from "os";
import { join } from "path";

export const CLAUDE_WATCH_DIR = join(homedir(), ".claude-watch");
export const DATABASE_PATH = join(CLAUDE_WATCH_DIR, "state.db");
export const CONFIG_PATH = join(CLAUDE_WATCH_DIR, "config.json");

export const CLAUDE_DIR = join(homedir(), ".claude");
export const CLAUDE_SETTINGS_PATH = join(CLAUDE_DIR, "settings.json");

export const TMUX_CONF_PATH = join(homedir(), ".tmux.conf");
