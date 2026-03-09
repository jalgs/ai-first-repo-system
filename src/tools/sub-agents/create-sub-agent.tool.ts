import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { SubAgent, type SubAgentTranscript } from "./sub-agent.js";
import { renderTranscript } from "./sub-agent-renderer/index.js";
import {
  cacheTranscript,
  clearCachedTranscript,
  getCachedTranscriptForArgs,
  getGlobalExpanded,
  getMostRecentCachedTranscript,
  registerSubAgentCall,
  setGlobalExpanded,
} from "./sub-agent-ui-state.js";
import { SessionRegistryManager, type SessionRegistry } from "./session-registry.js";
import type { SubAgentConfig } from "../../main-agent.js";

export function createSubAgentTool<SubAgentRole extends string>(
  subAgentsMap: Record<SubAgentRole, SubAgentConfig>
) {
  const SubAgentRoleSchema = StringEnum(
    Object.keys(subAgentsMap) as Array<keyof typeof subAgentsMap>,
    {
      description: "Role of the sub-agent to invoke.",
    }
  );

  const SubAgentParams = Type.Object({
    role: SubAgentRoleSchema,
    name: Type.Optional(Type.String({
      description:
        "A descriptive name for creating a new sub-agent instance (e.g. 'Researcher-auth-module').",
    })),
    prompt: Type.String({ description: "The message to send to the sub-agent. Include the mode (task or conversational), the objective, any reports to read, and the exact report filename to produce if in task mode." }),
    id: Type.Optional(Type.String({
      description: "Session ID of an existing sub-agent to reactivate. When provided, the sub-agent resumes with its prior context. Obtain the ID from listSubAgentSessions. Omit to create a new session.",
    })),
  });

  type SubAgentParams = Static<typeof SubAgentParams>;

  const subAgentTool: ToolDefinition<
    typeof SubAgentParams,
    SubAgentTranscript
  > = {
    name: "subAgent",
    label: "Sub-Agent",
    description: `Invokes a sub-agent by role. Use this for task delegation (the sub-agent works and writes a report) or conversational queries (the sub-agent replies directly without producing a report). Make the expected mode explicit in the prompt.`,
    parameters: SubAgentParams,

    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      registerSubAgentCall(toolCallId, params);
      let session: SessionRegistry | undefined = undefined;
      if (params.id) {
        const sessions = SessionRegistryManager.list();
        session = sessions.find((s) => s.sessionId === params.id);
        if (!session) throw new Error(`Session with id ${params.id} not found`)
      } else if(!params.name) throw new Error(`Agent name is mandatory for creating a new agent session (no id provided)`)

      const subAgent = new SubAgent({
        name: session?.name ?? params.name as string,
        role: params.role,
        tools: subAgentsMap[params.role].tools,
        ctx,
        sessionDir: session?.sessionFile,
      });

      await subAgent.init();

      if (signal) {
        signal.onabort = () => {
          subAgent.abort();
        };
      }

      try {
        const result = await subAgent.run(params.prompt, onUpdate, {
          toolCallId,
          onTranscript: cacheTranscript,
          onToolsExpandedChange: setGlobalExpanded,
        });

        clearCachedTranscript(toolCallId);

        return {
          content: result.content,
          details: result.transcript,
        };
      } catch (error) {
        clearCachedTranscript(toolCallId);
        throw error;
      }
    },

    renderCall: (args, theme) => {
      const container = new Container();

      container.addChild(
        new Text(
          theme.fg(
            "accent",
            `↳ Delegating to Sub-Agent [${theme.bold(args.role || "unknown")}]\n\n${args.name} - ${args.id ? "Resumed" : "New"}\n\n${args.prompt}\n\n`
          ),
          0,
          0
        )
      );

      const transcript = getCachedTranscriptForArgs(args);
      if (transcript?.steps.length) {
        container.addChild(
          renderTranscript(transcript, theme, getGlobalExpanded(), true)
        );
      }

      return container;
    },

    renderResult: (result, options, theme) => {
      setGlobalExpanded(options.expanded);

      if (options.isPartial) {
        return undefined;
      }

      const details =
        (result.details as SubAgentTranscript | undefined) ??
        getMostRecentCachedTranscript();

      if (!details?.steps.length) {
        const container = new Container();
        container.addChild(
          new Text(theme.fg("muted", "  Sub-agent in progress..."), 0, 0)
        );
        return container;
      }

      return renderTranscript(details, theme, options.expanded, false);
    },
  };

  return subAgentTool;
}
