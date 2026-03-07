import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  InteractiveMode,
  type AgentSessionEvent,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { filter, map, Observable, Subject } from "rxjs";
import { createSubAgentTool } from "./tools/sub-agents/create-sub-agent.tool.js";
import { readReportTool } from "./tools/read-report.tool.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "./utils/logger.js";
import { SessionRegistryManager } from "./tools/sub-agents/session-registry.js";
import { listSubAgentSessions } from "./tools/sub-agents/list-sub-agents-sessions.js";
import type { Tool } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type SubAgentConfig = {
  tools: Tool[];
};

class MainAgent<SubAgentRole extends string> {
  private session!: AgentSession;
  private readonly eventListener = new Subject<AgentSessionEvent>();

  constructor(
    private readonly name: string,
    private readonly tools: Tool[],
    private readonly subagentsMap: Record<SubAgentRole, SubAgentConfig>
  ) {}

  public async initSession() {
    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      systemPromptOverride: () => this.getSystemPrompt(),
      extensionFactories: [this.subAgentExtension.bind(this)],
    });

    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      resourceLoader,
      tools: [],
    });

    this.session = session;

    this.session.subscribe((event) => {
      // ...
    });

    const interactiveMode = new InteractiveMode(this.session);
    await interactiveMode.run();
  }

  private getSystemPrompt() {
    return fs.readFileSync(path.join(__dirname, `prompts/${this.name}.md`), {
      encoding: "utf8",
    });
  }

  private registerSession() {
    SessionRegistryManager.setCurrent(
      this.session.sessionManager.getSessionId()
    );
  }

  private subAgentExtension(pi: ExtensionAPI) {
    pi.registerTool(listSubAgentSessions);
    pi.registerTool(createSubAgentTool(this.subagentsMap));

    for (const tool of this.tools) {
      pi.registerTool(tool as AgentTool);
    }

    pi.on("session_switch", (_, ctx) => {
      this.registerSession();

      Logger.log({
        sessionId: ctx.sessionManager.getSessionId(),
        sessionDir: ctx.sessionManager.getSessionDir(),
        sessionFile: ctx.sessionManager.getSessionFile(),
      });
    });

    pi.on("session_start", (_, ctx) => {
      this.registerSession();

      Logger.log({
        sessionId: ctx.sessionManager.getSessionId(),
        sessionDir: ctx.sessionManager.getSessionDir(),
        sessionFile: ctx.sessionManager.getSessionFile(),
      });
    });
  }

  public listen<T extends AgentSessionEvent["type"]>(
    type: T
  ): Observable<AgentSessionEvent & { type: T }> {
    return this.eventListener.pipe(
      filter((event) => event.type === type),
      map((event) => event as AgentSessionEvent & { type: T })
    );
  }

  public prompt(text: string) {
    return this.session.prompt(text);
  }
}

export async function createMainAgent<SubAgentRole extends string>(
  name: string,
  tools: Tool[],
  subagentsMap: Record<SubAgentRole, SubAgentConfig>
): Promise<MainAgent<SubAgentRole>> {
  const mainAgent = new MainAgent(name, tools, subagentsMap);
  await mainAgent.initSession();
  return mainAgent;
}
