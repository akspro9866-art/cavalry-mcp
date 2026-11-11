/**
 * Strict 3-Tool Core Registrar (`src/tools/index.ts`).
 * Exposes inspect, execute, presets tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerInspectTool } from "./inspect.js";
import { registerExecuteTool } from "./execute.js";
import { registerPresetsTool } from "./presets.js";

export { registerInspectTool } from "./inspect.js";
export { registerExecuteTool } from "./execute.js";
export { registerPresetsTool } from "./presets.js";

/**
 * Registers the strict 3-tool core surface on the given MCP server.
 */
export function registerCoreTools(server: McpServer): void {
  registerInspectTool(server);
  registerExecuteTool(server);
  registerPresetsTool(server);
}
