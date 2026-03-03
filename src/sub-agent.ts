import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  type AgentSessionEvent,
  type ExtensionContext,
  type AgentToolUpdateCallback,
  readTool,
  bashTool,
  writeTool,
  grepTool,
  findTool,
  lsTool,
  editTool
} from "@mariozechner/pi-coding-agent";
import { Subject, filter, map, type Observable } from "rxjs";
import { cacheTranscript, setGlobalExpanded } from "./tools/create-sub-agent.tool.js";

export type SubAgentRole = 'researcher' | 'tester' | 'reviewer' | 'coder';

export interface SubAgentStep {
  type: 'thinking' | 'call' | 'result' | 'text';
  content?: string;
  toolName?: string;
  args?: any;
  result?: any;
  isError?: boolean;
}

export interface SubAgentTranscript {
  steps: SubAgentStep[];
}

export interface SubAgentConfig {
  role: SubAgentRole;
  cwd?: string;
  systemPrompt?: string | undefined;
}

export class SubAgent {
  private session!: AgentSession;
  private readonly eventListener = new Subject<AgentSessionEvent>();
  private readonly role: SubAgentRole;
  private readonly cwd: string;
  private readonly customSystemPrompt: string | undefined;

  constructor(config: SubAgentConfig) {
    this.role = config.role;
    this.cwd = config.cwd ?? process.cwd();
    this.customSystemPrompt = config.systemPrompt;
  }

  public async init() {
    const tools = this.getToolsForRole();
    
    const resourceLoader = new DefaultResourceLoader({
      cwd: this.cwd,
      ...(this.customSystemPrompt ? { systemPrompt: this.customSystemPrompt } : {}),
    });

    const { session } = await createAgentSession({
      cwd: this.cwd,
      sessionManager: SessionManager.inMemory(),
      resourceLoader,
      tools,
    });

    this.session = session;
    this.session.subscribe((event) => {
      this.eventListener.next(event);
    });
  }

  private getToolsForRole(): any[] {
    const roleTools: Record<SubAgentRole, any[]> = {
      researcher: [readTool, grepTool, findTool, lsTool, bashTool],
      tester: [readTool, writeTool, bashTool, lsTool],
      reviewer: [readTool, grepTool, lsTool],
      coder: [readTool, writeTool, editTool, bashTool, lsTool],
    };

    return roleTools[this.role] || [readTool, lsTool];
  }

  public listen<T extends AgentSessionEvent["type"]>(
    type: T,
  ): Observable<AgentSessionEvent & { type: T }> {
    return this.eventListener.pipe(
      filter((event) => event.type === type),
      map((event) => event as AgentSessionEvent & { type: T }),
    );
  }

  public async run(
    prompt: string, 
    ctx?: ExtensionContext, 
    onUpdate?: AgentToolUpdateCallback<SubAgentTranscript>,
    toolCallId?: string
  ): Promise<{ content: any[], transcript: SubAgentTranscript }> {
    if (!this.session) {
      throw new Error("SubAgent not initialized. Call init() first.");
    }

    const transcript: SubAgentTranscript = { steps: [] };
    let currentAssistantText = '';
    const theme = ctx?.ui?.theme;

    const updateUI = (status: string, widgetLines?: string[]) => {
      if (ctx?.ui) {
        ctx.ui.setStatus('subagent', theme ? theme.fg('accent', `● [Sub-Agent: ${this.role}] ${status}`) : `[Sub-Agent: ${this.role}] ${status}`);
        if (widgetLines) {
           ctx.ui.setWidget('subagent', widgetLines);
        }
      }
    };

    const notifyUpdate = () => {
        if (ctx?.hasUI) {
            setGlobalExpanded(ctx.ui.getToolsExpanded());
        }
        if (toolCallId) {
            cacheTranscript(toolCallId, { steps: [...transcript.steps] });
        }
        if (onUpdate) {
            onUpdate({
                content: [{ type: 'text', text: currentAssistantText }],
                details: { steps: [...transcript.steps] }
            });
        }
    }

    return new Promise((resolve, reject) => {
      this.session.prompt(prompt).catch(reject);

      const sub = this.session.subscribe((event) => {
        switch (event.type) {
          case "agent_start":
            updateUI('Starting...', [`Role: ${this.role}`, 'Status: Starting...']);
            break;
          case "message_update":
            if (event.assistantMessageEvent.type === 'text_delta') {
              updateUI('Thinking...', [`Role: ${this.role}`, 'Status: Working...']);
              currentAssistantText += event.assistantMessageEvent.delta;
              let lastStep = transcript.steps[transcript.steps.length - 1];
              if (lastStep?.type === 'text') {
                  lastStep.content = currentAssistantText;
              } else {
                  transcript.steps.push({ type: 'text', content: currentAssistantText });
              }
              notifyUpdate();
            } else if (event.assistantMessageEvent.type === 'thinking_delta') {
              updateUI('Thinking...', [`Role: ${this.role}`, 'Status: Thinking...']);
               let lastStep = transcript.steps[transcript.steps.length - 1];
               if (lastStep?.type === 'thinking') {
                   lastStep.content = (lastStep.content || '') + event.assistantMessageEvent.delta;
               } else {
                   transcript.steps.push({ type: 'thinking', content: event.assistantMessageEvent.delta });
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
                type: 'call', 
                toolName: event.toolName, 
                args: event.args 
            });
            notifyUpdate();
            break;
          case "tool_execution_end":
            updateUI('Working...', [`Role: ${this.role}`, 'Status: Working...']);
            transcript.steps.push({ 
                type: 'result', 
                toolName: event.toolName, 
                result: event.result,
                isError: event.isError
            });
            notifyUpdate();
            break;
        }

        if (event.type === "agent_end") {
          sub();
          if (ctx?.ui) {
            ctx.ui.setStatus('subagent', undefined);
            ctx.ui.setWidget('subagent', undefined);
          }

          const lastAssistantMessage = (event as any).messages
            ?.filter((m: any) => m.role === "assistant")
            ?.pop();
          
          let finalContent: any[] = [];
          if (lastAssistantMessage && Array.isArray(lastAssistantMessage.content)) {
             finalContent = lastAssistantMessage.content.filter((c: any) => c.type === 'text' || c.type === 'image');
          } else {
             finalContent = [{ type: 'text', text: currentAssistantText || "No content returned from sub-agent." }];
          }
          
          resolve({ content: finalContent, transcript });
        }
      });
    });
  }

  public getSession(): AgentSession {
    return this.session;
  }

  public abort() {
    this.session?.abort();
  }
}
