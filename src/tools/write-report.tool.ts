import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Container, Text } from "@mariozechner/pi-tui";
import { SessionRegistryManager } from "./sub-agents/session-registry.js";
import { Logger } from "../utils/logger.js";

const WriteReportParams = Type.Object({
  fileName: Type.String({
    description:
      "File name for the report (e.g. developer-report-v2.md). Base name only, no paths. Use the exact name specified by the Director.",
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
    "Writes a new report file to the session reports directory. Fails if a file with that name already exists — do not retry with the same filename expecting overwrite.",
  parameters: WriteReportParams,

  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    Logger.log(`[WRITE REPORT] ${params.fileName}`);
    const sessionId = SessionRegistryManager.current();
    const reportsDir = path.join(
      process.cwd(),
      ".sessions",
      sessionId,
      "reports"
    );

    const safeFileName = path.basename(params.fileName);
    const filePath = path.join(reportsDir, safeFileName);

    await fs.mkdir(reportsDir, { recursive: true });

    try {
      await fs.writeFile(filePath, params.content, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error: any) {
      if (error?.code === "EEXIST") {
        Logger.log(
          `Report already exists: ${safeFileName}. writeReport does not overwrite existing files.`
        );
        throw new Error(
          `Report already exists: ${safeFileName}. writeReport does not overwrite existing files.`
        );
      }
      throw error;
    }

    return {
      content: [
        { type: "text", text: `Successfully created report at ${filePath}` },
      ],
      details: { success: true, path: filePath, mode: "created" },
    };
  },

  renderCall: (args, theme) => {
    const container = new Container();
    container.addChild(
      new Text(theme.fg("accent", `✍️ Writing report: ${args.fileName}`), 0, 0)
    );
    return container;
  },

  renderResult: (result, options, theme) => {
    if (options.isPartial || !result) return undefined;
    const container = new Container();
    container.addChild(
      new Text(
        theme.fg("success", `✓ Report created at ${result.details.path}`),
        0,
        0
      )
    );
    return container;
  },
};
