import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import type { Session, SessionState } from "../db/index.js";
import type { TmuxSession } from "../tmux/detect.js";

const BLINK_INTERVAL = 500;

// Self-contained blinking bullet - only this component re-renders during blink
function BlinkingBullet({ color, shouldBlink }: { color: string; shouldBlink: boolean }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!shouldBlink) {
      setVisible(true);
      return;
    }
    const interval = setInterval(() => {
      setVisible((prev) => !prev);
    }, BLINK_INTERVAL);
    return () => clearInterval(interval);
  }, [shouldBlink]);

  return <Text color={color}>{visible ? "●" : " "}</Text>;
}

// Unified display item - either a Claude session or a plain tmux session
export type DisplayItem =
  | { type: "claude"; session: Session }
  | { type: "tmux"; tmuxSession: TmuxSession };

interface SessionEntryProps {
  item: DisplayItem;
  isSelected: boolean;
  width?: number;
}

function getStateColor(state: SessionState): string {
  switch (state) {
    case "waiting":
    case "permission":
      return "red";
    case "idle":
      return "yellow";
    case "busy":
      return "green";
    default:
      return "gray";
  }
}

function getStateText(session: Session): string {
  switch (session.state) {
    case "permission":
      return "Waiting: permission";
    case "waiting":
      return session.prompt_text ? `Waiting: ${truncate(session.prompt_text, 30)}` : "Waiting";
    case "idle":
      return "Idle";
    case "busy":
      return session.current_action || "Working...";
    default:
      return session.state;
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function truncatePath(path: string, maxLen: number): string {
  if (path.length <= maxLen) return path;

  // Try to show ~ for home directory
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home && path.startsWith(home)) {
    path = "~" + path.slice(home.length);
    if (path.length <= maxLen) return path;
  }

  // Truncate from the beginning
  return "…" + path.slice(-(maxLen - 1));
}

export function SessionEntry({ item, isSelected, width }: SessionEntryProps) {
  if (item.type === "claude") {
    return <ClaudeEntry session={item.session} isSelected={isSelected} width={width} />;
  } else {
    return <TmuxEntry tmuxSession={item.tmuxSession} isSelected={isSelected} width={width} />;
  }
}

function ClaudeEntry({
  session,
  isSelected,
  width,
}: {
  session: Session;
  isSelected: boolean;
  width?: number;
}) {
  const stateColor = getStateColor(session.state);
  const shouldBlink = session.state === "busy";

  // Format tmux target, showing window name instead of index when available
  const tmuxTarget = (() => {
    if (!session.tmux_target) return "—";
    if (!session.window_name) return session.tmux_target;
    // Replace window index with window name: "session:idx.pane" -> "session:name.pane"
    const match = session.tmux_target.match(/^([^:]+):(\d+)\.(\d+)$/);
    if (match) {
      return `${match[1]}:${session.window_name}.${match[3]}`;
    }
    return session.tmux_target;
  })();

  // Fixed widths for prefix and suffix columns
  const prefixWidth = 4; // selector + bullet + space
  const typeWidth = 8;
  const totalWidth = width || 100;
  const stateWidth = totalWidth <= 70 ? 10 : 22;

  // Calculate flex column widths from remaining space
  const remainingWidth = totalWidth - prefixWidth - typeWidth - stateWidth;
  const targetWidth = Math.floor(remainingWidth * 0.3);
  const pathWidth = remainingWidth - targetWidth;

  return (
    <Box width={width}>
      {/* Selection indicator (▶ is wide, takes 2 cols) or 2 spaces */}
      <Text color="cyan" bold>{isSelected ? "▶" : "  "}</Text>
      {/* Bullet in column 4 - self-contained blink logic */}
      <BlinkingBullet color={stateColor} shouldBlink={shouldBlink} />
      <Text>{" "}</Text>

      {/* tmux target */}
      <Box width={targetWidth} overflowX="hidden">
        <Text dimColor wrap="truncate-end">{tmuxTarget}</Text>
      </Box>

      {/* Working directory */}
      <Box width={pathWidth} overflowX="hidden">
        <Text wrap="truncate-end">{truncatePath(session.cwd, pathWidth)}</Text>
      </Box>

      {/* Type column */}
      <Box width={typeWidth}>
        <Text dimColor>claude</Text>
      </Box>

      {/* State description */}
      <Box width={stateWidth} overflowX="hidden">
        <Text color={stateColor} wrap="truncate-end">{getStateText(session)}</Text>
      </Box>
    </Box>
  );
}

function TmuxEntry({
  tmuxSession,
  isSelected,
  width,
}: {
  tmuxSession: TmuxSession;
  isSelected: boolean;
  width?: number;
}) {
  const bullet = "●";

  // Fixed widths for prefix and suffix columns
  const prefixWidth = 4; // selector + bullet + space
  const typeWidth = 8;
  const totalWidth = width || 100;
  const stateWidth = totalWidth <= 70 ? 10 : 22;

  // Calculate flex column widths from remaining space
  const remainingWidth = totalWidth - prefixWidth - typeWidth - stateWidth;
  const targetWidth = Math.floor(remainingWidth * 0.3);
  const pathWidth = remainingWidth - targetWidth;

  const windowInfo = `${tmuxSession.windowCount} window${tmuxSession.windowCount !== 1 ? "s" : ""}${tmuxSession.attached ? " (attached)" : ""}`;

  return (
    <Box width={width}>
      {/* Selection indicator (▶ is wide, takes 2 cols) or 2 spaces */}
      <Text color="cyan" bold>{isSelected ? "▶" : "  "}</Text>
      {/* Bullet in column 4 */}
      <Text dimColor>{bullet}</Text>
      <Text>{" "}</Text>

      {/* Session name as target */}
      <Box width={targetWidth} overflowX="hidden">
        <Text dimColor wrap="truncate-end">{tmuxSession.name}</Text>
      </Box>

      {/* Window count info */}
      <Box width={pathWidth} overflowX="hidden">
        <Text dimColor wrap="truncate-end">{windowInfo}</Text>
      </Box>

      {/* Type column */}
      <Box width={typeWidth}>
        <Text dimColor>tmux</Text>
      </Box>

      {/* Empty state column for alignment */}
      <Box width={stateWidth}>
        <Text dimColor>—</Text>
      </Box>
    </Box>
  );
}
