import { Box, Text } from "@mariozechner/pi-tui";
import {
  highlightCode,
  getLanguageFromPath,
  type Theme,
  type ThemeColor,
} from "@mariozechner/pi-coding-agent";
import { shortenPath, replaceTabs, renderOutputLines } from "./utils.js";
import type { SubAgentResultStep } from "../../sub-agent.js";

type ToolRenderContext = {
  args: Record<string, unknown>;
  resultStep: SubAgentResultStep | undefined;
  theme: Theme;
  expanded: boolean;
  toolBox: Box;
  statusIcon: string;
  statusColor: ThemeColor;
};

function getTextContentFromResult(
  resultStep: SubAgentResultStep | undefined
): string | undefined {
  if (!resultStep?.result?.content || !Array.isArray(resultStep.result.content))
    return undefined;
  for (const block of resultStep.result.content) {
    if (block.type === "text" && block.text) return block.text;
  }
  return undefined;
}

function renderReadTool(ctx: ToolRenderContext): void {
  const rawPath = (ctx.args.file_path ?? ctx.args.path ?? "") as string;
  const path = shortenPath(rawPath);
  const offset = ctx.args.offset as number | undefined;
  const limit = ctx.args.limit as number | undefined;

  let pathDisplay = path
    ? ctx.theme.fg("accent" as ThemeColor, path)
    : ctx.theme.fg("toolOutput" as ThemeColor, "...");
  if (offset !== undefined || limit !== undefined) {
    const startLine = offset ?? 1;
    const endLine = limit !== undefined ? startLine + limit - 1 : "";
    pathDisplay += ctx.theme.fg(
      "warning" as ThemeColor,
      `:${startLine}${endLine ? `-${endLine}` : ""}`
    );
  }

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("read"))} ${pathDisplay}`,
      0,
      0
    )
  );

  // Always show output when available - truncate when collapsed
  if (ctx.resultStep?.result) {
    const text = getTextContentFromResult(ctx.resultStep);
    if (text) {
      const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
      const allLines = lang
        ? highlightCode(replaceTabs(text), lang)
        : text.split("\n");
      const maxLines = ctx.expanded ? allLines.length : 10;
      const lines = allLines.slice(0, maxLines);
      renderOutputLines(lines, ctx.theme, ctx.toolBox, {
        useThemeColor: !lang,
      });
      if (!ctx.expanded && allLines.length > maxLines) {
        ctx.toolBox.addChild(
          new Text(
            ctx.theme.fg(
              "muted" as ThemeColor,
              `... (${allLines.length - maxLines} more lines)`
            ),
            0,
            0
          )
        );
      }
    }
  }
}

function renderWriteTool(ctx: ToolRenderContext): void {
  const rawPath = (ctx.args.file_path ?? ctx.args.path ?? "") as string;
  const path = shortenPath(rawPath);
  const content = (ctx.args.content ?? "") as string;

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("write"))} ${path ? ctx.theme.fg("accent" as ThemeColor, path) : ctx.theme.fg("toolOutput" as ThemeColor, "...")}`,
      0,
      0
    )
  );

  // Always show content - truncate when collapsed
  if (content) {
    const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
    const allLines = lang
      ? highlightCode(replaceTabs(content), lang)
      : content.split("\n");
    const maxLines = ctx.expanded ? allLines.length : 10;
    const lines = allLines.slice(0, maxLines);
    renderOutputLines(lines, ctx.theme, ctx.toolBox, { useThemeColor: !lang });
    if (!ctx.expanded && allLines.length > maxLines) {
      ctx.toolBox.addChild(
        new Text(
          ctx.theme.fg(
            "muted" as ThemeColor,
            `... (${allLines.length - maxLines} more lines)`
          ),
          0,
          0
        )
      );
    }
  }
}

