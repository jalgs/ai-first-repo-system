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
    "Returns the list of existing sub-agent sessions with their IDs, names, and roles. Use this to retrieve a session ID before reactivating an existing sub-agent.",
  parameters: ListSubAgentSessions,
  execute: async () => {
    const subAgentsSessions = SessionRegistryManager.list();
    Logger.log({ subAgentsSessions });
    return {
      content: [
        {
          type: "text",
          text: `Sub Agents Sessions List: ${JSON.stringify(subAgentsSessions.map((sa) => ({ name: sa.name, role: sa.role, id: sa.sessionId })))}`,
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
