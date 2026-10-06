import crypto from "node:crypto";
import type { ServerResponse } from "node:http";

import { logger } from "../utils/logger.js";
import { buildCanvasToolRequest } from "./operations.js";
import { bindingToolInputSchemas, type ToolName } from "./schemas.js";
import { compactCanvasState, compactNode, isToolName, parseToolInput } from "./tools.js";
import type { CanvasSnapshot } from "./types.js";

type ClientBinding = { clientId: string; projectId?: string };
type PendingRequest = ClientBinding & { resolve: (value: unknown) => void; reject: (error: Error) => void };
export const AGENT_PROTOCOL_VERSION = 7;

const SITE_TOOLS = new Set<ToolName>([
    "site_navigate",
    "canvas_list_projects",
    "workbench_image_get_config",
    "workbench_image_generate",
    "workbench_video_get_config",
    "workbench_video_generate",
    "prompts_search",
    "assets_list",
    "assets_add",
    "generation_get_status",
]);

/** 管理网页连接与每个 MCP 进程独立的目标绑定。 */
export class CanvasSession {
    private clients = new Map<string, ServerResponse>();
    private pending = new Map<string, PendingRequest>();
    private canvasStates = new Map<string, CanvasSnapshot>();
    private bindings = new Map<string, ClientBinding>();
    private activeClientId = "";

    /** 返回本机桥接服务当前连接状态。 */
    health() {
        return { ok: true, protocolVersion: AGENT_PROTOCOL_VERSION, hasCanvas: [...this.canvasStates.values()].some((state) => Boolean(state.projectId)), clients: this.clients.size };
    }

    /** 建立网页与本机桥接服务之间的 SSE 连接。 */
    openEvents(url: URL, res: ServerResponse) {
        const clientId = url.searchParams.get("clientId") || crypto.randomUUID();
        const previous = this.clients.get(clientId);
        logger.info("SSE client connected", { clientId });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        this.clients.set(clientId, res);
        this.canvasStates.delete(clientId);
        previous?.end();
        if (previous) this.rejectClientRequests(clientId, "网页连接已替换，请重新调用工具");
        if (!this.activeClientId) this.activeClientId = clientId;
        sendEvent(res, "hello", { ok: true, protocolVersion: AGENT_PROTOCOL_VERSION, clientId });
        const timer = setInterval(() => sendEvent(res, "ping", { time: Date.now() }), 15000);
        res.on("close", () => {
            clearInterval(timer);
            logger.info("SSE client disconnected", { clientId });
            if (this.clients.get(clientId) !== res) return;
            this.clients.delete(clientId);
            this.canvasStates.delete(clientId);
            this.rejectClientRequests(clientId, "绑定网页已断开，请重新连接原页面或明确绑定其他页面");
            // 保留绑定身份，断线不能静默切换到其他标签页。
            if (this.activeClientId === clientId) this.activeClientId = "";
        });
    }