function renderEditTool(ctx: ToolRenderContext): void {
  const rawPath = (ctx.args.file_path ?? ctx.args.path ?? "") as string;
  const path = shortenPath(rawPath);

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("edit"))} ${path ? ctx.theme.fg("accent" as ThemeColor, path) : ctx.theme.fg("toolOutput" as ThemeColor, "...")}`,
      0,
      0
    )
  );

  // Always show edit info - more detail when expanded
  if (ctx.args.oldText && ctx.args.newText) {
    const maxLen = ctx.expanded ? 100 : 50;
    ctx.toolBox.addChild(
      new Text(
        ctx.theme.fg(
          "muted" as ThemeColor,
          `  Old: "${String(ctx.args.oldText).slice(0, maxLen)}${String(ctx.args.oldText).length > maxLen ? "..." : ""}"`
        ),
        0,
        0
      )
    );
    ctx.toolBox.addChild(
      new Text(
        ctx.theme.fg(
          "muted" as ThemeColor,
          `  New: "${String(ctx.args.newText).slice(0, maxLen)}${String(ctx.args.newText).length > maxLen ? "..." : ""}"`
        ),
        0,
        0
      )
    );
  }
}

function renderBashTool(ctx: ToolRenderContext): void {
  const command = (ctx.args.command ?? "") as string;
  const timeout = ctx.args.timeout as number | undefined;
  const timeoutSuffix = timeout
    ? ctx.theme.fg("muted" as ThemeColor, ` (timeout ${timeout}s)`)
    : "";

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold(`$ ${command}`))}${timeoutSuffix}`,
      0,
      0
    )
  );

  // Always show output - truncate when collapsed
  const text = getTextContentFromResult(ctx.resultStep);
  if (text?.trim()) {
    const allLines = text.trim().split("\n");
    const maxLines = ctx.expanded ? allLines.length : 10;
    const lines = allLines.slice(0, maxLines);
    renderOutputLines(lines, ctx.theme, ctx.toolBox, { useThemeColor: true });
    if (!ctx.expanded && allLines.length > maxLines) {
      ctx.toolBox.addChild(
        new Text(
          ctx.theme.fg(
            "muted" as ThemeColor,
            `... (${allLines.length - maxLines} more lines)`
          ),
          0,
          0
        )
      );
    }
  }
}

function renderGrepTool(ctx: ToolRenderContext): void {
  const pattern = (ctx.args.pattern ?? "") as string;
  const rawPath = (ctx.args.path ?? ".") as string;
  const path = shortenPath(rawPath);

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("grep"))} ${ctx.theme.fg("accent" as ThemeColor, `/${pattern}/`)} ${ctx.theme.fg("toolOutput" as ThemeColor, `in ${path}`)}`,
      0,
      0
    )
  );

  // Always show output - truncate when collapsed
  const grepText = getTextContentFromResult(ctx.resultStep);
  if (grepText?.trim()) {
    const allLines = grepText.trim().split("\n");
    const maxLines = ctx.expanded ? allLines.length : 10;
    const lines = allLines.slice(0, maxLines);
    renderOutputLines(lines, ctx.theme, ctx.toolBox, { useThemeColor: true });
    if (!ctx.expanded && allLines.length > maxLines) {
      ctx.toolBox.addChild(
        new Text(
          ctx.theme.fg(
            "muted" as ThemeColor,
            `... (${allLines.length - maxLines} more lines)`
          ),
          0,
          0
        )
      );
    }
  }
}

function renderFindTool(ctx: ToolRenderContext): void {
  const pattern = (ctx.args.pattern ?? "") as string;
  const rawPath = (ctx.args.path ?? ".") as string;
  const path = shortenPath(rawPath);

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("find"))} ${ctx.theme.fg("accent" as ThemeColor, pattern)} ${ctx.theme.fg("toolOutput" as ThemeColor, `in ${path}`)}`,
      0,
      0
    )
  );

  // Always show output - truncate when collapsed
  const findText = getTextContentFromResult(ctx.resultStep);
  if (findText?.trim()) {
    const allLines = findText.trim().split("\n");
    const maxLines = ctx.expanded ? allLines.length : 10;
    const lines = allLines.slice(0, maxLines);
    renderOutputLines(lines, ctx.theme, ctx.toolBox, { useThemeColor: true });
    if (!ctx.expanded && allLines.length > maxLines) {
      ctx.toolBox.addChild(
        new Text(
          ctx.theme.fg(
            "muted" as ThemeColor,
            `... (${allLines.length - maxLines} more lines)`
          ),
          0,
          0
        )
      );
    }
  }
}

