import React from "react";
import { Box, Text } from "ink";
import { VERSION } from "../utils/version.js";

interface StatusBarProps {
  inTmux: boolean;
}

export function StatusBar({ inTmux }: StatusBarProps) {
  return (
    <Box borderStyle="single" borderTop={false} paddingX={1} justifyContent="space-between">
      <Text>
        <Text color="cyan">[h]</Text>
        <Text dimColor> Help </Text>
        <Text color="cyan">[q]</Text>
        <Text dimColor> Quit </Text>
        <Text color="cyan">[prefix+W]</Text>
        <Text dimColor> Return here</Text>
        {!inTmux && (
          <Text color="yellow"> (not in tmux - navigation disabled)</Text>
        )}
      </Text>
      <Text dimColor>v{VERSION}</Text>
    </Box>
  );
}
