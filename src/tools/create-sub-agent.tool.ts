import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { SubAgent, type SubAgentRole, type SubAgentTranscript } from "../sub-agent.js";
import { renderTranscript } from "./sub-agent-renderer/index.js";

// Global cache to preserve transcript state during UI rebuilds (e.g., Ctrl+T)
// This is needed because the framework clears pendingTools after rebuilding the chat,
// causing partial results to be lost when toggle thinking is pressed during execution.
interface CachedState {
  transcript: SubAgentTranscript;
  expanded: boolean;
}
const stateCache = new Map<string, CachedState>();

// Global expanded state for when we don't have a toolCallId
let globalExpanded = false;

export function cacheTranscript(toolCallId: string, transcript: SubAgentTranscript): void {
  const existing = stateCache.get(toolCallId);
  stateCache.set(toolCallId, { 
    transcript, 
    expanded: existing?.expanded ?? false 
  });
}

export function getCachedTranscript(toolCallId: string): SubAgentTranscript | undefined {
  return stateCache.get(toolCallId)?.transcript;
}

export function clearCachedTranscript(toolCallId: string): void {
  stateCache.delete(toolCallId);
}

export function setGlobalExpanded(expanded: boolean): void {
  globalExpanded = expanded;
  // Also update all cached states
  for (const [key, state] of stateCache) {
    stateCache.set(key, { ...state, expanded });
  }
}

export function getGlobalExpanded(): boolean {
  return globalExpanded;
}

const SubAgentParams = Type.Object({
  role: Type.String({ description: "Specialization: 'researcher' | 'tester' | 'reviewer' | 'coder'" }),
  systemPrompt: Type.Optional(Type.String({ description: "Custom system prompt for the sub-agent" })),
  prompt: Type.String({ description: "The task to send to the sub-agent" }),
});

type SubAgentParams = Static<typeof SubAgentParams>;

export const subAgentTool: ToolDefinition<typeof SubAgentParams, SubAgentTranscript> = {
  name: "createSubAgent",
  label: "Sub-Agent",
  description: `Spawns a specialized sub-agent to handle a focused task.
    Returns the final response from the sub-agent.`,
  parameters: SubAgentParams,

  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const { role, systemPrompt, prompt } = params;

    const subAgent = new SubAgent({
      role: role as SubAgentRole,
      systemPrompt,
      cwd: ctx.cwd,
    });

    await subAgent.init();

    if (signal) {
      signal.onabort = () => {
        subAgent.abort();
      };
    }

    try {
      const result = await subAgent.run(prompt, ctx, onUpdate, toolCallId);
      // Clear cache after successful completion (result is now in session)
      clearCachedTranscript(toolCallId);
      return {
        content: result.content,
        details: result.transcript,
      };
    } catch (err) {
      clearCachedTranscript(toolCallId);
      throw err;
    }
  },

  renderCall: (args, theme) => {
    const container = new Container();
    container.addChild(
      new Text(
        theme.fg("accent", `↳ Delegating to Sub-Agent [${theme.bold(args.role || "unknown")}]\n\n`),
        0,
        0
      )
    );
    
    // If there's cached transcript data (from an in-progress execution after Ctrl+T),
    // render it here since renderResult won't be called without a result
    for (const cached of stateCache.values()) {
      if (cached.transcript.steps && cached.transcript.steps.length > 0) {
        // Use the cached expanded state
        const transcriptContainer = renderTranscript(cached.transcript, theme, cached.expanded, true);
        container.addChild(transcriptContainer);
        break;
      }
    }
    
    return container;
  },

  renderResult: (result, options, theme) => {
    let details = result.details as SubAgentTranscript | undefined;
    const expanded = options.expanded;
    const isPartial = options.isPartial;

    // Update the global expanded state so renderCall can use it
    setGlobalExpanded(expanded);

    // If details is missing but we have cached data, use it
    // This handles the case where Ctrl+T is pressed during execution
    if ((!details || !details.steps || details.steps.length === 0)) {
      // Try to find cached transcript by checking all cached entries
      // Since we don't have toolCallId here, we use the most recent cache entry
      // that has steps (this is a workaround for the framework limitation)
      for (const cached of stateCache.values()) {
        if (cached.transcript.steps && cached.transcript.steps.length > 0) {
          details = cached.transcript;
          break;
        }
      }
    }

    // Handle case where details is still missing or empty
    if (!details || !details.steps || details.steps.length === 0) {
      const container = new Container();
      container.addChild(new Text(
        theme.fg("muted", `  Sub-agent in progress...`),
        0, 0
      ));
      return container;
    }

    // Render the full transcript
    return renderTranscript(details, theme, expanded, isPartial);
  },
};