function renderLsTool(ctx: ToolRenderContext): void {
  const rawPath = (ctx.args.path ?? ".") as string;
  const path = shortenPath(rawPath);

  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("ls"))} ${ctx.theme.fg("accent" as ThemeColor, path)}`,
      0,
      0
    )
  );

  // Always show output - truncate when collapsed
  const lsText = getTextContentFromResult(ctx.resultStep);
  if (lsText?.trim()) {
    const allLines = lsText.trim().split("\n");
    const maxLines = ctx.expanded ? allLines.length : 10;
    const lines = allLines.slice(0, maxLines);
    renderOutputLines(lines, ctx.theme, ctx.toolBox, { useThemeColor: true });
    if (!ctx.expanded && allLines.length > maxLines) {
      ctx.toolBox.addChild(
        new Text(
          ctx.theme.fg(
            "muted" as ThemeColor,
            `... (${allLines.length - maxLines} more lines)`
          ),
          0,
          0
        )
      );
    }
  }
}

function renderReadReportTool(ctx: ToolRenderContext): void {
  const rawFileName = (ctx.args.fileName ?? "") as string;

  // Call phase - matches readReport.visual format exactly
  if (!rawFileName) {
    // Listing mode
    ctx.toolBox.addChild(
      new Text(ctx.theme.fg("accent", "📖 Listing reports"), 0, 0)
    );

    // Show files listed if result available
    const text = getTextContentFromResult(ctx.resultStep);
    if (text?.trim()) {
      ctx.toolBox.addChild(
        new Text(ctx.theme.fg("success", text.trim()), 0, 0)
      );

      // Render the file list with truncation to 25 lines for listing view
      const allLines = text.trim().split("\n");
      const maxLines = ctx.expanded ? allLines.length : 25;
      const lines = allLines.slice(0, maxLines);
      renderOutputLines(lines, ctx.theme, ctx.toolBox, { useThemeColor: true });

      if (!ctx.expanded && allLines.length > maxLines) {
        ctx.toolBox.addChild(
          new Text(
            ctx.theme.fg(
              "muted",
              `... (${allLines.length - maxLines} more lines)`
            ),
            0,
            0
          )
        );
      }
    }
  } else if (ctx.resultStep?.result) {
    // Reading specific file mode
    ctx.toolBox.addChild(
      new Text(
        ctx.theme.fg(
          "accent",
          `📖 Reading report: ${shortenPath(rawFileName)}`
        ),
        0,
        0
      )
    );

    const result = ctx.resultStep.result;

    // Check if content was read (should have text block in content)
    let fileContent: string | undefined;
    if (result.content && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block.type === "text" && block.text) {
          fileContent = block.text;
          break;
        }
      }
    } else if (
      result.content?.length === 1 &&
      typeof result.content[0] === "object"
    ) {
      const single = result.content[0];
      if (single.type === "text") {
        fileContent = single.text;
      }
    }

    if (fileContent) {
      // Successfully read file - show success message like readReport
      ctx.toolBox.addChild(
        new Text(
          ctx.theme.fg(
            "success",
            `✓ Read report (${fileContent.length} chars)`
          ),
          0,
          0
        )
      );

      // Show content with markdown/syntax highlighting
      const lang = getLanguageFromPath(rawFileName);
      const allLines = lang
        ? highlightCode(replaceTabs(fileContent), lang)
        : fileContent.split("\n");

      // Truncate to 25 lines for files (more generous than tools)
      const maxLines = ctx.expanded ? allLines.length : 25;
      const linesToShow = allLines.slice(0, maxLines);
      renderOutputLines(linesToShow, ctx.theme, ctx.toolBox, {
        useThemeColor: !lang,
      });

      if (!ctx.expanded && allLines.length > maxLines) {
        ctx.toolBox.addChild(
          new Text(
            ctx.theme.fg(
              "muted",
              `... (${allLines.length - maxLines} more lines)`
            ),
            0,
            0
          )
        );
      }
    }
  } else {
    // Filename shown on call, result comes later
    ctx.toolBox.addChild(
      new Text(ctx.theme.fg("toolOutput", shortenPath(rawFileName)), 0, 0)
    );
  }
}

function renderWriteReportTool(ctx: ToolRenderContext): void {
  const fileName = (ctx.args.fileName ?? "") as string;

  // Call phase - matches writeReport.visual format exactly
  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold("writeReport"))} ${ctx.theme.fg("accent" as ThemeColor, `✍️ Writing report: ${shortenPath(fileName)}`)}`,
      0,
      0
    )
  );

  // Render result phase - only renders if result exists
  if (!ctx.resultStep?.result || !ctx.resultStep.result.content) {
    return;
  }

  const result = ctx.resultStep.result.content[0];

  // Check for success/error message in text content
  let resultText: string | undefined;
  if (Array.isArray(result.content)) {
    const textBlock = result.content.find(
      (b: { type?: string; text?: string }) => b.type === "text"
    );
    resultText = textBlock?.text ?? "";
  } else if (result.content && typeof result.content[0] === "object") {
    const block = result.content[0];
    resultText = block.type === "text" ? block.text : undefined;
  }

  // Handle error messages separately - rendered by renderToolError above
  // For success: check if we have the created path in details

  // Show success message with path from result.details if available
  const successDetails = result.details?.path ?? "";
  if (successDetails) {
    ctx.toolBox.addChild(
      new Text(
        ctx.theme.fg("success", `✓ Report created at ${successDetails}`),
        0,
        0
      )
    );

    // Render the written content (the report markdown itself)
    let displayContent = "";

    // Try to extract content from result if present in text field or details
    if (
      resultText &&
      !resultText.includes("created") &&
      !resultText.includes("Error")
    ) {
      displayContent = resultText;
    } else if (successDetails) {
      // If we only have success message, don't show additional content by default
      // User can use readReport to view the created content
      return;
    }

    // Only render detailed content if explicitly present in text field
    if (displayContent) {
      const lang = fileName ? getLanguageFromPath(fileName) : undefined;
      const allLines = lang
        ? highlightCode(replaceTabs(displayContent), lang)
        : displayContent.split("\n");

      // Truncate to 30 lines for write output (more than standard tools)
      const maxLines = ctx.expanded ? allLines.length : 30;
      const linesToShow = allLines.slice(0, maxLines);
      renderOutputLines(linesToShow, ctx.theme, ctx.toolBox, {
        useThemeColor: !lang,
      });

      if (!ctx.expanded && allLines.length > maxLines) {
        ctx.toolBox.addChild(
          new Text(
            ctx.theme.fg(
              "muted",
              `... (${allLines.length - maxLines} more lines)`
            ),
            0,
            0
          )
        );
      }
    }
  }
}

