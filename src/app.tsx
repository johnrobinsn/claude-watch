import React, { useState, useEffect, useCallback } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { Header, HelpDialog, SessionList, StatusBar } from "./components/index.js";
import { getTotalItemCount, getItemAtIndex } from "./components/SessionList.js";
import {
  getAllSessions,
  cleanupStaleSessions,
  updateSession,
  type Session,
} from "./db/index.js";
import { isInTmux, getAllTmuxSessions, getTmuxSessionName, type TmuxSession } from "./tmux/detect.js";
import { switchToTarget } from "./tmux/navigate.js";
import { checkForInterruption } from "./tmux/pane.js";

const POLL_INTERVAL = 500; // ms
const CLEANUP_INTERVAL = 5000; // ms
const PANE_CHECK_INTERVAL = 500; // ms - check tmux panes for prompt

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [inTmux] = useState(() => isInTmux());
  const [currentTmuxSession] = useState(() => getTmuxSessionName());

  // Get terminal dimensions
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;

  // Load sessions from JSON files and tmux
  const loadSessions = useCallback(() => {
    try {
      const loadedSessions = getAllSessions();

      // Only update if sessions have changed (compare by JSON to detect actual changes)
      setSessions((prev) => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(loadedSessions);
        return prevJson === newJson ? prev : loadedSessions;
      });

      // Also load tmux sessions (excluding the current session where claude-watch runs)
      const loadedTmuxSessions = getAllTmuxSessions().filter(
        (ts) => ts.name !== currentTmuxSession
      );

      // Only update if tmux sessions have changed
      setTmuxSessions((prev) => {
        const prevJson = JSON.stringify(prev);
        const newJson = JSON.stringify(loadedTmuxSessions);
        return prevJson === newJson ? prev : loadedTmuxSessions;
      });

      // Adjust selected index if out of bounds
      const totalCount = getTotalItemCount(loadedSessions, loadedTmuxSessions);
      if (selectedIndex >= totalCount) {
        setSelectedIndex(Math.max(0, totalCount - 1));
      }
    } catch {
      // Ignore errors, try again next poll
    }
  }, [selectedIndex, currentTmuxSession]);

  // Poll for session updates
  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // Cleanup stale sessions periodically
  useEffect(() => {
    const cleanup = () => {
      try {
        cleanupStaleSessions();
      } catch {
        // Ignore errors during cleanup
      }
    };

    cleanup(); // Run on startup
    const interval = setInterval(cleanup, CLEANUP_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Check tmux panes to sync state with what's actually shown
  useEffect(() => {
    if (!inTmux) return;

    const checkPanes = () => {
      try {
        const allSessions = getAllSessions().filter((s) => s.tmux_target);

        for (const session of allSessions) {
          if (!session.tmux_target) continue;

          const update = checkForInterruption(session.tmux_target);
          if (update && session.state !== "idle") {
            updateSession(session.id, update);
          }
        }
      } catch {
        // Ignore errors during pane check
      }
    };

    const interval = setInterval(checkPanes, PANE_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [inTmux]);

  // Get total item count for navigation
  const totalCount = getTotalItemCount(sessions, tmuxSessions);

  // Calculate non-Claude tmux session count for header
  const claudeTmuxSessions = new Set<string>();
  for (const session of sessions) {
    if (session.tmux_target) {
      const sessionName = session.tmux_target.split(":")[0];
      claudeTmuxSessions.add(sessionName);
    }
  }
  const nonClaudeTmuxCount = tmuxSessions.filter(
    (ts) => !claudeTmuxSessions.has(ts.name)
  ).length;

  // Handle keyboard input
  useInput((input, key) => {
    if (input === "q") {
      exit();
      return;
    }

    if (input === "h") {
      setShowHelp((prev) => !prev);
      return;
    }

    // Dismiss help on any other key
    if (showHelp) {
      setShowHelp(false);
      return;
    }

    if (totalCount === 0) return;

    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(totalCount - 1, prev + 1));
    }

    // Jump to session
    if (key.return && inTmux) {
      const item = getItemAtIndex(sessions, tmuxSessions, selectedIndex);
      if (item) {
        if (item.type === "claude" && item.session.tmux_target) {
          switchToTarget(item.session.tmux_target);
        } else if (item.type === "tmux") {
          // For tmux sessions, switch to the session (first window)
          switchToTarget(item.tmuxSession.name + ":");
        }
      }
    }
  });

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Header claudeCount={sessions.length} tmuxCount={nonClaudeTmuxCount} />
      <Box borderStyle="single" borderTop={false} borderBottom={false} flexGrow={1}>
        {showHelp ? (
          <HelpDialog width={terminalWidth - 2} />
        ) : (
          <SessionList
            sessions={sessions}
            tmuxSessions={tmuxSessions}
            selectedIndex={selectedIndex}
            width={terminalWidth - 2}
          />
        )}
      </Box>
      <StatusBar inTmux={inTmux} />
    </Box>
  );
}
