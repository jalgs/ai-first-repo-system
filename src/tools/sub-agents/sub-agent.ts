import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSessionEvent,
  type AgentToolUpdateCallback,
  type ExtensionAPI,
  type ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Subject, filter, map, type Observable } from "rxjs";
import { SessionRegistryManager } from "./session-registry.js";
import { Logger } from "../../utils/logger.js";
import type { Tool } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export interface SubAgentCallStep {
  type: "call";
  toolCallId: string;
  toolName: string;
  args: any;
}

export interface SubAgentResultStep {
  type: "result";
  toolCallId: string;
  toolName: string;
  result: any;
  isError: boolean;
}

export interface SubAgentThinkingStep {
  type: "thinking";
  content: string;
}

export interface SubAgentTextStep {
  type: "text";
  content: string;
}

export type SubAgentStep =
  | SubAgentCallStep
  | SubAgentResultStep
  | SubAgentThinkingStep
  | SubAgentTextStep;

export interface SubAgentTranscript {
  steps: SubAgentStep[];
}

export interface SubAgentConfig<SubAgentRole extends string> {
  name: string;
  role: SubAgentRole;
  tools: Tool[];
  ctx?: ExtensionContext;
  sessionDir?: string | undefined;
}

export interface SubAgentRunOptions {
  toolCallId: string;
  onTranscript?: (toolCallId: string, transcript: SubAgentTranscript) => void;
  onToolsExpandedChange?: (expanded: boolean) => void;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SubAgent<SubAgentRole extends string> {
  private session!: AgentSession;
  private readonly eventListener = new Subject<AgentSessionEvent>();
  private readonly name: string;
  private readonly role: SubAgentRole;
  private readonly tools: AgentTool[];
  private readonly cwd: string;
  private readonly ctx?: ExtensionContext;
  private sessionDir?: string | undefined;

  constructor(config: SubAgentConfig<SubAgentRole>) {
    this.name = config.name;
    this.role = config.role;
    this.tools = config.tools as AgentTool[];
    if (config.ctx) this.ctx = config.ctx;
    this.cwd = config.ctx?.cwd ?? process.cwd();
    this.sessionDir = config.sessionDir;
  }

  public async init(): Promise<void> {
    const systemPrompt = await this.getSystemPrompt(this.role);

    const resourceLoader = new DefaultResourceLoader({
      cwd: this.cwd,
      systemPromptOverride: () => systemPrompt,
      extensionFactories: [this.subAgentExtension.bind(this)],
    });

    await resourceLoader.reload();

    const sessionManager = this.sessionDir
      ? SessionManager.continueRecent(this.cwd, this.sessionDir)
      : SessionManager.create(this.cwd);

    const { session } = await createAgentSession({
      cwd: this.cwd,
      sessionManager,
      resourceLoader,
      tools: [],
      ...(this.ctx?.model ? { model: this.ctx.model } : {}),
    });

    this.session = session;

    SessionRegistryManager.register({
      sessionId: this.session.sessionManager.getSessionId(),
      sessionFile: this.session.sessionManager.getSessionFile() as string,
      name: this.name,
      role: this.role,
    });

    this.session.subscribe((event) => {
      this.eventListener.next(event);
    });
  }

  private getSystemPrompt(role: SubAgentRole): string {
    const prompt = fs.readFileSync(
      path.join(__dirname, "../../prompts/" + role + ".md"),
      {
        encoding: "utf8",
      }
    );
    return prompt;
  }

  private subAgentExtension(pi: ExtensionAPI) {
    let isCompacting = false;
    for (const tool of this.tools) {
      pi.registerTool(tool);
      pi.on("turn_end", (_, ctx) => {
        if (isCompacting) return;
        const contextUsage = ctx.getContextUsage();
        if (!contextUsage) return;
        const { percent } = contextUsage;
        Logger.log({ percent });
        if (percent && percent >= ((process.env.COMPACT_PERCENTAGE_LIMIT as unknown as number) ?? 80)) {
          Logger.log("compacting");
          isCompacting = true;
          if (this.ctx?.hasUI)
            this.ctx?.ui.setWidget("subagent", ["Compacting Context..."]);
          ctx.compact({
            //customInstructions: '',
            onComplete: () => {
              isCompacting = false;
              if (this.ctx?.hasUI)
                this.ctx?.ui.setWidget("subagent", [
                  "Context Compacted. Resuming Session...",
                ]);
            },
            onError: (err) => {
              isCompacting = false;
              this.ctx?.ui.setWidget("subagent", [
                `Compaction Error: ${err.message}`,
              ]);
            },
          });
        }
      });
    }
  }

  public listen<T extends AgentSessionEvent["type"]>(
    type: T
  ): Observable<AgentSessionEvent & { type: T }> {
    return this.eventListener.pipe(
      filter((event) => event.type === type),
      map((event) => event as AgentSessionEvent & { type: T })
    );
  }

  public async run(
    prompt: string,
    onUpdate?: AgentToolUpdateCallback<SubAgentTranscript>,
    options?: SubAgentRunOptions
  ): Promise<{ content: any[]; transcript: SubAgentTranscript }> {
    if (!this.session) {
      throw new Error("SubAgent not initialized. Call init() first.");
    }

    const transcript: SubAgentTranscript = { steps: [] };
    let currentAssistantText = "";

    const updateUI = (status: string, widgetLines?: string[]) => {
      if (!this.ctx?.hasUI) return;

      const contextUsage = this.ctx?.getContextUsage();
      const contextUsageSummary = this.ctx.ui.theme.fg(
        "muted",
        `| ${contextUsage?.percent?.toFixed(2) ?? 0}%/${Math.round((contextUsage?.contextWindow ?? 0) / 1000)}k`
      );

      const accent = this.ctx.ui.theme.fg(
        "accent",
        `● [Sub-Agent: ${this.role}] ${status} ${contextUsageSummary}`
      );
      this.ctx.ui.setStatus("subagent", accent);

      if (widgetLines) {
        this.ctx.ui.setWidget("subagent", widgetLines);
      }
    };

    const notifyUpdate = () => {
      if (this.ctx?.hasUI) {
        options?.onToolsExpandedChange?.(this.ctx.ui.getToolsExpanded());
      }

      if (options?.toolCallId && options.onTranscript) {
        options.onTranscript(options.toolCallId, {
          steps: [...transcript.steps],
        });
      }

      onUpdate?.({
        content: [{ type: "text", text: currentAssistantText }],
        details: { steps: [...transcript.steps] },
      });
    };

    return await new Promise((resolve, reject) => {
      let settled = false;

      const unsubscribe = this.session.subscribe((event) => {
        switch (event.type) {
          case "agent_start":
            updateUI("Starting...", [
              `Role: ${this.role}`,
              "Status: Starting...",
            ]);
            break;

          case "message_update":
            if (event.assistantMessageEvent.type === "text_delta") {
              updateUI("Thinking...", [
                `Role: ${this.role}`,
                "Status: Working...",
              ]);
              currentAssistantText += event.assistantMessageEvent.delta;

              const last = transcript.steps[transcript.steps.length - 1];
              if (last?.type === "text") {
                last.content = currentAssistantText;
              } else {
                transcript.steps.push({
                  type: "text",
                  content: currentAssistantText,
                });
              }

              notifyUpdate();
            } else if (event.assistantMessageEvent.type === "thinking_delta") {
              updateUI("Thinking...", [
                `Role: ${this.role}`,
                "Status: Thinking...",
              ]);

              const last = transcript.steps[transcript.steps.length - 1];
              if (last?.type === "thinking") {
                last.content += event.assistantMessageEvent.delta;
              } else {
                transcript.steps.push({
                  type: "thinking",
                  content: event.assistantMessageEvent.delta,
                });
              }

              notifyUpdate();
            }
            break;

          case "tool_execution_start":
            updateUI(`Executing ${event.toolName}...`, [
              `Role: ${this.role}`,
              `Status: Executing ${event.toolName}...`,
            ]);

            transcript.steps.push({
              type: "call",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
            });
            notifyUpdate();
            break;

          case "tool_execution_end":
            updateUI("Working...", [
              `Role: ${this.role}`,
              "Status: Working...",
            ]);

            transcript.steps.push({
              type: "result",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              result: event.result,
              isError: event.isError,
            });
            notifyUpdate();
            break;

          case "turn_end":
            break;
          case "agent_end": {
            if (settled) return;
            settled = true;

            unsubscribe();
            if (this.ctx?.hasUI) {
              this.ctx.ui.setStatus("subagent", undefined);
              this.ctx.ui.setWidget("subagent", undefined);
            }

            const finalContent = currentAssistantText
              ? [{ type: "text" as const, text: currentAssistantText }]
              : [
                  {
                    type: "text" as const,
                    text: "No content returned from sub-agent.",
                  },
                ];

            resolve({ content: finalContent, transcript });
            break;
          }
        }
      });

      this.session.prompt(prompt).catch((error) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (this.ctx?.hasUI) {
          this.ctx.ui.setStatus("subagent", undefined);
          this.ctx.ui.setWidget("subagent", undefined);
        }
        reject(error);
      });
    });
  }

  public abort(): void {
    this.session?.abort();
  }
}
