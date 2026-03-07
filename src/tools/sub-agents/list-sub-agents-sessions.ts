import { Type, type Static } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  SessionRegistryManager,
  type SessionRegistry,
} from "./session-registry.js";
import { Logger } from "../../utils/logger.js";
import { Container, Text } from "@mariozechner/pi-tui";

const ListSubAgentSessions = Type.Object({});

type ListSubAgentSessions = Static<typeof ListSubAgentSessions>;

export const listSubAgentSessions: ToolDefinition<
  typeof ListSubAgentSessions,
  SessionRegistry[]
> = {
  name: "listSubAgentSessions",
  label: "List Sub Agent Sessions",
  description:
    "Use this tool to obtain existing sub agentes sessionId for reactivating ir with createSubAgent tool",
  parameters: ListSubAgentSessions,
  execute: async () => {
    const subAgentsSessions = SessionRegistryManager.list();
    Logger.log({ subAgentsSessions });
    return {
      content: [
        {
          type: "text",
          text: `Sub Agents Sessions List: ${JSON.stringify(subAgentsSessions)}`,
        },
      ],
      details: subAgentsSessions,
    };
  },
  renderCall: (_, theme) => {
    const container = new Container();

    container.addChild(
      new Text(theme.fg("accent", `📃​ Listing Sub Agents`), 0, 0)
    );

    return container;
  },
  renderResult: (result, options, theme) => {
    if (options.isPartial) {
      return undefined;
    }

    const container = new Container();
    container.addChild(
      new Text(
        theme.fg(
          "accent",
          result.details.length
            ? result.details.map((sa) => `${sa.name}: ${sa.role}`).join("\n")
            : "No Sub Agents found"
        ),
        0,
        0
      )
    );
    return container;
  },
};
