import * as os from "node:os";
import { Box, Text } from "@mariozechner/pi-tui";
import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";

export function shortenPath(path: string): string {
  if (typeof path !== "string") return "";
  const home = os.homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

export function replaceTabs(text: string): string {
  return text.replace(/\t/g, "   ");
}

export function renderOutputLines(
  lines: string[],
  theme: Theme,
  toolBox: Box,
  options?: { useThemeColor?: boolean }
): void {
  const useThemeColor = options?.useThemeColor ?? false;
  toolBox.addChild(new Text("", 0, 0));
  for (const line of lines) {
    const styled = useThemeColor
      ? theme.fg("toolOutput" as ThemeColor, line)
      : line;
    toolBox.addChild(new Text(styled, 0, 0));
  }
}
