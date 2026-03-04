import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Tool } from "@mariozechner/pi-ai";
import {
    writeTool,
    codingTools,
    readOnlyTools
} from "@mariozechner/pi-coding-agent";
import * as fs from 'node:fs'

export enum SubAgentRole {
    Researcher = 'researcher',
    Planner = 'planner',
    Developer = 'developer',
    Validator = 'validator'
}

type SubAgentConfig = {
    tools: Tool[]
}

const SUB_AGENTS_MAP: Record<SubAgentRole, SubAgentConfig> = {
    [SubAgentRole.Researcher]: {
        tools: readOnlyTools,
    },
    [SubAgentRole.Planner]: {
        tools: [...readOnlyTools, writeTool],
    },
    [SubAgentRole.Developer]: {
        tools: codingTools,
    },
    [SubAgentRole.Validator]: {
        tools: [...readOnlyTools, writeTool],
    }
}

export function getSubAgentTools(role: SubAgentRole): AgentTool[] {
    return SUB_AGENTS_MAP[role].tools as AgentTool[]
}

export async function getSubAgentSystemPrompt(role: SubAgentRole): Promise<string> {
    const prompt = fs.readFileSync('./src/prompts/' + role + '.md', {
        encoding: 'utf8'
    })
    return prompt
}