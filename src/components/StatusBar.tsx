import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  inTmux: boolean;
}

export function StatusBar({ inTmux }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Text>
        <Text color="cyan">[Enter]</Text>
        <Text dimColor> Jump to session </Text>
        <Text color="cyan">[↑↓/jk]</Text>
        <Text dimColor> Navigate </Text>
        <Text color="cyan">[q]</Text>
        <Text dimColor> Quit</Text>
        {!inTmux && (
          <Text color="yellow"> (not in tmux - navigation disabled)</Text>
        )}
      </Text>
    </Box>
  );
}
