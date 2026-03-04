import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Container, Text } from "@mariozechner/pi-tui";

const WriteReportParams = Type.Object({
    fileName: Type.String({ description: "The name of the report file (e.g. researcher-report.md)" }),
    content: Type.String({ description: "The full markdown content of the report" }),
});

type WriteReportParams = Static<typeof WriteReportParams>;

export const writeReportTool: ToolDefinition<typeof WriteReportParams, { success: boolean, path: string }> = {
    name: "writeReport",
    label: "Write Report",
    description: "Writes a report to the session's reports directory. You must use this to save your final report before responding to the Director. Do NOT output your entire report to the Director in conversation.",
    parameters: WriteReportParams,

    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const sessionId = ctx.sessionManager.getSessionId();
        const reportsDir = path.join(process.cwd(), "sessions", sessionId, "reports");

        const safeFileName = path.basename(params.fileName);
        const filePath = path.join(reportsDir, safeFileName);

        await fs.mkdir(reportsDir, { recursive: true });
        await fs.writeFile(filePath, params.content, "utf8");

        return {
            content: [{ type: "text", text: `Successfully wrote report to ${filePath}` }],
            details: { success: true, path: filePath }
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
        container.addChild(new Text(theme.fg("success", `✓ Report saved to ${result.details.path}`), 0, 0));
        return container;
    }
};
