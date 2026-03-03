import {
  AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  InteractiveMode,
  type AgentSessionEvent,
  type ExtensionFactory,
} from "@mariozechner/pi-coding-agent";
import { filter, map, Observable, Subject } from "rxjs";
import { subAgentTool } from "./tools/create-sub-agent.tool.js";

const SYSTEM_PROMPT = `You are the Arch Director, an expert software architect and orchestrator.
Your primary goal is to solve complex tasks by delegating specialized work to sub-agents via the 'createSubAgent' tool.
You should analyze the user request, break it down, and use sub-agents for research, coding, testing, or reviewing when appropriate.

Available sub-agent roles:
- researcher: For exploring codebases, finding files, and gathering information
- coder: For writing and editing code
- tester: For running tests and validating changes
- reviewer: For code review and analysis`;

const subAgentExtension: ExtensionFactory = (pi) => {
  pi.registerTool(subAgentTool);
};

class MainAgent {
  private session!: AgentSession;
  private readonly eventListener = new Subject<AgentSessionEvent>();

  public async initSession() {
    const resourceLoader = new DefaultResourceLoader({
      cwd: process.cwd(),
      systemPrompt: SYSTEM_PROMPT,
      extensionFactories: [subAgentExtension],
    });

    await resourceLoader.reload();

    const { session } = await createAgentSession({
      cwd: process.cwd(),
      resourceLoader,
    });

    this.session = session;

    const currentTools = this.session.getActiveToolNames();
    if (!currentTools.includes(subAgentTool.name)) {
      this.session.setActiveToolsByName([...currentTools, subAgentTool.name]);
    }

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