    /** 保存精确客户端上报的页面和画布状态，不以焦点页兜底。 */
    updateState(body: unknown, clientId: string) {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        const state = { ...((body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>), clientId } as CanvasSnapshot;
        this.canvasStates.set(clientId, state);
        logger.debug("Canvas state updated", { clientId, projectId: state.projectId, nodes: state.nodes?.length || 0, connections: state.connections?.length || 0 });
    }

    /** 记录最近焦点，仅用于目标列表展示，不改变任何 MCP 绑定。 */
    activateClient(clientId: string) {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        this.activeClientId = clientId;
    }

    /** 列出已连接页面和当前 MCP 进程的固定目标。 */
    listClients(bindingId: string) {
        const clients = [...this.clients.keys()].map((clientId) => {
            const state = this.canvasStates.get(clientId);
            return { clientId, path: state?.path, pageTitle: state?.pageTitle, projectId: state?.projectId, title: state?.title, active: clientId === this.activeClientId };
        });
        return { clients, binding: this.bindings.get(bindingId) || null };
    }

    /** 明确绑定页面及此刻的画布，支持检查列表中选定的项目 ID。 */
    bindClient(bindingId: string, clientId: string, projectId?: string) {
        if (!this.clients.has(clientId)) throw new Error("当前网页未连接");
        const state = this.canvasStates.get(clientId);
        if (!state) throw new Error("当前网页尚未上报状态，请稍后重新列出页面");
        if (projectId !== undefined && state.projectId !== projectId) throw new Error("页面画布已改变，请重新列出并选择目标");
        const binding = { clientId, projectId: state.projectId };
        this.bindings.set(bindingId, binding);
        logger.debug("Canvas client bound", { bindingId, ...binding });
        return binding;
    }

    /** 解除指定 MCP 进程的目标绑定。 */
    releaseClient(bindingId: string) {
        this.bindings.delete(bindingId);
        return { released: true };
    }

    /** 接收网页返回的工具调用结果，其他标签页不能完成此请求。 */
    resolveResult(clientId: string, body: { requestId?: string; error?: string; result?: unknown }) {
        const item = body.requestId ? this.pending.get(body.requestId) : null;
        if (!item || !body.requestId || item.clientId !== clientId) return false;
        this.pending.delete(body.requestId);
        logger.debug("Canvas tool result received", { clientId, requestId: body.requestId, error: body.error, result: body.result });
        const snapshot = body.result as CanvasSnapshot | null;
        if (!body.error && item.projectId !== undefined && snapshot && Array.isArray(snapshot.nodes) && Array.isArray(snapshot.connections) && snapshot.viewport) {
            if (snapshot.projectId !== item.projectId) body.error = "返回画布与绑定目标不一致，请重新确认目标";
            else {
                const state = this.canvasStates.get(clientId);
                if (state?.projectId === item.projectId) this.canvasStates.set(clientId, { ...state, projectId: snapshot.projectId, title: snapshot.title, nodes: snapshot.nodes, connections: snapshot.connections, selectedNodeIds: snapshot.selectedNodeIds, viewport: snapshot.viewport });
            }
        }
        body.error ? item.reject(new Error(body.error)) : item.resolve(body.result);
        return true;
    }

    /** 执行本机绑定工具，或向该 MCP 进程明确绑定的网页分派业务工具。 */
    async callTool(name: unknown, rawInput: unknown, bindingId: unknown) {
        if (typeof bindingId !== "string" || !bindingId.trim()) throw new Error("缺少 MCP 进程 bindingId");
        if (name === "canvas_list_clients") {
            bindingToolInputSchemas.canvas_list_clients.parse(rawInput);
            return this.listClients(bindingId);
        }
        if (name === "canvas_bind_client") {
            const input = bindingToolInputSchemas.canvas_bind_client.parse(rawInput);
            return this.bindClient(bindingId, input.clientId, input.projectId);
        }
        if (name === "canvas_release_client") {
            bindingToolInputSchemas.canvas_release_client.parse(rawInput);
            return this.releaseClient(bindingId);
        }
        if (!isToolName(name)) throw new Error(`未知工具：${String(name)}`);
        const input = parseToolInput(name, rawInput) as Record<string, unknown>;
        const binding = this.bindings.get(bindingId);
        if (!binding) throw new Error("尚未绑定目标，请先调用 canvas_list_clients，再用 canvas_bind_client 明确选择网页");
        if (!this.clients.has(binding.clientId)) throw new Error("绑定网页已断开，请重新连接原页面或明确绑定其他页面");
        logger.info("MCP tool called", { name, input, bindingId, ...binding });
        if (SITE_TOOLS.has(name)) {
            const includesCanvas = name === "generation_get_status" && (!input.scope || input.scope === "all" || input.scope === "canvas") && (!input.taskId || (Array.isArray(input.nodeIds) && input.nodeIds.length > 0));
            const target = includesCanvas ? { clientId: binding.clientId, projectId: binding.projectId || "" } : { clientId: binding.clientId };
            if (includesCanvas && (this.canvasStates.get(binding.clientId)?.projectId || "") !== target.projectId) throw new Error("绑定页面已切换画布，请重新绑定后查询画布任务");
            return await this.requestCanvasTool(name, input, target);
        }
        const state = this.canvasStates.get(binding.clientId) || null;
        if (!binding.projectId) throw new Error("尚未绑定画布，请打开目标画布后重新调用 canvas_bind_client");
        if (state?.projectId !== binding.projectId) throw new Error("绑定页面已切换画布，请重新调用 canvas_list_clients 和 canvas_bind_client 确认目标");
        if (["canvas_get_state", "canvas_export_snapshot", "canvas_get_selection"].includes(name)) {
            const snapshot = await this.requestCanvasTool("canvas_get_state", {}, binding) as CanvasSnapshot;
            if (snapshot?.projectId !== binding.projectId) throw new Error("绑定页面已切换画布，请重新确认目标");
            if (name !== "canvas_get_selection") return compactCanvasState(snapshot);
            const ids = new Set(snapshot.selectedNodeIds || []);
            return { nodes: (snapshot.nodes || []).filter((node) => ids.has(node.id)).map(compactNode) };
        }
        const request = buildCanvasToolRequest(name, input, state);
        return await this.requestCanvasTool(request.name, request.input, binding);
    }

    /** 页面关闭或替换时立即拒绝其未完成工具。 */
    private rejectClientRequests(clientId: string, message: string) {
        this.pending.forEach((item, requestId) => {
            if (item.clientId !== clientId) return;
            this.pending.delete(requestId);
            item.reject(new Error(message));
        });
    }

    /** 捕获此次调用的固定目标，焦点或后续重新绑定不影响在途请求。 */
    private async requestCanvasTool(name: ToolName, input: Record<string, unknown>, binding: ClientBinding) {
        const requestId = crypto.randomUUID();
        const { clientId, projectId: expectedProjectId } = binding;
        const client = this.clients.get(clientId);
        if (!client) throw new Error("绑定网页已断开");
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                logger.warn("Canvas tool request timed out", { requestId, name, clientId });
                reject(new Error("画布操作超时"));
            }, 30000);
            this.pending.set(requestId, { ...binding, resolve: (value) => (clearTimeout(timer), resolve(value)), reject: (error) => (clearTimeout(timer), reject(error)) });
            try {
                sendEvent(client, "tool_call", { requestId, name, input, clientId, expectedProjectId });
                logger.debug("Canvas tool request sent", { requestId, name, input, clientId, expectedProjectId });
            } catch (error) {
                this.pending.delete(requestId);
                clearTimeout(timer);
                reject(error);
            }
        });
    }
}

/** 向 SSE 连接写入一个事件。 */
function sendEvent(res: ServerResponse, type: string, payload: unknown) {
    res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}
