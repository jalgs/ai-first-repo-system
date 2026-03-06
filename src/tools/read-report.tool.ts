import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Container, Text } from "@mariozechner/pi-tui";
import { SessionRegistryManager } from "../sub-agents/session-registry.js";

const ReadReportParams = Type.Object({
  fileName: Type.Optional(
    Type.String({
      description:
        "Name of report file to read (e.g. planner-report.md). If omitted, lists available report files.",
    })
  ),
});

type ReadReportParams = Static<typeof ReadReportParams>;

export const readReportTool: ToolDefinition<
  typeof ReadReportParams,
  { content?: string; files?: string[] }
> = {
  name: "readReport",
  label: "Read Report",
  description:
    "Reads report files from the current session reports directory. Use this to inspect outputs from other sub-agents. This tool does NOT create or write reports.",
  parameters: ReadReportParams,

  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const sessionId = SessionRegistryManager.current()
    const reportsDir = path.join(process.cwd(), "sessions", sessionId, "reports");

    if (params.fileName) {
      const safeFileName = path.basename(params.fileName);
      const filePath = path.join(reportsDir, safeFileName);
      try {
        const contentStr = await fs.readFile(filePath, "utf8");
        return {
          content: [{ type: "text", text: contentStr }],
          details: { content: contentStr },
        };
      } catch (err: any) {
        throw new Error(`Failed to read report ${safeFileName}: ${err.message}`);
      }
    }

    const files = await fs.readdir(reportsDir);
    return {
      content: [{ type: "text", text: `Found ${files.length} reports: ${files.join(", ")}` }],
      details: { files },
    };
  },

  renderCall: (args, theme) => {
    const container = new Container();
    if (args.fileName) {
      container.addChild(
        new Text(theme.fg("accent", `📖 Reading report: ${args.fileName}`), 0, 0)
      );
    } else {
      container.addChild(new Text(theme.fg("accent", "📖 Listing reports"), 0, 0));
    }
    return container;
  },

  renderResult: (result, options, theme) => {
    if (options.isPartial || !result) return undefined;
    const container = new Container();
    if (result.details.content) {
      container.addChild(
        new Text(
          theme.fg("success", `✓ Read report (${result.details.content.length} chars)`),
          0,
          0
        )
      );
    } else if (result.details.files) {
      container.addChild(
        new Text(theme.fg("success", `✓ Found ${result.details.files.length} reports`), 0, 0)
      );
    }
    return container;
  },
};
