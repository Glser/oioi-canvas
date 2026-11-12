import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CanvasSession } from "../canvas/session.js";
import { startCodex, type AgentTransport, type AgentTransportFactory, type RpcParams } from "./codex-rpc.js";
import { ConversationManifest, type ConversationRecord } from "./manifest.js";
import { readCapabilities, resolveModelSelection } from "./capabilities.js";
import type { AgentAnswer, AgentConversation, AgentMessage, AgentRequest, AgentModelSelection, AgentCapabilities } from "./types.js";

type Target = { clientId: string; projectId: string; origin: string };
type Pending = { method: string; params: RpcParams; resolve: (value: unknown) => void; reject: (error: Error) => void };
type Runtime = { target: Target; key: string; bindingId: string; state: AgentConversation; record: ConversationRecord; rpc?: AgentTransport; loading?: Promise<void>; pending: Map<string, Pending>; sending: boolean; completed: Set<string>; items: Map<string, RpcParams>; hydrating: boolean; events: { method: string; params: RpcParams }[]; lastCapabilities?: AgentCapabilities | null };
const approvalMethods = new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval"]);

/** 一个画布使用一个原生会话；网页恢复只读取快照，不重新发送历史输入。 */
export class AgentConversations {
    private runtimes = new Map<string, Runtime>();
    private closing = false;
    constructor(private canvas: CanvasSession, private manifest: ConversationManifest, private cwd: string, private spawn: AgentTransportFactory = startCodex) {}

