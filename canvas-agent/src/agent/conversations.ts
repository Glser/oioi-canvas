import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import type { CanvasSession } from "../canvas/session.js";
import { startCodex, type AgentTransport, type AgentTransportFactory, type RpcParams } from "./codex-rpc.js";
import { ConversationManifest, type ConversationRecord } from "./manifest.js";
import { readCapabilities, resolveModelSelection } from "./capabilities.js";
import type { AgentAnswer, AgentConversation, AgentMessage, AgentRequest, AgentModelSelection, AgentCapabilities, AgentPermissionMode, AgentRuntimeId } from "./types.js";

type Target = { clientId: string; projectId: string; origin: string; conversationId?: string; runtimeId?: AgentRuntimeId };
type Pending = { method: string; params: RpcParams; resolve: (value: unknown) => void; reject: (error: Error) => void };
type Runtime = { target: Target; key: string; bindingId: string; state: AgentConversation; record: ConversationRecord; rpc?: AgentTransport; loading?: Promise<void>; defaultPermissions?: RpcParams; pending: Map<string, Pending>; sending: boolean; completed: Set<string>; items: Map<string, RpcParams>; hydrating: boolean; events: { method: string; params: RpcParams }[]; lastCapabilities?: AgentCapabilities | null };
const approvalMethods = new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval"]);

/** 同一网站共用多个原生会话，画布工具按每轮提交绑定；恢复不重新发送历史输入。 */
export class AgentConversations {
    private runtimes = new Map<string, Runtime>();
    private closing = false;
    private switching = new Set<string>();
    constructor(private canvas: CanvasSession, private manifest: ConversationManifest, private cwd: string, private spawn: AgentTransportFactory = startCodex) {}

