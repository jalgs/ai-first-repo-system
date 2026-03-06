import { Type, type Static } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { SessionRegistryManager, type SessionRegistry } from "../sub-agents/session-registry.js";
import { Logger } from "../utiils/logger.js";

const ListSubAgentSessions = Type.Object({})

type ListSubAgentSessions = Static<typeof ListSubAgentSessions>

export const listSubAgentSessions: ToolDefinition<
typeof ListSubAgentSessions,
SessionRegistry[]
> = {
    name: "listSubAgentSessions",
    label: "List Sub Agent Sessions",
    description: "",
    parameters: ListSubAgentSessions,
    execute: async () => {
        const subAgentsSessions = SessionRegistryManager.list()
        Logger.log({subAgentsSessions})
        return {
            content: [{ type: 'text', text: `Sub Agents Sessions List: ${JSON.stringify(subAgentsSessions)}` }],
            details: subAgentsSessions
        }
    }
}