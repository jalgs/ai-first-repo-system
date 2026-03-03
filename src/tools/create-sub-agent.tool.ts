import { Type, type Static } from "@sinclair/typebox";
import { 
  type ToolDefinition, 
  DynamicBorder,
  getMarkdownTheme,
  highlightCode,
  getLanguageFromPath,
  keyHint
} from "@mariozechner/pi-coding-agent";
import { Container, Text, Box, Spacer, Markdown } from "@mariozechner/pi-tui";
import { SubAgent, type SubAgentRole, type SubAgentTranscript, type SubAgentStep } from "../sub-agent.js";
import * as os from "node:os";

const SubAgentParams = Type.Object({
  role: Type.String({ description: "Specialization: 'researcher' | 'tester' | 'reviewer' | 'coder'" }),
  systemPrompt: Type.Optional(Type.String({ description: "Custom system prompt for the sub-agent" })),
  prompt: Type.String({ description: "The task to send to the sub-agent" }),
});

type SubAgentParams = Static<typeof SubAgentParams>;

function shortenPath(path: string): string {
  if (typeof path !== "string") return "";
  const home = os.homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function replaceTabs(text: string): string {
  return text.replace(/\t/g, "   ");
}

function renderToolWithResult(
  callStep: SubAgentStep, 
  resultStep: SubAgentStep | undefined,
  theme: any, 
  expanded: boolean
): Container {
  const stepContainer = new Container();
  
  if (callStep.type !== 'call') return stepContainer;
  
  const toolName = callStep.toolName || 'unknown';
  const args = callStep.args || {};
  const hasResult = resultStep?.type === 'result';
  const isError = hasResult && resultStep?.isError;
  const isSuccess = hasResult && !isError;
  
  const bgFn = !hasResult 
    ? (text: string) => theme.bg('toolPendingBg', text)
    : isError 
      ? (text: string) => theme.bg('toolErrorBg', text)
      : (text: string) => theme.bg('toolSuccessBg', text);
  
  const toolBox = new Box(1, 1, bgFn);
  
  const statusIcon = !hasResult ? '◐' : isError ? '✗' : '✓';
  const statusColor = !hasResult ? 'muted' : isError ? 'error' : 'success';
  
  if (toolName === 'read') {
    const rawPath = args.file_path ?? args.path ?? '';
    const path = shortenPath(rawPath);
    const offset = args.offset;
    const limit = args.limit;
    
    let pathDisplay = path ? theme.fg('accent', path) : theme.fg('toolOutput', '...');
    if (offset !== undefined || limit !== undefined) {
      const startLine = offset ?? 1;
      const endLine = limit !== undefined ? startLine + limit - 1 : '';
      pathDisplay += theme.fg('warning', `:${startLine}${endLine ? `-${endLine}` : ''}`);
    }
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold('read'))} ${pathDisplay}`,
      0, 0
    ));
    
    if (expanded && isSuccess && resultStep?.result) {
      const result = resultStep.result;
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === 'text' && block.text) {
            const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
            const lines = lang ? highlightCode(replaceTabs(block.text), lang) : block.text.split('\n');
            
            toolBox.addChild(new Text('', 0, 0));
            for (const line of lines) {
              toolBox.addChild(new Text(lang ? line : theme.fg('toolOutput', replaceTabs(line)), 0, 0));
            }
          }
        }
      }
    }
  } else if (toolName === 'write') {
    const rawPath = args.file_path ?? args.path ?? '';
    const path = shortenPath(rawPath);
    const content = args.content || '';
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold('write'))} ${path ? theme.fg('accent', path) : theme.fg('toolOutput', '...')}`,
      0, 0
    ));
    
    if (content && expanded) {
      const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
      const lines = lang ? highlightCode(replaceTabs(content), lang) : content.split('\n');
      
      toolBox.addChild(new Text('', 0, 0));
      for (const line of lines) {
        toolBox.addChild(new Text(lang ? line : theme.fg('toolOutput', replaceTabs(line)), 0, 0));
      }
    }
  } else if (toolName === 'edit') {
    const rawPath = args.file_path ?? args.path ?? '';
    const path = shortenPath(rawPath);
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold('edit'))} ${path ? theme.fg('accent', path) : theme.fg('toolOutput', '...')}`,
      0, 0
    ));
    
    if (expanded && args.oldText && args.newText) {
      toolBox.addChild(new Text(theme.fg('muted', `  Old: "${(args.oldText as string).slice(0, 50)}..."`), 0, 0));
      toolBox.addChild(new Text(theme.fg('muted', `  New: "${(args.newText as string).slice(0, 50)}..."`), 0, 0));
    }
  } else if (toolName === 'bash') {
    const command = args.command || '';
    const timeout = args.timeout;
    const timeoutSuffix = timeout ? theme.fg('muted', ` (timeout ${timeout}s)`) : '';
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold(`$ ${command}`))}${timeoutSuffix}`,
      0, 0
    ));
    
    if (expanded && isSuccess && resultStep?.result) {
      const result = resultStep.result;
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === 'text' && block.text && block.text.trim()) {
            const lines = block.text.trim().split('\n');
            
            toolBox.addChild(new Text('', 0, 0));
            for (const line of lines) {
              toolBox.addChild(new Text(theme.fg('toolOutput', line), 0, 0));
            }
          }
        }
      }
    }
  } else if (toolName === 'grep') {
    const pattern = args.pattern || '';
    const rawPath = args.path || '.';
    const path = shortenPath(rawPath);
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold('grep'))} ${theme.fg('accent', `/${pattern}/`)} ${theme.fg('toolOutput', `in ${path}`)}`,
      0, 0
    ));
    
    if (expanded && isSuccess && resultStep?.result) {
      const result = resultStep.result;
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === 'text' && block.text && block.text.trim()) {
            const lines = block.text.trim().split('\n');
            
            toolBox.addChild(new Text('', 0, 0));
            for (const line of lines) {
              toolBox.addChild(new Text(theme.fg('toolOutput', line), 0, 0));
            }
          }
        }
      }
    }
  } else if (toolName === 'find') {
    const pattern = args.pattern || '';
    const rawPath = args.path || '.';
    const path = shortenPath(rawPath);
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold('find'))} ${theme.fg('accent', pattern)} ${theme.fg('toolOutput', `in ${path}`)}`,
      0, 0
    ));
    
    if (expanded && isSuccess && resultStep?.result) {
      const result = resultStep.result;
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === 'text' && block.text && block.text.trim()) {
            const lines = block.text.trim().split('\n');
            
            toolBox.addChild(new Text('', 0, 0));
            for (const line of lines) {
              toolBox.addChild(new Text(theme.fg('toolOutput', line), 0, 0));
            }
          }
        }
      }
    }
  } else if (toolName === 'ls') {
    const rawPath = args.path || '.';
    const path = shortenPath(rawPath);
    
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold('ls'))} ${theme.fg('accent', path)}`,
      0, 0
    ));
    
    if (expanded && isSuccess && resultStep?.result) {
      const result = resultStep.result;
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === 'text' && block.text && block.text.trim()) {
            const lines = block.text.trim().split('\n');
            
            toolBox.addChild(new Text('', 0, 0));
            for (const line of lines) {
              toolBox.addChild(new Text(theme.fg('toolOutput', line), 0, 0));
            }
          }
        }
      }
    }
  } else {
    toolBox.addChild(new Text(
      `${theme.fg(statusColor, statusIcon)} ${theme.fg('toolTitle', theme.bold(toolName))}`,
      0, 0
    ));
    if (expanded) {
      const argsStr = JSON.stringify(args, null, 2);
      const lines = argsStr.split('\n').slice(0, 5);
      for (const line of lines) {
        toolBox.addChild(new Text(theme.fg('muted', line), 0, 0));
      }
    }
  }
  
  if (isError && resultStep?.result) {
    const result = resultStep.result;
    if (result.content && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (block.type === 'text' && block.text) {
          toolBox.addChild(new Text(theme.fg('error', `  Error: ${block.text.slice(0, 150)}`), 0, 0));
        }
      }
    }
  }
  
  stepContainer.addChild(toolBox);
  return stepContainer;
}

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
        const result = await subAgent.run(prompt, ctx, onUpdate);
        return {
            content: result.content,
            details: result.transcript
        };
    } catch (err) {
        throw err;
    }
  },

  renderCall: (args, theme) => {
    const container = new Container();
    container.addChild(new Text(
      theme.fg('accent', `↳ Delegating to Sub-Agent [${theme.bold(args.role || 'unknown')}]\n\n`),
      0, 0
    ));
    return container;
  },

  renderResult: (result, options, theme) => {
    const details = result.details;
    const expanded = options.expanded;
    const isPartial = options.isPartial;
    const markdownTheme = getMarkdownTheme();
    
    if (!details || !details.steps || details.steps.length === 0) {
      return new Text(theme.fg('muted', '  Initializing sub-agent...'), 1, 0);
    }

    const container = new Container();
    
    const headerBox = new Box(1, 1, (s) => theme.bg('userMessageBg', s));
    const stepCount = details.steps.length;
    const toolCalls = details.steps.filter(s => s.type === 'call').length;
    const statusText = isPartial ? 'Running...' : 'Complete';
    
    headerBox.addChild(new Text(
      theme.fg('accent', theme.bold(`SUB-AGENT TRANSCRIPT`)) + 
      theme.fg('muted', ` [${toolCalls} tool calls, ${statusText}]`),
      0, 0
    ));
    
    if (!expanded) {
      headerBox.addChild(new Text(
        theme.fg('muted', `  (${keyHint('expandTools', 'to expand')})`),
        0, 0
      ));
    }
    
    container.addChild(headerBox);
    container.addChild(new Spacer(1));

    const hideThinking = !expanded;
    const steps = details.steps;
    
    const toolCallResultMap = new Map<number, SubAgentStep>();
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step?.type === 'call') {
        const nextStep = steps[i + 1];
        if (nextStep?.type === 'result' && nextStep.toolName === step.toolName) {
          toolCallResultMap.set(i, nextStep);
        }
      }
    }
    
    const processedResultIndices = new Set<number>();
    for (const [callIdx] of toolCallResultMap) {
      processedResultIndices.add(callIdx + 1);
    }
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step) continue;
      
      if (processedResultIndices.has(i)) continue;
      
      switch (step.type) {
        case 'thinking':
          if (step.content) {
            if (hideThinking) {
              container.addChild(new Text(
                theme.italic(theme.fg('thinkingText', 'Thinking...')),
                1, 0
              ));
            } else {
              const thinkingBox = new Box(1, 1, (s: string) => s);
              const thinkingLines = step.content.split('\n');
              const maxLines = expanded ? thinkingLines.length : 3;
              const displayLines = thinkingLines.slice(0, maxLines);
              
              for (const line of displayLines) {
                thinkingBox.addChild(new Text(
                  theme.italic(theme.fg('thinkingText', line)),
                  0, 0
                ));
              }
              
              if (thinkingLines.length > maxLines) {
                thinkingBox.addChild(new Text(
                  theme.fg('muted', `... (${thinkingLines.length - maxLines} more lines)`),
                  0, 0
                ));
              }
              
              container.addChild(thinkingBox);
            }
            container.addChild(new Spacer(1));
          }
          break;
          
        case 'text':
          if (step.content) {
            const trimmedContent = step.content.trim();
            if (trimmedContent) {
              if (expanded) {
                container.addChild(new Markdown(trimmedContent, 1, 0, markdownTheme));
              } else {
                const lines = trimmedContent.split('\n');
                const preview = lines[0] || '';
                const truncated = preview.length > 100 ? preview.slice(0, 100) + '...' : preview;
                container.addChild(new Text(theme.fg('text', truncated), 1, 0));
              }
              container.addChild(new Spacer(1));
            }
          }
          break;
          
        case 'call':
          const resultStep = toolCallResultMap.get(i);
          container.addChild(renderToolWithResult(step, resultStep, theme, expanded));
          container.addChild(new Spacer(1));
          break;
          
        case 'result':
          break;
      }
    }
    
    const footerBox = new Box(0, 0, (s) => s);
    footerBox.addChild(new DynamicBorder((s) => theme.fg('borderMuted', s)));
    container.addChild(footerBox);
    
    return container;
  }
};
