import type { Tool } from "@mariozechner/pi-ai";
import type { SubAgentConfig } from "./main-agent.js";
import { writeReportTool } from "./tools/write-report.tool.js";
import { readReportTool } from "./tools/read-report.tool.js";
import { createRestrictedTools } from "./tools/restricted-tools.js";

// Name of file in ./prompts/
export const MAIN_AGENT = "director";
export const MAIN_AGENT_TOOLS: Tool[] = [readReportTool];

// Names of files in ./prompts/
export enum SubAgentRole {
  Researcher = "researcher",
  Planner = "planner",
  Developer = "developer",
  Validator = "validator",
}

const { read, ls, find, grep, write, edit, bash } = createRestrictedTools(
  process.cwd()
);

const readonlyTools = [read, ls, find, grep];
const codingTools = [...readonlyTools, write, edit, bash];

export const SUB_AGENTS_MAP: Record<SubAgentRole, SubAgentConfig> = {
  [SubAgentRole.Researcher]: {
    tools: [...readonlyTools, writeReportTool, readReportTool],
  },
  [SubAgentRole.Planner]: {
    tools: [...readonlyTools, writeReportTool, readReportTool],
  },
  [SubAgentRole.Developer]: {
    tools: [...codingTools, writeReportTool, readReportTool],
  },
  [SubAgentRole.Validator]: {
    tools: [...readonlyTools, writeReportTool, readReportTool],
  },
};
