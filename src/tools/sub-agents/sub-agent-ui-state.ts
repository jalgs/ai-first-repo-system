import type { SubAgentTranscript } from "./sub-agent.js";

export interface SubAgentCallIdentity {
  role: string;
  prompt: string;
  systemPrompt?: string;
}

interface CachedState {
  toolCallId: string;
  argsSignature: string;
  transcript: SubAgentTranscript;
  expanded: boolean;
  updatedAt: number;
}

const stateCache = new Map<string, CachedState>();
const callIdsByArgsSignature = new Map<string, string[]>();

let globalExpanded = false;

function createArgsSignature(args: SubAgentCallIdentity): string {
  return JSON.stringify({
    role: args.role,
    prompt: args.prompt,
    systemPrompt: args.systemPrompt ?? "",
  });
}

export function registerSubAgentCall(
  toolCallId: string,
  args: SubAgentCallIdentity
): void {
  const argsSignature = createArgsSignature(args);

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
    updatedAt: Date.now(),
  });
}

export function cacheTranscript(
  toolCallId: string,
  transcript: SubAgentTranscript
): void {
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

export function getGlobalExpanded(): boolean {
  return globalExpanded;
}

export function getMostRecentCachedTranscript():
  | SubAgentTranscript
  | undefined {
  let latest: CachedState | undefined;
  for (const state of stateCache.values()) {
    if (!latest || state.updatedAt > latest.updatedAt) {
      latest = state;
    }
  }
  return latest?.transcript;
}

export function getCachedTranscriptForArgs(
  args: SubAgentCallIdentity
): SubAgentTranscript | undefined {
  const signature = createArgsSignature(args);
  const callIds = callIdsByArgsSignature.get(signature);
  if (!callIds || callIds.length === 0) return undefined;

  for (let i = callIds.length - 1; i >= 0; i--) {
    const callId = callIds[i];
    if (!callId) continue;
    const state = stateCache.get(callId);
    if (state) {
      return state.transcript;
    }
  }

  return undefined;
}
