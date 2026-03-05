import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  InteractiveMode,
  SessionManager,
  type AgentSessionEvent,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import { filter, map, Observable, Subject } from "rxjs";
import { subAgentTool } from "./tools/create-sub-agent.tool.js";
import { readReportTool } from "./tools/read-report.tool.js";
import *  as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'prompts/director.md'), {
  encoding: 'utf8'
})

const subAgentExtension: ExtensionFactory = (pi) => {
  pi.registerTool(subAgentTool);
  pi.registerTool(readReportTool);

  pi.on('session_switch', (_, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId()
    process.env['SESSION_ID'] = sessionId
  })
};

class MainAgent {
  private session!: AgentSession;
  private readonly eventListener = new Subject<AgentSessionEvent>();

  public async initSession() {

    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      systemPromptOverride: base => `${base}\n\n${SYSTEM_PROMPT}`,
      extensionFactories: [subAgentExtension],
    });

    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      resourceLoader,
      tools: []
    });

    this.session = session;

    const sessionId = this.session.sessionManager.getSessionId()
    process.env['SESSION_ID'] = sessionId

    this.session.subscribe((event) => {
      this.eventListener.next(event);
    });

    const interactiveMode = new InteractiveMode(this.session);
    await interactiveMode.run();
  }

  public listen<T extends AgentSessionEvent["type"]>(
    type: T,
  ): Observable<AgentSessionEvent & { type: T }> {
    return this.eventListener.pipe(
      filter((event) => event.type === type),
      map((event) => event as AgentSessionEvent & { type: T }),
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
