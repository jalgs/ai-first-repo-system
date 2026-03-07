import { StringEnum } from "@mariozechner/pi-ai";
import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { SubAgent, type SubAgentTranscript } from "../sub-agent.js";
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
import { SubAgentRole } from "../sub-agents/index.js";
import { Logger } from "../utils/logger.js";

const SubAgentRoleSchema = StringEnum(Object.values(SubAgentRole), {
  description: "Specialization of the sub-agent",
});

const SubAgentParams = Type.Object({
  role: SubAgentRoleSchema,
  prompt: Type.String({ description: "The task to send to the sub-agent" }),
  sessionId: Type.String({
    description: "When provided it resume a previous existing agent",
  }),
});

type SubAgentParams = Static<typeof SubAgentParams>;

export const subAgentTool: ToolDefinition<
  typeof SubAgentParams,
  SubAgentTranscript
> = {
  name: "createSubAgent",
  label: "Sub-Agent",
  description: `Spawns a specialized sub-agent to handle a focused task.
    Returns the final response from the sub-agent.`,
  parameters: SubAgentParams,

  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    registerSubAgentCall(toolCallId, params);

    const subAgent = new SubAgent({
      role: params.role,
      ctx,
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
          `↳ Delegating to Sub-Agent [${theme.bold(args.role || "unknown")}]\n\n`
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
