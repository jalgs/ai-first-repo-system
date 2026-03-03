import { Container, Text, Box, Spacer, Markdown } from "@mariozechner/pi-tui";
import { getMarkdownTheme, keyHint, DynamicBorder, type Theme, type ThemeColor } from "@mariozechner/pi-coding-agent";
import type { SubAgentStep, SubAgentTranscript } from "../../sub-agent.js";
import { renderToolContent } from "./tool-renderers.js";

export function renderThinkingStep(
  step: SubAgentStep,
  theme: Theme,
  expanded: boolean,
  container: Container
): void {
  if (!step.content) return;

  // Always show thinking content - never hide it entirely.
  // When collapsed: show truncated preview
  // When expanded: show full content
  const thinkingBox = new Box(1, 1, (_s: string) => _s);
  const thinkingLines = step.content.split("\n");
  const maxLines = expanded ? thinkingLines.length : 3;
  const displayLines = thinkingLines.slice(0, maxLines);

  for (const line of displayLines) {
    thinkingBox.addChild(new Text(theme.italic(theme.fg("thinkingText", line)), 0, 0));
  }

  if (!expanded && thinkingLines.length > maxLines) {
    thinkingBox.addChild(
      new Text(theme.fg("muted", `... (${thinkingLines.length - maxLines} more lines)`), 0, 0)
    );
  }

  container.addChild(thinkingBox);
  container.addChild(new Spacer(1));
}

export function renderTextStep(
  step: SubAgentStep,
  theme: Theme,
  expanded: boolean,
  container: Container
): void {
  if (!step.content?.trim()) return;

  const markdownTheme = getMarkdownTheme();
  // Always show text content - use markdown when expanded, plain text preview when collapsed
  if (expanded) {
    container.addChild(new Markdown(step.content.trim(), 1, 0, markdownTheme));
  } else {
    // Show first few lines as preview
    const lines = step.content.trim().split("\n");
    const maxLines = 5;
    const displayLines = lines.slice(0, maxLines);
    for (const line of displayLines) {
      const truncated = line.length > 120 ? line.slice(0, 120) + "..." : line;
      container.addChild(new Text(theme.fg("text", truncated), 1, 0));
    }
    if (lines.length > maxLines) {
      container.addChild(new Text(theme.fg("muted", `... (${lines.length - maxLines} more lines)`), 1, 0));
    }
  }
  container.addChild(new Spacer(1));
}

export function renderToolWithResult(
  callStep: SubAgentStep,
  resultStep: SubAgentStep | undefined,
  theme: Theme,
  expanded: boolean
): Container {
  const stepContainer = new Container();
  if (callStep.type !== "call") return stepContainer;

  const toolName = callStep.toolName ?? "unknown";
  const args = callStep.args ?? {};
  const hasResult = resultStep?.type === "result";
  const isError = hasResult && !!resultStep?.isError;
  const isSuccess = hasResult && !isError;

  const bgFn = !hasResult
    ? (text: string) => theme.bg("toolPendingBg", text)
    : isError
      ? (text: string) => theme.bg("toolErrorBg", text)
      : (text: string) => theme.bg("toolSuccessBg", text);

  const toolBox = new Box(1, 1, bgFn);
  const statusIcon = !hasResult ? "◐" : isError ? "✗" : "✓";
  const statusColor: ThemeColor = !hasResult ? "muted" : isError ? "error" : "success";

  renderToolContent(
    toolName,
    args as Record<string, unknown>,
    resultStep,
    theme,
    expanded,
    toolBox,
    statusIcon,
    statusColor
  );

  stepContainer.addChild(toolBox);
  return stepContainer;
}

export function renderTranscript(
  details: SubAgentTranscript,
  theme: Theme,
  expanded: boolean,
  isPartial: boolean
): Container {
  const container = new Container();

  if (!details?.steps?.length) {
    const empty = new Container();
    empty.addChild(new Text(theme.fg("muted", "  Initializing sub-agent..."), 1, 0));
    return empty;
  }

  const headerBox = new Box(1, 1, (s) => theme.bg("userMessageBg", s));
  const toolCalls = details.steps.filter((s) => s.type === "call").length;
  const statusText = isPartial ? "Running..." : "Complete";

  headerBox.addChild(
    new Text(
      theme.fg("accent", theme.bold("SUB-AGENT TRANSCRIPT")) +
        theme.fg("muted", ` [${toolCalls} tool calls, ${statusText}]`),
      0,
      0
    )
  );

  if (!expanded) {
    headerBox.addChild(new Text(theme.fg("muted", `  (${keyHint("expandTools", "to expand")})`), 0, 0));
  }

  container.addChild(headerBox);
  container.addChild(new Spacer(1));

  const steps = details.steps;
  const toolCallResultMap = new Map<number, SubAgentStep>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step?.type === "call") {
      const nextStep = steps[i + 1];
      if (nextStep?.type === "result" && nextStep.toolName === step.toolName) {
        toolCallResultMap.set(i, nextStep);
      }
    }
  }

  const processedResultIndices = new Set<number>();
  for (const [callIdx] of toolCallResultMap) {
    processedResultIndices.add(callIdx + 1);
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;
    if (processedResultIndices.has(i)) continue;

    switch (step.type) {
      case "thinking":
        renderThinkingStep(step, theme, expanded, container);
        break;
      case "text":
        renderTextStep(step, theme, expanded, container);
        break;
      case "call": {
        const resultStep = toolCallResultMap.get(i);
        container.addChild(renderToolWithResult(step, resultStep, theme, expanded));
        container.addChild(new Spacer(1));
        break;
      }
      case "result":
        break;
    }
  }

  const footerBox = new Box(0, 0, (s) => s);
  footerBox.addChild(new DynamicBorder((s) => theme.fg("borderMuted", s)));
  container.addChild(footerBox);

  return container;
}
