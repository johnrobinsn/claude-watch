import React from "react";
import { Box, Text } from "ink";

interface HelpDialogProps {
  width?: number;
}

const KEYS = [
  { key: "Enter", desc: "Go to session" },
  { key: "↑↓ / j k", desc: "Select session" },
  { key: "h", desc: "Toggle help" },
  { key: "q", desc: "Quit" },
  { key: "prefix+W", desc: "Return here" },
];

export function HelpDialog({ width }: HelpDialogProps) {
  const boxWidth = Math.min(width || 40, 40);

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={width}>
      <Box
        flexDirection="column"
        borderStyle="round"
        paddingX={2}
        paddingY={1}
        width={boxWidth}
      >
        <Box justifyContent="center" marginBottom={1}>
          <Text bold>Keyboard Shortcuts</Text>
        </Box>
        {KEYS.map(({ key, desc }) => (
          <Box key={key}>
            <Box width={14}>
              <Text color="cyan">{key}</Text>
            </Box>
            <Text dimColor>{desc}</Text>
          </Box>
        ))}
        <Box justifyContent="center" marginTop={1}>
          <Text dimColor>Press any key to close</Text>
        </Box>
      </Box>
    </Box>
  );
}