function renderUnknownTool(ctx: ToolRenderContext): void {
  const toolName = (ctx.args as { toolName?: string }).toolName ?? "unknown";
  ctx.toolBox.addChild(
    new Text(
      `${ctx.theme.fg(ctx.statusColor, ctx.statusIcon)} ${ctx.theme.fg("toolTitle" as ThemeColor, ctx.theme.bold(toolName))}`,
      0,
      0
    )
  );
  // Always show args preview - more when expanded
  const argsStr = JSON.stringify(ctx.args, null, 2);
  const allLines = argsStr.split("\n");
  const maxLines = ctx.expanded ? allLines.length : 5;
  const lines = allLines.slice(0, maxLines);
  for (const line of lines) {
    ctx.toolBox.addChild(
      new Text(ctx.theme.fg("muted" as ThemeColor, line), 0, 0)
    );
  }
  if (!ctx.expanded && allLines.length > maxLines) {
    ctx.toolBox.addChild(
      new Text(
        ctx.theme.fg(
          "muted" as ThemeColor,
          `... (${allLines.length - maxLines} more lines)`
        ),
        0,
        0
      )
    );
  }
}

const toolRenderers: Record<string, (ctx: ToolRenderContext) => void> = {
  read: renderReadTool,
  write: renderWriteTool,
  edit: renderEditTool,
  bash: renderBashTool,
  grep: renderGrepTool,
  find: renderFindTool,
  ls: renderLsTool,
  readReport: renderReadReportTool,
  writeReport: renderWriteReportTool,
};

export function renderToolContent(
  toolName: string,
  args: Record<string, unknown>,
  resultStep: SubAgentResultStep | undefined,
  theme: Theme,
  expanded: boolean,
  toolBox: Box,
  statusIcon: string,
  statusColor: ThemeColor
): void {
  const ctx: ToolRenderContext = {
    args,
    resultStep,
    theme,
    expanded,
    toolBox,
    statusIcon,
    statusColor,
  };

  const renderer = toolRenderers[toolName];
  if (renderer) {
    renderer(ctx);
  } else {
    renderUnknownTool({ ...ctx, args: { ...ctx.args, toolName } });
  }

  if (resultStep?.isError) {
    renderToolError(resultStep, theme, toolBox);
  }
}

export function renderToolError(
  resultStep: SubAgentResultStep | undefined,
  theme: Theme,
  toolBox: Box
): void {
  if (!resultStep?.result?.content || !Array.isArray(resultStep.result.content))
    return;
  for (const block of resultStep.result.content) {
    if (block.type === "text" && block.text) {
      toolBox.addChild(
        new Text(
          theme.fg(
            "error" as ThemeColor,
            `  Error: ${block.text.slice(0, 150)}`
          ),
          0,
          0
        )
      );
    }
  }
}
