import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Container, Text } from "@mariozechner/pi-tui";
import { SessionRegistryManager } from "../sub-agents/session-registry.js";

const WriteReportParams = Type.Object({
  fileName: Type.String({
    description:
      "Report file name only (e.g. researcher-report.md). Do not provide directories.",
  }),
  content: Type.String({
    description: "Full markdown content of the report.",
  }),
});

type WriteReportParams = Static<typeof WriteReportParams>;

export const writeReportTool: ToolDefinition<
  typeof WriteReportParams,
  { success: boolean; path: string; mode: "created" }
> = {
  name: "writeReport",
  label: "Write Report",
  description:
    "Creates a NEW report file in the current session reports directory. Fails if the file already exists (no overwrite).",
  parameters: WriteReportParams,

  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const sessionId = SessionRegistryManager.current()
    const reportsDir = path.join(process.cwd(), "sessions", sessionId, "reports");

    const safeFileName = path.basename(params.fileName);
    const filePath = path.join(reportsDir, safeFileName);

    await fs.mkdir(reportsDir, { recursive: true });

    try {
      await fs.writeFile(filePath, params.content, { encoding: "utf8", flag: "wx" });
    } catch (error: any) {
      if (error?.code === "EEXIST") {
        throw new Error(
          `Report already exists: ${safeFileName}. writeReport does not overwrite existing files.`
        );
      }
      throw error;
    }

    return {
      content: [{ type: "text", text: `Successfully created report at ${filePath}` }],
      details: { success: true, path: filePath, mode: "created" },
    };
  },

  renderCall: (args, theme) => {
    const container = new Container();
    container.addChild(new Text(theme.fg("accent", `✍️ Writing report: ${args.fileName}`), 0, 0));
    return container;
  },

  renderResult: (result, options, theme) => {
    if (options.isPartial || !result) return undefined;
    const container = new Container();
    container.addChild(
      new Text(theme.fg("success", `✓ Report created at ${result.details.path}`), 0, 0)
    );
    return container;
  },
};
