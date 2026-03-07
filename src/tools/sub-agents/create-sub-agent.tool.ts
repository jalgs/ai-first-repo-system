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
import { SessionRegistryManager } from "./session-registry.js";
import type { SubAgentConfig } from "../../main-agent.js";

export function createSubAgentTool<SubAgentRole extends string>(
  subAgentsMap: Record<SubAgentRole, SubAgentConfig>
) {
  const SubAgentRoleSchema = StringEnum(
    Object.keys(subAgentsMap) as Array<keyof typeof subAgentsMap>,
    {
      description: "Specialization of the sub-agent",
    }
  );

  const SubAgentParams = Type.Object({
    role: SubAgentRoleSchema,
    name: Type.String({
      description:
        "The sub-agent name. It will be stored in asociation with the generated sessionId",
    }),
    prompt: Type.String({ description: "The task to send to the sub-agent" }),
    id: Type.String({
      description: "When provided it resume a previous existing sub-agent",
    }),
  });

  type SubAgentParams = Static<typeof SubAgentParams>;

  const subAgentTool: ToolDefinition<
    typeof SubAgentParams,
    SubAgentTranscript
  > = {
    name: "subAgent",
    label: "Sub-Agent",
    description: `Spawns a specialized sub-agent to handle a focused task.
    Returns the final response from the sub-agent.`,
    parameters: SubAgentParams,

    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      registerSubAgentCall(toolCallId, params);
      let sessionDir: string | undefined = undefined;
      if (params.id) {
        const sessions = SessionRegistryManager.list();
        const found = sessions.find((s) => s.sessionId === params.id);
        if (found) sessionDir = found.sessionFile;
      }

      const subAgent = new SubAgent({
        name: params.name,
        role: params.role,
        tools: subAgentsMap[params.role].tools,
        ctx,
        sessionDir,
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
