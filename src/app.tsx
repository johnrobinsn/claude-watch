import React, { useState, useEffect, useCallback } from "react";
import { Box, useApp, useInput, useStdout } from "ink";
import { Header, SessionList, StatusBar } from "./components/index.js";
import { getTotalItemCount, getItemAtIndex } from "./components/SessionList.js";
import { getAllSessions, cleanupStaleSessions } from "./db/index.js";
import Database from "better-sqlite3";
import { DATABASE_PATH } from "./utils/paths.js";
import { initializeSchema } from "./db/schema.js";
import { isInTmux, getAllTmuxSessions, type TmuxSession } from "./tmux/detect.js";
import { switchToTarget } from "./tmux/navigate.js";
import { capturePaneContent } from "./tmux/pane.js";
import type { Session } from "./db/sessions.js";

const POLL_INTERVAL = 500; // ms
const BLINK_INTERVAL = 500; // ms
const CLEANUP_INTERVAL = 5000; // ms
const PANE_CHECK_INTERVAL = 2000; // ms - check tmux panes for prompt

interface AppProps {
  demoDb?: string;
}

export function App({ demoDb }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSession[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showBlink, setShowBlink] = useState(true);
  const [inTmux] = useState(() => isInTmux());

  // Use demo database if provided, otherwise use default
  const dbPath = demoDb || DATABASE_PATH;

  // Get terminal dimensions
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;

  // Load sessions from database and tmux
  const loadSessions = useCallback(() => {
    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath);
      const loadedSessions = getAllSessions(db);
      setSessions(loadedSessions);

      // Also load tmux sessions (skip in demo mode)
      const loadedTmuxSessions = demoDb ? [] : getAllTmuxSessions();
      setTmuxSessions(loadedTmuxSessions);

      // Adjust selected index if out of bounds
      const totalCount = getTotalItemCount(loadedSessions, loadedTmuxSessions);
      if (selectedIndex >= totalCount) {
        setSelectedIndex(Math.max(0, totalCount - 1));
      }
    } catch {
      // Database might be locked, try again next poll
    } finally {
      db?.close();
    }
  }, [selectedIndex, dbPath, demoDb]);

  // Poll for session updates
  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [loadSessions]);

  // Blink effect for busy sessions
  useEffect(() => {
    const interval = setInterval(() => {
      setShowBlink((prev) => !prev);
    }, BLINK_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // Cleanup stale sessions periodically (skip in demo mode)
  useEffect(() => {
    if (demoDb) return;

    const cleanup = () => {
      let db: Database.Database | null = null;
      try {
        db = new Database(dbPath);
        initializeSchema(db);
        cleanupStaleSessions(db);
      } catch {
        // Ignore errors during cleanup
      } finally {
        db?.close();
      }
    };

    cleanup(); // Run on startup
    const interval = setInterval(cleanup, CLEANUP_INTERVAL);
    return () => clearInterval(interval);
  }, [dbPath, demoDb]);

  // Check tmux panes to sync state with what's actually shown (skip in demo mode)
  useEffect(() => {
    if (!inTmux || demoDb) return;

    const checkPanes = () => {
      let db: Database.Database | null = null;
      try {
        db = new Database(dbPath);
        initializeSchema(db);

        // Get ALL sessions with tmux targets to check their actual state
        const allSessions = db
          .prepare(
            "SELECT id, tmux_target, state FROM sessions WHERE tmux_target IS NOT NULL"
          )
          .all() as { id: string; tmux_target: string; state: string }[];

        for (const session of allSessions) {
          const content = capturePaneContent(session.tmux_target);
          if (!content) continue;

          const isWorking = content.includes("Esc to interrupt") || content.includes("esc to interrupt");

          if (isWorking && session.state !== "busy") {
            // Pane shows working but state is not busy - set to busy
            const stmt = db.prepare(`
              UPDATE sessions
              SET state = 'busy', current_action = 'Working...', last_update = ?
              WHERE id = ?
            `);
            stmt.run(Date.now(), session.id);
          } else if (!isWorking && session.state === "busy") {
            // Pane shows idle but state is busy - set to idle
            const stmt = db.prepare(`
              UPDATE sessions
              SET state = 'idle', current_action = NULL, last_update = ?
              WHERE id = ?
            `);
            stmt.run(Date.now(), session.id);
          }
        }
      } catch {
        // Ignore errors during pane check
      } finally {
        db?.close();
      }
    };

    const interval = setInterval(checkPanes, PANE_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [inTmux, dbPath, demoDb]);

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
        <SessionList
          sessions={sessions}
          tmuxSessions={tmuxSessions}
          selectedIndex={selectedIndex}
          showBlink={showBlink}
          width={terminalWidth - 2}
        />
      </Box>
      <StatusBar inTmux={inTmux} />
    </Box>
  );
}
