#!/usr/bin/env node
import { MAIN_AGENT, MAIN_AGENT_TOOLS, SUB_AGENTS_MAP } from "./config.js";
import { createMainAgent } from "./main-agent.js";

await createMainAgent(MAIN_AGENT, MAIN_AGENT_TOOLS, SUB_AGENTS_MAP);