    private key(target: Target) { return JSON.stringify([target.origin, target.projectId]); }
    private publish(runtime: Runtime, includeCapabilities = false) {
        if (this.runtimes.get(runtime.key) !== runtime) return;
        runtime.state.revision += 1;
        const { capabilities, ...state } = runtime.state;
        const changed = includeCapabilities || runtime.lastCapabilities !== capabilities;
        this.canvas.emitToClient(runtime.target.clientId, "agent_state", changed ? runtime.state : state);
        runtime.lastCapabilities = capabilities;
    }
    private save(runtime: Runtime) {
        // Codex 的空会话尚无可恢复的 rollout，首次提交前只保存画布映射。
        this.manifest.set(runtime.key, runtime.state.conversationId, { ...runtime.record, threadId: runtime.state.messages.length || Object.keys(runtime.record.submissions).length ? runtime.record.threadId : "" });
        runtime.state.submissions = structuredClone(runtime.record.submissions);
    }
    private validate(target: Target) { this.canvas.assertClient(target.clientId, undefined, target.origin); }
    private runtime(target: Target) {
        this.validate(target);
        const runtime = this.runtimes.get(this.key(target));
        if (!runtime) throw new Error("请先连接当前网页的 Agent 会话");
        if (target.conversationId !== runtime.state.conversationId) throw new Error("当前会话已切换，请刷新后再操作");
        if (runtime.target.clientId !== target.clientId) {
            if (runtime.sending || runtime.state.turnId || runtime.pending.size || runtime.loading) throw new Error("此会话正在另一个标签页执行，请返回原页面操作");
            this.canvas.bindClient(runtime.bindingId, target.clientId);
            runtime.target = target;
        }
        return runtime;
    }
    private createRuntime(target: Target, conversationId: string, record: ConversationRecord): Runtime {
        for (const receipt of Object.values(record.submissions)) if (receipt.status === "sending") receipt.status = "uncertain";
        return { target, key: this.key(target), record, bindingId: crypto.randomUUID(), pending: new Map(), sending: false, completed: new Set(), items: new Map(), hydrating: false, events: [], state: { instanceId: crypto.randomUUID(), revision: 0, projectId: target.projectId, conversationId, runtimeId: record.runtimeId, threadId: record.threadId, cwd: record.cwd, capabilities: null, permissionMode: "runtime", tokenUsage: null, status: "ready", turnId: null, messages: [], requests: [], submissions: structuredClone(record.submissions), error: "" } };
    }
    async connect(target: Target): Promise<AgentConversation> {
        this.validate(target);
        const key = this.key(target);
        if (this.switching.has(key)) throw new Error("会话正在切换，请稍后重连");
        let runtime = this.runtimes.get(key);
        if (runtime?.loading && runtime.target.clientId !== target.clientId) await runtime.loading;
        if (runtime && runtime.target.clientId !== target.clientId && (runtime.sending || runtime.state.turnId || runtime.pending.size || runtime.loading)) throw new Error("此会话正在另一个标签页执行，请返回原页面操作");
        if (!runtime) {
            const project = this.manifest.get(key);
            runtime = this.createRuntime(target, project?.activeId || crypto.randomUUID(), project?.conversations[project.activeId] || { threadId: "", cwd: this.cwd, submissions: {}, title: "", runtimeId: target.runtimeId || "codex" });
            this.runtimes.set(key, runtime);
        }
        runtime.target = target;
        if (!runtime.sending && !runtime.state.turnId && !runtime.pending.size && !runtime.loading) this.canvas.bindClient(runtime.bindingId, target.clientId);
        if (!runtime.rpc && !runtime.loading) {
            const current = runtime;
            current.loading = this.initialize(current).finally(() => { current.loading = undefined; });
        }
        await runtime.loading;
        this.publish(runtime, true);
        return runtime.state;
    }
    list(target: Target) {
        this.validate(target);
        return Object.entries(this.manifest.get(this.key(target))?.conversations || {}).map(([id, record]) => ({ id, title: record.title, cwd: record.cwd, runtimeId: record.runtimeId })).reverse();
    }
    async open(target: Target, options: { id?: string; cwd?: string; runtimeId?: AgentRuntimeId }) {
        this.validate(target);
        const key = this.key(target);
        const previous = this.runtimes.get(key);
        if (this.switching.has(key) || previous && (previous.loading || previous.sending || previous.state.turnId || previous.pending.size)) throw new Error("请先结束当前任务并处理审批，再切换会话");
        if (previous && target.conversationId !== previous.state.conversationId && !(target.conversationId == null && previous.state.status === "error")) throw new Error("当前会话已切换，请刷新后再操作");
        this.switching.add(key);
        if (previous) previous.sending = true;
        let next: Runtime | undefined;
        try {
            const record = options.id ? this.manifest.get(key)?.conversations[options.id] : { threadId: "", cwd: await this.directoryPath(options.cwd || previous?.record.cwd || this.cwd), submissions: {}, title: "", runtimeId: options.runtimeId || previous?.record.runtimeId || "codex" };
            if (!record) throw new Error("会话不存在");
            next = this.createRuntime(target, options.id || crypto.randomUUID(), record);
            this.canvas.bindClient(next.bindingId, target.clientId);
            await this.initialize(next);
            this.runtimes.set(key, next);
            if (previous) { this.clearRequests(previous); previous.rpc?.close(); this.canvas.releaseClient(previous.bindingId); }
            this.publish(next, true);
            return next.state;
        } catch (error) {
            if (next) { next.rpc?.close(); this.canvas.releaseClient(next.bindingId); }
            throw error;
        } finally {
            if (previous) previous.sending = false;
            this.switching.delete(key);
        }
    }
    private async directoryPath(input: string) {
        if (!path.isAbsolute(input)) throw new Error("请输入本机文件夹的绝对路径");
        const cwd = await fs.realpath(input);
        if (!(await fs.stat(cwd)).isDirectory()) throw new Error("此路径不是文件夹");
        await fs.access(cwd, fs.constants.R_OK);
        return cwd;
    }
    async directories(target: Target, input?: string) {
        this.validate(target);
        if (input === "") {
            const roots = process.platform === "win32" ? Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", (letter) => `${letter}:\\`) : ["/"];
            const available = await Promise.all(roots.map(async (root) => { try { return (await fs.stat(root)).isDirectory() ? { name: root, path: root } : null; } catch { return null; } }));
            return { path: "", parent: null, directories: available.filter((entry) => entry !== null) };
        }
        const cwd = await this.directoryPath(input ?? this.runtimes.get(this.key(target))?.record.cwd ?? this.cwd);
        const entries = await fs.readdir(cwd, { withFileTypes: true });
        return { path: cwd, parent: path.dirname(cwd) === cwd ? "" : path.dirname(cwd), directories: entries.filter((entry) => entry.isDirectory()).map((entry) => ({ name: entry.name, path: path.join(cwd, entry.name) })).sort((a, b) => a.name.localeCompare(b.name)) };
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
            }, { runtimeId: runtime.record.runtimeId, cwd: runtime.record.cwd });
            runtime.rpc = rpc;
            if (this.closing) throw new Error("本地连接服务正在关闭");
            const account = await rpc.request("account/read", { refreshToken: false });
            if (!account.account && account.requiresOpenaiAuth !== false) throw new Error(runtime.record.runtimeId === "claude" ? "Claude Code 尚未认证，请在本机终端完成 Claude Code 登录或配置后重新连接" : "Codex 尚未登录，请在本机终端运行 codex login 后重新连接");
            const entry = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../index.ts" : "../index.js", import.meta.url));
            const params = {
                cwd: runtime.record.cwd,
                config: { "mcp_servers.oioi-canvas": { command: process.execPath, args: [...process.execArgv, entry, "mcp"], env: { OIOI_CANVAS_SESSION: runtime.bindingId }, enabled: true } },
            };
            let resuming = Boolean(runtime.record.threadId);
            let session: RpcParams;
            try {
                session = resuming
                    ? await rpc.request("thread/resume", { ...params, threadId: runtime.record.threadId })
                    : await rpc.request("thread/start", params);
            } catch (error) {
                if (!resuming || !(error instanceof Error) || error.message !== `no rollout found for thread id ${runtime.record.threadId}`) throw error;
                if (Object.keys(runtime.record.submissions).length) throw new Error(`原会话 ${runtime.record.threadId} 的本地历史文件缺失。已保留会话映射和提交记录，请恢复原会话文件后重连；不会自动新建或重复执行任务。`);
                this.manifest.backup();
                session = await rpc.request("thread/start", params);
                resuming = false;
            }
            const { thread } = session;
            runtime.defaultPermissions = { approvalPolicy: session.approvalPolicy, approvalsReviewer: session.approvalsReviewer, sandboxPolicy: session.sandbox };
            runtime.state.permissionMode = "runtime";
            runtime.state.tokenUsage = null;
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
            if (!runtime.record.title) runtime.record.title = runtime.state.messages.find((message) => message.role === "user")?.text.trim().split(/\r?\n/)[0] || "";
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
    async send(target: Target, submissionId: string, text: string, canvasProjectId: string, selection: AgentModelSelection = {}) {
        const runtime = this.runtime(target);
        if (!runtime.rpc || runtime.loading) throw new Error("Agent 尚未就绪，请重新连接");
        const previous = runtime.record.submissions[submissionId];
        if (previous) {
            if (previous.status !== "accepted") throw new Error("这次提交的接收状态尚不确定，请先检查会话历史，不会自动重复执行");
            return runtime.state;
        }
        if (runtime.sending || runtime.state.turnId || runtime.pending.size) throw new Error("当前任务仍在执行或等待确认，请先停止或等待完成");
        const modelOptions = resolveModelSelection(runtime.state.capabilities, selection);
        this.canvas.bindClient(runtime.bindingId, target.clientId, canvasProjectId);
        runtime.sending = true;
        try {
            // 在发送前落盘：进程崩溃时宁可明确待核对，也不重放可能已经执行的任务。
            runtime.record.submissions[submissionId] = { status: "sending" };
            if (!runtime.record.title) runtime.record.title = text.trim().split(/\r?\n/)[0];
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
        const capabilities = await readCapabilities(runtime.rpc, runtime.record.cwd, { thread: { id: runtime.state.threadId }, model: current?.model, modelProvider: current?.modelProvider, reasoningEffort: current?.reasoningEffort, approvalPolicy: current?.approvalPolicy, approvalsReviewer: current?.approvalsReviewer, sandbox: { type: current?.sandbox } });
        runtime.state.capabilities = capabilities;
        this.publish(runtime);
        return runtime.state;
    }
    async setPermissions(target: Target, mode: AgentPermissionMode) {
        const runtime = this.runtime(target);
        if (!runtime.rpc || runtime.loading) throw new Error("Agent 尚未就绪，请重新连接");
        if (runtime.sending || runtime.state.turnId || runtime.pending.size) throw new Error("请先处理当前审批或等待任务结束，再切换后续任务的权限");
        if (runtime.state.capabilities?.permissionModes && !runtime.state.capabilities.permissionModes.includes(mode)) throw new Error("当前运行时不支持此权限模式");
        const settings = mode === "runtime" ? runtime.defaultPermissions : {
            approvalPolicy: mode === "fullAccess" ? "never" : "on-request",
            approvalsReviewer: "user",
            sandboxPolicy: { type: mode === "fullAccess" ? "dangerFullAccess" : mode === "readOnly" ? "readOnly" : "workspaceWrite" },
        };
        runtime.sending = true;
        try {
            await runtime.rpc.request("thread/settings/update", { threadId: runtime.state.threadId, ...settings, ...(runtime.record.runtimeId === "claude" ? { permissionMode: mode } : {}) });
            runtime.state.permissionMode = mode;
            if (runtime.rpc.capabilities) runtime.state.capabilities = await runtime.rpc.capabilities();
            else if (runtime.state.capabilities) runtime.state.capabilities = { ...runtime.state.capabilities, approvalPolicy: typeof settings?.approvalPolicy === "string" ? settings.approvalPolicy : "custom", approvalsReviewer: settings?.approvalsReviewer || null, sandbox: settings?.sandboxPolicy?.type || null };
            runtime.state.error = "";
            this.publish(runtime, true);
            return runtime.state;
        } finally { runtime.sending = false; }
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
        if (pending.method === "mcpServer/elicitation/request") {
            if (!answer.decision) throw new Error("请选择允许或拒绝");
            if (answer.decision === "accept" && runtime.state.requests.find((request) => request.id === answer.requestId)?.unsupported) throw new Error("此授权需要在原生客户端完成，网页无法代替验证");
            const content = answer.content || {};
            if (answer.decision === "accept" && pending.params.mode === "form") {
                const validation = new AjvJsonSchemaValidator().getValidator(pending.params.requestedSchema)(content);
                if (!validation.valid) throw new Error(`请按表单要求填写：${validation.errorMessage}`);
            }
            result = { action: answer.decision, ...(answer.decision === "accept" && pending.params.mode === "form" ? { content } : {}) };
        } else if (pending.method === "item/tool/requestUserInput") {
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
        const elicitation = method === "mcpServer/elicitation/request";
        if (params.threadId !== runtime.state.threadId || (runtime.state.turnId && params.turnId !== runtime.state.turnId && !(elicitation && params.turnId == null))) return Promise.reject(new Error("确认请求不属于当前会话"));
        if (!approvalMethods.has(method) && method !== "item/tool/requestUserInput" && !elicitation) {
            runtime.state.error = `当前网页暂不支持此交互：${method}，已拒绝请求`;
            this.publish(runtime);
            return Promise.reject(new Error(runtime.state.error));
        }
        const request: AgentRequest = { id, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, kind: method === "item/tool/requestUserInput" ? "input" : "approval", title: method === "item/tool/requestUserInput" ? "需要补充信息" : "需要操作授权", detail: [params.reason, params.command, params.cwd, params.permissions ? JSON.stringify(params.permissions, null, 2) : "", method === "item/fileChange/requestApproval" ? JSON.stringify(runtime.items.get(`${params.turnId}:${params.itemId}`)?.changes || [], null, 2) : ""].filter(Boolean).join("\n"), ...(params.questions ? { questions: params.questions } : {}) };
        if (elicitation) {
            request.kind = "elicitation";
            request.turnId = params.turnId ?? runtime.state.turnId ?? "";
            request.itemId = id;
            request.title = `${params.serverName} · 需要授权确认`;
            request.detail = params.message || params.description || "";
            if (params.mode === "form" && params.requestedSchema?.type === "object") request.form = { properties: params.requestedSchema.properties || {}, required: params.requestedSchema.required || [] };
            else if (params.mode === "url" && /^https?:\/\//i.test(params.url)) request.url = params.url;
            else request.unsupported = true;
            if (request.form && Object.values(request.form.properties).some((field) => !["string", "boolean", "number", "integer"].includes(field.type) && !(field.type === "array" && (field.items?.enum || field.items?.anyOf)))) request.unsupported = true;
        }
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
        } else if (method === "thread/tokenUsage/updated") {
            if (runtime.state.turnId && params.turnId !== runtime.state.turnId) return;
            const usage = params.tokenUsage;
            if (!Number.isFinite(usage?.last?.totalTokens) || usage.last.totalTokens < 0 || !Number.isFinite(usage?.total?.totalTokens) || usage.total.totalTokens < 0) return;
            runtime.state.tokenUsage = { usedTokens: usage.last.totalTokens, totalTokens: usage.total.totalTokens, modelContextWindow: Number.isFinite(usage.modelContextWindow) && usage.modelContextWindow > 0 ? usage.modelContextWindow : null };
        } else if (method === "thread/settings/updated") {
            const settings = params.threadSettings;
            if (runtime.state.capabilities && settings) runtime.state.capabilities = { ...runtime.state.capabilities, ...(typeof settings.model === "string" ? { model: settings.model, reasoningEffort: settings.reasoningEffort ?? null } : {}), approvalPolicy: typeof settings.approvalPolicy === "string" ? settings.approvalPolicy : "custom", approvalsReviewer: settings.approvalsReviewer || null, sandbox: settings.sandboxPolicy?.type || null };
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
