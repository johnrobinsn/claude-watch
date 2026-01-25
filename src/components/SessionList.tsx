import React from "react";
import { Box, Text } from "ink";
import type { Session } from "../db/sessions.js";
import type { TmuxSession } from "../tmux/detect.js";
import { SessionEntry, type DisplayItem } from "./SessionEntry.js";

interface SessionListProps {
  sessions: Session[];
  tmuxSessions: TmuxSession[];
  selectedIndex: number;
  showBlink: boolean;
  width?: number;
}

export function SessionList({ sessions, tmuxSessions, selectedIndex, showBlink, width }: SessionListProps) {
  // Get tmux session names that have Claude instances
  const claudeTmuxSessions = new Set<string>();
  for (const session of sessions) {
    if (session.tmux_target) {
      // Extract session name from target (e.g., "cw:1.3" -> "cw")
      const sessionName = session.tmux_target.split(":")[0];
      claudeTmuxSessions.add(sessionName);
    }
  }

  // Filter tmux sessions to only those without Claude instances
  const nonClaudeTmuxSessions = tmuxSessions.filter(
    (ts) => !claudeTmuxSessions.has(ts.name)
  );

  // Build unified display items: Claude sessions first, then non-Claude tmux sessions
  const items: DisplayItem[] = [
    ...sessions.map((session): DisplayItem => ({ type: "claude", session })),
    ...nonClaudeTmuxSessions.map((tmuxSession): DisplayItem => ({ type: "tmux", tmuxSession })),
  ];

  if (items.length === 0) {
    return (
      <Box paddingY={1}>
        <Text dimColor>  No sessions</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {items.map((item, index) => (
        <SessionEntry
          key={item.type === "claude" ? item.session.id : `tmux-${item.tmuxSession.name}`}
          item={item}
          isSelected={index === selectedIndex}
          showBlink={showBlink}
          width={width}
        />
      ))}
    </Box>
  );
}

// Export the total count for navigation purposes
export function getTotalItemCount(sessions: Session[], tmuxSessions: TmuxSession[]): number {
  const claudeTmuxSessions = new Set<string>();
  for (const session of sessions) {
    if (session.tmux_target) {
      const sessionName = session.tmux_target.split(":")[0];
      claudeTmuxSessions.add(sessionName);
    }
  }
  const nonClaudeTmuxSessions = tmuxSessions.filter(
    (ts) => !claudeTmuxSessions.has(ts.name)
  );
  return sessions.length + nonClaudeTmuxSessions.length;
}

// Get the display item at a specific index
export function getItemAtIndex(
  sessions: Session[],
  tmuxSessions: TmuxSession[],
  index: number
): DisplayItem | null {
  const claudeTmuxSessions = new Set<string>();
  for (const session of sessions) {
    if (session.tmux_target) {
      const sessionName = session.tmux_target.split(":")[0];
      claudeTmuxSessions.add(sessionName);
    }
  }
  const nonClaudeTmuxSessions = tmuxSessions.filter(
    (ts) => !claudeTmuxSessions.has(ts.name)
  );

  if (index < sessions.length) {
    return { type: "claude", session: sessions[index] };
  }
  const tmuxIndex = index - sessions.length;
  if (tmuxIndex < nonClaudeTmuxSessions.length) {
    return { type: "tmux", tmuxSession: nonClaudeTmuxSessions[tmuxIndex] };
  }
  return null;
}
