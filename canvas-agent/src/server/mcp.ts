import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { bindingToolDescriptions, bindingToolInputSchemas, toolDescriptions, toolInputSchemas, toolNames } from "../canvas/schemas.js";
import { AGENT_PROMPT, loadConfig, type CanvasAgentConfig, VERSION } from "../config.js";

type CanvasAgentToolResponse = { ok?: boolean; result?: unknown; error?: string };

/** 启动标准输入输出 MCP；每个进程有独立目标，禁止依赖浏览器焦点。 */
export async function startMcpServer() {
    const config = loadConfig(true);
    const bindingId = crypto.randomUUID();
    const server = new McpServer({ name: "oioi-canvas", version: VERSION }, { instructions: AGENT_PROMPT });
    const schemas = { ...bindingToolInputSchemas, ...toolInputSchemas };
    const descriptions = { ...bindingToolDescriptions, ...toolDescriptions };
    const names = [...Object.keys(bindingToolInputSchemas), ...toolNames] as Array<keyof typeof schemas>;
    names.forEach((name) => {
        const schema = schemas[name];
        server.registerTool(name, { description: descriptions[name], inputSchema: schema.shape }, async (input: unknown) => {
            const result = await postCanvasAgentTool(config, bindingId, name, schema.parse(input));
            return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        });
    });
    server.server.onclose = () => {
        void postCanvasAgentTool(config, bindingId, "canvas_release_client", {}).catch(() => undefined);
    };
    await server.connect(new StdioServerTransport());
}

/** 将 MCP 工具及其进程身份转发到本机 HTTP bridge。 */
async function postCanvasAgentTool(config: CanvasAgentConfig, bindingId: string, name: string, input: unknown) {
    const res = await fetch(`${config.url}/api/tools`, { method: "POST", headers: { "content-type": "application/json", "x-canvas-agent-token": config.token }, body: JSON.stringify({ bindingId, name, input }) });
    const body = (await res.json()) as CanvasAgentToolResponse;
    if (!body.ok) throw new Error(body.error || "tool call failed");
    return body.result;
}