    private key(target: Target) { return JSON.stringify([target.origin, target.projectId]); }
    private publish(runtime: Runtime, includeCapabilities = false) {
        runtime.state.revision += 1;
        const { capabilities, ...state } = runtime.state;
        const changed = includeCapabilities || runtime.lastCapabilities !== capabilities;
        this.canvas.emitToClient(runtime.target.clientId, "agent_state", changed ? runtime.state : state);
        runtime.lastCapabilities = capabilities;
    }
    private save(runtime: Runtime) {
        this.manifest.set(runtime.key, runtime.record);
        runtime.state.submissions = structuredClone(runtime.record.submissions);
    }
    private validate(target: Target) { this.canvas.assertClient(target.clientId, target.projectId, target.origin); }
    private runtime(target: Target) {
        this.validate(target);
        const runtime = this.runtimes.get(this.key(target));
        if (!runtime || runtime.target.clientId !== target.clientId) throw new Error("请先连接当前画布的 Agent 会话");
        return runtime;
    }
    async connect(target: Target): Promise<AgentConversation> {
        this.validate(target);
        const key = this.key(target);
        let runtime = this.runtimes.get(key);
        if (runtime && runtime.target.clientId !== target.clientId && (runtime.sending || runtime.state.turnId || runtime.loading)) throw new Error("此画布的 Agent 正在另一个标签页执行，请返回原页面操作");
        if (!runtime) {
            const record = this.manifest.get(key) || { threadId: "", cwd: this.cwd, submissions: {} };
            for (const receipt of Object.values(record.submissions)) if (receipt.status === "sending") receipt.status = "uncertain";
            runtime = { target, key, record, bindingId: crypto.randomUUID(), pending: new Map(), sending: false, completed: new Set(), items: new Map(), hydrating: false, events: [], state: { instanceId: crypto.randomUUID(), revision: 0, projectId: target.projectId, threadId: record.threadId, cwd: record.cwd, capabilities: null, status: "ready", turnId: null, messages: [], requests: [], submissions: structuredClone(record.submissions), error: "" } };
            this.runtimes.set(key, runtime);
        }
        runtime.target = target;
        this.canvas.bindClient(runtime.bindingId, target.clientId, target.projectId);
        if (!runtime.rpc && !runtime.loading) {
            const current = runtime;
            current.loading = this.initialize(current).finally(() => { current.loading = undefined; });
        }
        await runtime.loading;
        this.publish(runtime, true);
        return runtime.state;
    }
    private async initialize(runtime: Runtime) {
        let rpc: AgentTransport | undefined;
        runtime.hydrating = true;
        runtime.events = [];
        try {
            rpc = await this.spawn((method, params) => this.notification(runtime, method, params), (method, params, id) => this.request(runtime, method, params, id), (error) => {
                runtime.rpc = undefined;
                runtime.state.status = "error";
                runtime.state.error = error.message;
                runtime.state.turnId = null;
                this.clearRequests(runtime);
                this.publish(runtime);
            });
            runtime.rpc = rpc;
            if (this.closing) throw new Error("本地连接服务正在关闭");
            const account = await rpc.request("account/read", { refreshToken: false });
            if (!account.account && account.requiresOpenaiAuth !== false) throw new Error("Codex 尚未登录，请在本机终端运行 codex login 后重新连接");
            const entry = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../index.ts" : "../index.js", import.meta.url));
            const params = {
                cwd: runtime.record.cwd,
                config: { "mcp_servers.oioi-canvas": { command: process.execPath, args: [...process.execArgv, entry, "mcp"], env: { OIOI_CANVAS_SESSION: runtime.bindingId }, enabled: true } },
            };
            const resuming = Boolean(runtime.record.threadId);
            const session = runtime.record.threadId
                ? await rpc.request("thread/resume", { ...params, threadId: runtime.record.threadId })
                : await rpc.request("thread/start", params);
            const { thread } = session;
            runtime.state.capabilities = await readCapabilities(rpc, runtime.record.cwd, session);
            runtime.record.threadId = thread.id;
            runtime.state.threadId = thread.id;
            if (resuming) {
                const turns: RpcParams[] = [];
                let cursor: string | null = null;
                do {
                    const page = await rpc.request("thread/turns/list", { threadId: thread.id, cursor, sortDirection: "asc", itemsView: "full" });
                    turns.push(...page.data);
                    cursor = page.nextCursor;
                } while (cursor);
                thread.turns = turns;
            }
            this.hydrate(runtime, thread);
            runtime.rpc = rpc;
            runtime.hydrating = false;
            for (const event of runtime.events) this.notification(runtime, event.method, event.params);
            runtime.events = [];
            if (runtime.pending.size) runtime.state.status = "waiting";
            this.save(runtime);
            runtime.state.error = "";
        } catch (error) {
            runtime.hydrating = false;
            runtime.events = [];
            rpc?.close();
            runtime.rpc = undefined;
            runtime.state.status = "error";
            runtime.state.error = error instanceof Error ? error.message : String(error);
            this.publish(runtime);
            throw error;
        }
    }
    async send(target: Target, submissionId: string, text: string, selection: AgentModelSelection = {}) {
        const runtime = this.runtime(target);
        if (!runtime.rpc || runtime.loading) throw new Error("Agent 尚未就绪，请重新连接");
        const previous = runtime.record.submissions[submissionId];
        if (previous) {
            if (previous.status !== "accepted") throw new Error("这次提交的接收状态尚不确定，请先检查会话历史，不会自动重复执行");
            return runtime.state;
        }
        if (runtime.sending || runtime.state.turnId || runtime.pending.size) throw new Error("当前任务仍在执行或等待确认，请先停止或等待完成");
        const modelOptions = resolveModelSelection(runtime.state.capabilities, selection);
        runtime.sending = true;
        try {
            // 在发送前落盘：进程崩溃时宁可明确待核对，也不重放可能已经执行的任务。
            runtime.record.submissions[submissionId] = { status: "sending" };
            this.save(runtime);
            runtime.state.status = "running";
            runtime.state.error = "";
            this.publish(runtime);
            const { turn } = await runtime.rpc.request("turn/start", { threadId: runtime.state.threadId, clientUserMessageId: submissionId, ...modelOptions, input: [{ type: "text", text, text_elements: [] }] });
            runtime.record.submissions[submissionId] = { status: "accepted", turnId: turn.id };
            if (runtime.state.capabilities) {
                runtime.state.capabilities = { ...runtime.state.capabilities, ...(modelOptions.model ? { model: modelOptions.model } : {}), ...(modelOptions.effort ? { reasoningEffort: modelOptions.effort } : {}) };
            }
            this.save(runtime);
            if (!runtime.completed.has(turn.id)) runtime.state.turnId = turn.id;
            this.publish(runtime);
            return runtime.state;
        } catch (error) {
            runtime.record.submissions[submissionId] = { status: "uncertain" };
            this.save(runtime);
            runtime.state.error = error instanceof Error ? error.message : String(error);
            if (!runtime.state.turnId) runtime.state.status = "error";
            this.publish(runtime);
            throw error;
        } finally { runtime.sending = false; }
    }
    async refreshCapabilities(target: Target) {
        const runtime = this.runtime(target);
        if (!runtime.rpc || runtime.loading) throw new Error("Agent 尚未就绪");
        const current = runtime.state.capabilities;
        const capabilities = await readCapabilities(runtime.rpc, runtime.record.cwd, { thread: { id: runtime.state.threadId }, model: current?.model, modelProvider: current?.modelProvider, reasoningEffort: current?.reasoningEffort, approvalPolicy: current?.approvalPolicy, sandbox: { type: current?.sandbox } });
        runtime.state.capabilities = { ...capabilities, model: runtime.state.capabilities?.model ?? capabilities.model, reasoningEffort: runtime.state.capabilities?.reasoningEffort ?? capabilities.reasoningEffort };
        this.publish(runtime);
        return runtime.state;
    }
    async interrupt(target: Target) {
        const runtime = this.runtime(target);
        if (!runtime.rpc || !runtime.state.turnId) throw new Error("当前没有可以停止的执行");
        await runtime.rpc.request("turn/interrupt", { threadId: runtime.state.threadId, turnId: runtime.state.turnId });
        return runtime.state;
    }
    answer(target: Target, answer: AgentAnswer) {
        const runtime = this.runtime(target);
        const pending = runtime.pending.get(answer.requestId);
        if (!pending) throw new Error("确认请求已经结束，请查看最新状态");
        let result: unknown;
        if (pending.method === "item/tool/requestUserInput") {
            const answers: Record<string, { answers: string[] }> = {};
            for (const question of pending.params.questions || []) {
                const text = answer.answers?.[question.id]?.trim();
                if (!text) throw new Error("请回答全部问题");
                answers[question.id] = { answers: [text] };
            }
            result = { answers };
        } else {
            if (!answer.decision) throw new Error("请选择允许或拒绝");
            result = pending.method === "item/permissions/requestApproval"
                ? { permissions: answer.decision === "accept" ? pending.params.permissions : {}, scope: "turn" }
                : { decision: answer.decision };
        }
        runtime.pending.delete(answer.requestId);
        runtime.state.requests = runtime.state.requests.filter((request) => request.id !== answer.requestId);
        runtime.state.status = runtime.pending.size ? "waiting" : runtime.state.turnId ? "running" : "ready";
        pending.resolve(result);
        this.publish(runtime);
        return runtime.state;
    }
    /** 受管 MCP 不能列出、重绑或释放其他页面；每次调用核对固定项目。 */
    callTool(bindingId: string, name: string, input: unknown) {
        const runtime = [...this.runtimes.values()].find((item) => item.bindingId === bindingId);
        if (!runtime) throw new Error("受管会话不存在或已关闭");
        this.validate(runtime.target);
        if (["canvas_list_clients", "canvas_bind_client", "canvas_release_client"].includes(name)) throw new Error("网页会话的目标由连接服务固定，不允许重新绑定");
        return this.canvas.callTool(name, input, bindingId);
    }
    private request(runtime: Runtime, method: string, params: RpcParams, id: string): Promise<unknown> {
        if (params.threadId !== runtime.state.threadId || (runtime.state.turnId && params.turnId !== runtime.state.turnId)) return Promise.reject(new Error("确认请求不属于当前会话"));
        if (!approvalMethods.has(method) && method !== "item/tool/requestUserInput") {
            runtime.state.error = `当前网页暂不支持此交互：${method}，已拒绝请求`;
            this.publish(runtime);
            return Promise.reject(new Error(runtime.state.error));
        }
        const request: AgentRequest = { id, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, kind: method === "item/tool/requestUserInput" ? "input" : "approval", title: method === "item/tool/requestUserInput" ? "需要补充信息" : "需要操作授权", detail: [params.reason, params.command, params.cwd, params.permissions ? JSON.stringify(params.permissions, null, 2) : "", method === "item/fileChange/requestApproval" ? JSON.stringify(runtime.items.get(`${params.turnId}:${params.itemId}`)?.changes || [], null, 2) : ""].filter(Boolean).join("\n"), ...(params.questions ? { questions: params.questions } : {}) };
        runtime.state.requests.push(request);
        runtime.state.status = "waiting";
        return new Promise((resolve, reject) => {
            runtime.pending.set(id, { method, params, resolve, reject });
            this.publish(runtime);
        });
    }
    private clearRequests(runtime: Runtime) {
        runtime.pending.forEach((request) => request.reject(new Error("执行已结束，确认请求已取消")));
        runtime.pending.clear();
        runtime.state.requests = [];
    }
    private notification(runtime: Runtime, method: string, params: RpcParams) {
        if (runtime.hydrating) { runtime.events.push({ method, params }); return; }
        if (!runtime.state.threadId || params.threadId !== runtime.state.threadId) return;
        if ((method === "turn/started" || method === "turn/completed") && runtime.completed.has(params.turn?.id)) return;
        if (method === "serverRequest/resolved") {
            const id = `${typeof params.requestId}:${params.requestId}`;
            runtime.pending.get(id)?.reject(new Error("确认请求已由运行时结束"));
            runtime.pending.delete(id);
            runtime.state.requests = runtime.state.requests.filter((request) => request.id !== id);
            runtime.state.status = runtime.pending.size ? "waiting" : runtime.state.turnId ? "running" : "ready";
        } else if (method === "turn/started") {
            runtime.state.turnId = params.turn.id;
            runtime.state.status = "running";
        } else if (method === "turn/completed") {
            const turn = params.turn;
            runtime.completed.add(turn.id);
            if (turn.itemsView === "full") this.replaceTurn(runtime, turn);
            else void this.refreshTurn(runtime, turn.id);
            runtime.state.turnId = null;
            runtime.state.status = turn.status === "failed" ? "error" : "ready";
            runtime.state.error = turn.error?.message || "";
            this.clearRequests(runtime);
        } else if ((method === "item/started" || method === "item/completed") && !runtime.completed.has(params.turnId)) {
            this.upsert(runtime, params.turnId, params.item);
        } else if (method === "item/agentMessage/delta" && !runtime.completed.has(params.turnId)) {
            const message = runtime.state.messages.find((item) => item.threadId === params.threadId && item.turnId === params.turnId && item.itemId === params.itemId);
            if (message) message.text += params.delta;
            else runtime.state.messages.push({ threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, role: "assistant", text: params.delta });
        } else if (method === "error") {
            runtime.state.error = params.error?.message || "Agent 执行出现错误";
        } else return;
        this.publish(runtime);
    }
    private async refreshTurn(runtime: Runtime, turnId: string) {
        try {
            const rpc = runtime.rpc;
            if (!rpc) return;
            const items: RpcParams[] = [];
            let cursor: string | null = null;
            do {
                const page = await rpc.request("thread/items/list", { threadId: runtime.state.threadId, turnId, cursor, sortDirection: "asc" });
                items.push(...page.data.map((entry: RpcParams) => entry.item));
                cursor = page.nextCursor;
            } while (cursor);
            this.replaceTurn(runtime, { id: turnId, items });
            this.publish(runtime);
        } catch (error) {
            runtime.state.error = `历史同步失败，已保留实时内容：${error instanceof Error ? error.message : String(error)}`;
            this.publish(runtime);
        }
    }
    private hydrate(runtime: Runtime, thread: RpcParams) {
        runtime.state.messages = [];
        runtime.items.clear();
        runtime.completed.clear();
        runtime.state.turnId = null;
        for (const turn of thread.turns || []) {
            this.replaceTurn(runtime, turn);
            if (turn.status === "inProgress") runtime.state.turnId = turn.id;
            else runtime.completed.add(turn.id);
            for (const item of turn.items || []) {
                const id = item.clientId;
                if (item.type === "userMessage" && id && runtime.record.submissions[id]) runtime.record.submissions[id] = { status: "accepted", turnId: turn.id };
            }
        }
        runtime.state.status = runtime.state.turnId ? "running" : "ready";
    }
    private replaceTurn(runtime: Runtime, turn: RpcParams) {
        // turn 快照成为权威，绝不再拼接该 turn 的旧实时消息。
        const first = runtime.state.messages.findIndex((message) => message.turnId === turn.id);
        runtime.state.messages = runtime.state.messages.filter((message) => message.turnId !== turn.id);
        const messages: AgentMessage[] = [];
        for (const item of turn.items || []) {
            if (item.type === "fileChange") runtime.items.set(`${turn.id}:${item.id}`, item);
            const message = normalizeItem(runtime.state.threadId, turn.id, item);
            if (message) messages.push(message);
        }
        runtime.state.messages.splice(first < 0 ? runtime.state.messages.length : first, 0, ...messages);
    }
    private upsert(runtime: Runtime, turnId: string, item: RpcParams) {
        if (item.type === "fileChange") runtime.items.set(`${turnId}:${item.id}`, item);
        const message = normalizeItem(runtime.state.threadId, turnId, item);
        if (!message) return;
        const index = runtime.state.messages.findIndex((current) => current.threadId === message.threadId && current.turnId === turnId && current.itemId === message.itemId);
        if (index < 0) runtime.state.messages.push(message);
        else runtime.state.messages[index] = message;
    }
    close() { this.closing = true; for (const runtime of this.runtimes.values()) { this.clearRequests(runtime); runtime.rpc?.close(); } }
}

function normalizeItem(threadId: string, turnId: string, item: RpcParams): AgentMessage | null {
    let role: AgentMessage["role"] = "tool";
    let text: string;
    if (item.type === "userMessage") { role = "user"; text = (item.content || []).filter((part: RpcParams) => part.type === "text").map((part: RpcParams) => part.text).join("\n"); }
    else if (item.type === "agentMessage" || item.type === "plan") { role = "assistant"; text = item.text || ""; }
    else if (item.type === "mcpToolCall") text = `${item.tool}${item.error?.message ? `：${item.error.message}` : ""}`;
    else if (item.type === "commandExecution") text = item.command || "执行命令";
    else if (item.type === "fileChange") text = (item.changes || []).map((change: RpcParams) => change.path).join("\n") || "修改文件";
    else return null;
    return { threadId, turnId, itemId: item.id, role, text, status: item.status };
}
