import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Tool } from "@mariozechner/pi-ai";
import { codingTools, readOnlyTools } from "@mariozechner/pi-coding-agent";
import { writeReportTool } from "../tools/write-report.tool.js";
import * as fs from "node:fs";
import * as path from 'node:path'
import { readReportTool } from "../tools/read-report.tool.js";
import { fileURLToPath } from "node:url";

export enum SubAgentRole {
  Researcher = "researcher",
  Planner = "planner",
  Developer = "developer",
  Validator = "validator",
}

type SubAgentConfig = {
  tools: Tool[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUB_AGENTS_MAP: Record<SubAgentRole, SubAgentConfig> = {
  [SubAgentRole.Researcher]: {
    tools: [...readOnlyTools, writeReportTool, readReportTool],
  },
  [SubAgentRole.Planner]: {
    tools: [...readOnlyTools, writeReportTool, readReportTool],
  },
  [SubAgentRole.Developer]: {
    tools: [...codingTools, writeReportTool, readReportTool],
  },
  [SubAgentRole.Validator]: {
    tools: [...readOnlyTools, writeReportTool, readReportTool],
  },
};

export function getSubAgentTools(role: SubAgentRole): AgentTool[] {
  return SUB_AGENTS_MAP[role].tools as AgentTool[];
}

export async function getSubAgentSystemPrompt(role: SubAgentRole): Promise<string> {
  const prompt = fs.readFileSync(path.join(__dirname, "../prompts/" + role + ".md"), {
    encoding: "utf8",
  });
  return prompt;
}
