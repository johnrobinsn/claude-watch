import React from "react";
import { Box, Text } from "ink";

interface HeaderProps {
  claudeCount: number;
  tmuxCount: number;
}

export function Header({ claudeCount, tmuxCount }: HeaderProps) {
  const parts: string[] = [];
  if (claudeCount > 0) {
    parts.push(`${claudeCount} claude`);
  }
  if (tmuxCount > 0) {
    parts.push(`${tmuxCount} tmux`);
  }
  const countText = parts.length > 0 ? parts.join(", ") : "no sessions";

  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold color="cyan">
        claude-watch
      </Text>
      <Text dimColor>{countText}</Text>
    </Box>
  );
}
