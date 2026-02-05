import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { CLAUDE_SETTINGS_PATH, CLAUDE_DIR } from "../utils/paths.js";
import { VERSION } from "../utils/version.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Hook {
  type: "command";
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: Hook[];
}

interface HooksConfig {
  [eventName: string]: HookMatcher[];
}

interface ClaudeWatchMetadata {
  version: string;
  installedAt: string;
  hookPath?: string;
}

interface ClaudeSettings {
  hooks?: HooksConfig;
  "claude-watch"?: ClaudeWatchMetadata;
  [key: string]: unknown;
}

export function getHookScriptPath(scriptName: string): string {
  // In production, scripts are in dist/hooks/
  // During development, they might be in src/hooks/
  const distPath = join(__dirname, "..", "hooks", scriptName);
  return distPath;
}

export function getClaudeWatchHooks(): HooksConfig {
  const hookScript = getHookScriptPath("claude-watch-hook.js");

  return {
    SessionStart: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" session-start`,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" user-prompt-submit`,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" stop`,
          },
        ],
      },
    ],
    PermissionRequest: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" permission-request`,
          },
        ],
      },
    ],
    Notification: [
      {
        matcher: "idle_prompt",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" notification-idle`,
          },
        ],
      },
      {
        matcher: "permission_prompt",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" notification-permission`,
          },
        ],
      },
      {
        matcher: "elicitation_dialog",
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" notification-elicitation`,
          },
        ],
      },
    ],
    PreToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" pre-tool-use`,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" post-tool-use`,
          },
        ],
      },
    ],
    PostToolUseFailure: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" post-tool-use-failure`,
          },
        ],
      },
    ],
    SessionEnd: [
      {
        hooks: [
          {
            type: "command",
            command: `node "${hookScript}" session-end`,
          },
        ],
      },
    ],
  };
}

export function loadClaudeSettings(): ClaudeSettings {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return {};
  }

  try {
    const content = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Get the version of installed claude-watch hooks.
 * Returns null if hooks are not installed or version is not tracked.
 */
export function getInstalledHooksVersion(): string | null {
  const settings = loadClaudeSettings();
  return settings["claude-watch"]?.version ?? null;
}

/**
 * Check if hooks need to be installed or updated.
 * Returns: 'install' | 'update' | 'current'
 */
export function checkHooksStatus(): "install" | "update" | "current" {
  const settings = loadClaudeSettings();

  // Check if hooks are installed at all
  if (!settings.hooks) {
    return "install";
  }

  // Check if any claude-watch hooks exist
  const hasClaudeWatchHooks = Object.values(settings.hooks).some((matchers) =>
    matchers.some((m) => m.hooks.some((h) => h.command.includes("claude-watch-hook")))
  );

  if (!hasClaudeWatchHooks) {
    return "install";
  }

  // Check version
  const installedVersion = settings["claude-watch"]?.version;
  if (!installedVersion || installedVersion !== VERSION) {
    return "update";
  }

  // Check if hook path has changed (e.g., switched from global to local dev)
  const installedPath = settings["claude-watch"]?.hookPath;
  const currentPath = getHookScriptPath("claude-watch-hook.js");
  if (installedPath && installedPath !== currentPath) {
    return "update";
  }

  return "current";
}

export function mergeHooks(existing: HooksConfig | undefined, newHooks: HooksConfig): HooksConfig {
  const merged: HooksConfig = { ...existing };

  for (const [eventName, matchers] of Object.entries(newHooks)) {
    if (!merged[eventName]) {
      merged[eventName] = [];
    } else {
      // Remove any existing claude-watch hooks for this event (so we can replace them)
      merged[eventName] = merged[eventName].filter((existingMatcher) => {
        return !existingMatcher.hooks.some((h) => h.command.includes("claude-watch-hook"));
      });
    }

    // Add new claude-watch matchers
    for (const newMatcher of matchers) {
      merged[eventName].push(newMatcher);
    }
  }

  return merged;
}

export function removeClaudeWatchHooks(hooks: HooksConfig): HooksConfig {
  const cleaned: HooksConfig = {};

  for (const [eventName, matchers] of Object.entries(hooks)) {
    const filteredMatchers = matchers.filter((matcher) => {
      // Remove matchers that have claude-watch-hook commands
      return !matcher.hooks.some((h) => h.command.includes("claude-watch-hook"));
    });

    if (filteredMatchers.length > 0) {
      cleaned[eventName] = filteredMatchers;
    }
  }

  return cleaned;
}

export function generateDiff(
  oldSettings: ClaudeSettings,
  newSettings: ClaudeSettings
): string {
  const oldJson = JSON.stringify(oldSettings, null, 2);
  const newJson = JSON.stringify(newSettings, null, 2);

  if (oldJson === newJson) {
    return "No changes needed.";
  }

  // Simple diff display
  const lines: string[] = [];
  lines.push("Changes to ~/.claude/settings.json:");
  lines.push("");

  if (!oldSettings.hooks) {
    lines.push("+ Adding hooks configuration");
  } else {
    lines.push("~ Updating hooks configuration");
  }

  lines.push("");
  lines.push("New hooks to be added:");
  const hookEvents = Object.keys(getClaudeWatchHooks());
  for (const event of hookEvents) {
    lines.push(`  + ${event}: claude-watch-hook`);
  }

  return lines.join("\n");
}

export function saveClaudeSettings(settings: ClaudeSettings): void {
  // Ensure directory exists
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  const content = JSON.stringify(settings, null, 2);
  writeFileSync(CLAUDE_SETTINGS_PATH, content, "utf-8");
}

export function installHooks(): { diff: string; newSettings: ClaudeSettings } {
  const currentSettings = loadClaudeSettings();
  const claudeWatchHooks = getClaudeWatchHooks();
  const mergedHooks = mergeHooks(currentSettings.hooks, claudeWatchHooks);

  const newSettings: ClaudeSettings = {
    ...currentSettings,
    hooks: mergedHooks,
    "claude-watch": {
      version: VERSION,
      installedAt: new Date().toISOString(),
      hookPath: getHookScriptPath("claude-watch-hook.js"),
    },
  };

  const diff = generateDiff(currentSettings, newSettings);

  return { diff, newSettings };
}

export function uninstallHooks(): void {
  const currentSettings = loadClaudeSettings();

  if (!currentSettings.hooks) {
    return;
  }

  const cleanedHooks = removeClaudeWatchHooks(currentSettings.hooks);

  const newSettings: ClaudeSettings = {
    ...currentSettings,
  };

  if (Object.keys(cleanedHooks).length === 0) {
    delete newSettings.hooks;
  } else {
    newSettings.hooks = cleanedHooks;
  }

  // Remove claude-watch metadata
  delete newSettings["claude-watch"];

  saveClaudeSettings(newSettings);
}
