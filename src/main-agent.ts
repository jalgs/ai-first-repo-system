import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  InteractiveMode,
  SessionManager,
  type AgentSessionEvent,
  type ExtensionAPI,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import { filter, map, Observable, Subject } from "rxjs";
import { subAgentTool } from "./tools/create-sub-agent.tool.js";
import { readReportTool } from "./tools/read-report.tool.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Logger } from "./utils/logger.js";
import { SessionRegistryManager } from "./sub-agents/session-registry.js";
import { listSubAgentSessions } from "./tools/list-sub-agents-sessions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, "prompts/director.md"),
  {
    encoding: "utf8",
  }
);

class MainAgent {
  private session!: AgentSession;
  private readonly eventListener = new Subject<AgentSessionEvent>();

  public async initSession() {
    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      systemPromptOverride: (base) => `${base}\n\n${SYSTEM_PROMPT}`,
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

  private registerSession() {
    SessionRegistryManager.setCurrent(
      this.session.sessionManager.getSessionId()
    );
  }

  private subAgentExtension(pi: ExtensionAPI) {
    pi.registerTool(subAgentTool);
    pi.registerTool(readReportTool);
    pi.registerTool(listSubAgentSessions);

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

export async function createMainAgent(): Promise<MainAgent> {
  const mainAgent = new MainAgent();
  await mainAgent.initSession();
  return mainAgent;
}
