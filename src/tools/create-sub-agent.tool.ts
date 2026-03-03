import { Type, type Static } from "@sinclair/typebox";
import { type ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { SubAgent, type SubAgentRole, type SubAgentTranscript } from "../sub-agent.js";
import { renderTranscript } from "./sub-agent-renderer/index.js";

const SubAgentParams = Type.Object({
  role: Type.String({ description: "Specialization: 'researcher' | 'tester' | 'reviewer' | 'coder'" }),
  systemPrompt: Type.Optional(Type.String({ description: "Custom system prompt for the sub-agent" })),
  prompt: Type.String({ description: "The task to send to the sub-agent" }),
});

type SubAgentParams = Static<typeof SubAgentParams>;

interface CachedState {
  toolCallId: string;
  argsSignature: string;
  transcript: SubAgentTranscript;
  expanded: boolean;
  hideThinking: boolean;
  updatedAt: number;
}

const stateCache = new Map<string, CachedState>();
const callIdsByArgsSignature = new Map<string, string[]>();

let globalExpanded = false;
let globalHideThinking = false;

const CTRL_T = "\u0014";
const CTRL_O = "\u000f";

function createArgsSignature(args: Pick<SubAgentParams, "role" | "prompt" | "systemPrompt">): string {
  return JSON.stringify({
    role: args.role,
    prompt: args.prompt,
    systemPrompt: args.systemPrompt ?? "",
  });
}

function getMostRecentCachedState(): CachedState | undefined {
  let latest: CachedState | undefined;
  for (const state of stateCache.values()) {
    if (!latest || state.updatedAt > latest.updatedAt) {
      latest = state;
    }
  }
  return latest;
}

function getCachedStateForArgs(args: SubAgentParams): CachedState | undefined {
  const signature = createArgsSignature(args);
  const callIds = callIdsByArgsSignature.get(signature);
  if (!callIds || callIds.length === 0) return undefined;

  for (let i = callIds.length - 1; i >= 0; i--) {
    const callId = callIds[i];
    if (!callId) continue;
    const state = stateCache.get(callId);
    if (state) return state;
  }
  return undefined;
}

export function registerSubAgentCall(toolCallId: string, params: SubAgentParams): void {
  const argsSignature = createArgsSignature(params);

  const ids = callIdsByArgsSignature.get(argsSignature) ?? [];
  if (!ids.includes(toolCallId)) {
    ids.push(toolCallId);
    callIdsByArgsSignature.set(argsSignature, ids);
  }

  const existing = stateCache.get(toolCallId);
  stateCache.set(toolCallId, {
    toolCallId,
    argsSignature,
    transcript: existing?.transcript ?? { steps: [] },
    expanded: existing?.expanded ?? globalExpanded,
    hideThinking: existing?.hideThinking ?? globalHideThinking,
    updatedAt: Date.now(),
  });
}

export function cacheTranscript(toolCallId: string, transcript: SubAgentTranscript): void {
  const existing = stateCache.get(toolCallId);
  if (!existing) return;

  stateCache.set(toolCallId, {
    ...existing,
    transcript,
    updatedAt: Date.now(),
  });
}

export function clearCachedTranscript(toolCallId: string): void {
  const existing = stateCache.get(toolCallId);
  stateCache.delete(toolCallId);

  if (!existing) return;

  const ids = callIdsByArgsSignature.get(existing.argsSignature);
  if (!ids) return;

  const filtered = ids.filter((id) => id !== toolCallId);
  if (filtered.length === 0) {
    callIdsByArgsSignature.delete(existing.argsSignature);
  } else {
    callIdsByArgsSignature.set(existing.argsSignature, filtered);
  }
}

export function setGlobalExpanded(expanded: boolean): void {
  globalExpanded = expanded;
  for (const [key, state] of stateCache) {
    stateCache.set(key, { ...state, expanded });
  }
}

export function toggleGlobalHideThinking(): void {
  globalHideThinking = !globalHideThinking;
  for (const [key, state] of stateCache) {
    stateCache.set(key, { ...state, hideThinking: globalHideThinking });
  }
}

export function getGlobalHideThinking(): boolean {
  return globalHideThinking;
}

export function syncGlobalUiToggles(input: string): void {
  if (input === CTRL_T) {
    toggleGlobalHideThinking();
  } else if (input === CTRL_O) {
    setGlobalExpanded(!globalExpanded);
  }
}

export const subAgentTool: ToolDefinition<typeof SubAgentParams, SubAgentTranscript> = {
  name: "createSubAgent",
  label: "Sub-Agent",
  description: `Spawns a specialized sub-agent to handle a focused task.
    Returns the final response from the sub-agent.`,
  parameters: SubAgentParams,

  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const { role, systemPrompt, prompt } = params;
    registerSubAgentCall(toolCallId, params);

    const stopTerminalListener = ctx.hasUI
      ? ctx.ui.onTerminalInput((data) => {
          syncGlobalUiToggles(data);
          return undefined;
        })
      : undefined;

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
      clearCachedTranscript(toolCallId);
      return {
        content: result.content,
        details: result.transcript,
      };
    } catch (err) {
      clearCachedTranscript(toolCallId);
      throw err;
    } finally {
      stopTerminalListener?.();
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

    const cached = getCachedStateForArgs(args) ?? getMostRecentCachedState();
    if (cached?.transcript.steps?.length) {
      container.addChild(
        renderTranscript(cached.transcript, theme, cached.expanded, true, cached.hideThinking)
      );
    }

    return container;
  },

  renderResult: (result, options, theme) => {
    let details = result.details as SubAgentTranscript | undefined;

    setGlobalExpanded(options.expanded);

    if (!details?.steps?.length) {
      const fallback = getMostRecentCachedState();
      if (fallback?.transcript.steps?.length) {
        details = fallback.transcript;
      }
    }

    if (!details?.steps?.length) {
      const container = new Container();
      container.addChild(new Text(theme.fg("muted", "  Sub-agent in progress..."), 0, 0));
      return container;
    }

    return renderTranscript(details, theme, options.expanded, options.isPartial, getGlobalHideThinking());
  },
};
