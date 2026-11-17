import crypto from "node:crypto";
import spawn from "cross-spawn";
import { getSessionInfo, getSessionMessages, query, resolveSettings, type Options, type Query, type SDKMessage, type SDKUserMessage, type SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentTransport, AgentTransportFactory, RpcParams } from "./codex-rpc.js";
import type { AgentCapabilities } from "./types.js";

/** 使用官方 SDK 驱动已安装的 Claude Code；正文历史仍由原生 CLI 保存。 */
export function createClaudeTransport(command: string, cwd: string): AgentTransportFactory {
    return async (notify, request, closed) => {
        let sessionId = crypto.randomUUID() as string;
        let current: Query | undefined;
        let starting: Promise<Query> | undefined;
        let processExit: Promise<void> | undefined;
        let deliver: ((message: SDKUserMessage | null) => void) | undefined;
        let stopped = false;
        let persisted = false;
        let turn: RpcParams | undefined;
        let turns: RpcParams[] = [];
        let mcpServers: Options["mcpServers"];
        let model: string | undefined;
        let effort: Extract<Options["effort"], string> | undefined;
        let permissionMode: Options["permissionMode"];
        let actual: { model?: string; effort?: string | null; permissionMode?: string } = {};
        let streamMessageId = "";
        const streamBlocks = new Map<string, { type: string; index: number }[]>();
        const assistantBlocks = new Map<string, (number | undefined)[]>();
        const messageTurns = new Map<string, string>();
        let interrupted = false;
        let receipt: { resolve: () => void; reject: (error: Error) => void } | undefined;
        let usedTokens: number | undefined;
        const emit = (method: string, params: RpcParams) => notify(method, { threadId: sessionId, ...params });
        const upsert = (item: RpcParams) => {
            if (!turn) return;
            const index = turn.items.findIndex((entry: RpcParams) => entry.id === item.id);
            if (index < 0) turn.items.push(item);
            else turn.items[index] = item;
            emit("item/completed", { turnId: turn.id, item });
        };
        const ask = async (method: string, params: RpcParams, signal: AbortSignal) => {
            if (!turn || signal.aborted) throw new Error("执行已结束，确认请求已取消");
            const id = crypto.randomUUID();
            const cancel = () => emit("serverRequest/resolved", { requestId: id });
            const answer = request(method, { threadId: sessionId, turnId: turn.id, ...params }, `string:${id}`);
            signal.addEventListener("abort", cancel, { once: true });
            try { return await answer as RpcParams; }
            finally { signal.removeEventListener("abort", cancel); }
        };
        const finish = (status: string, error?: string) => {
            if (!turn) return;
            receipt?.reject(new Error(error || "Claude Code 尚未确认接收本次提交"));
            receipt = undefined;
            for (const item of turn.items) if (item.status === "inProgress") item.status = status === "completed" ? "completed" : "failed";
            const completed = { ...turn, status, itemsView: "full", ...(error ? { error: { message: error } } : {}) };
            turns.push(completed);
            turn = undefined;
            emit("turn/completed", { turn: completed });
        };
        const receive = (message: SDKMessage) => {
            if ("session_id" in message && message.session_id && message.session_id !== sessionId) return;
            if (message.type === "system" && message.subtype === "init") {
                actual = { model: message.model, effort: message.effort, permissionMode: message.permissionMode };
                emit("thread/settings/updated", { threadSettings: { model: message.model, reasoningEffort: message.effort ?? effort ?? null, approvalPolicy: message.permissionMode, sandboxPolicy: { type: message.permissionMode === "bypassPermissions" ? "dangerFullAccess" : null } } });
                return;
            }
            if (!turn || ("parent_tool_use_id" in message && message.parent_tool_use_id)) return;
            if (message.type === "stream_event" && message.event.type === "message_start") streamMessageId = message.event.message.id;
            const nativeId = message.type === "assistant" ? message.message.id : message.type === "user" ? message.uuid : message.type === "stream_event" ? streamMessageId : undefined;
            if ("user_message_uuid" in message && message.user_message_uuid && message.user_message_uuid !== turn.id) {
                if (nativeId) messageTurns.set(nativeId, message.user_message_uuid);
                return;
            }
            // resume 可能回放旧消息；缺少 user_message_uuid 的帧也必须保留原轮次归属。
            if (nativeId) {
                const owner = messageTurns.get(nativeId);
                if (owner !== undefined && owner !== turn.id) return;
                messageTurns.set(nativeId, turn.id);
            }
            if (message.type === "assistant" || message.type === "stream_event" || message.type === "result" || message.type === "user" && message.uuid === turn.id) {
                persisted = true;
                receipt?.resolve();
                receipt = undefined;
            }
            if (message.type === "stream_event") {
                const event = message.event;
                if (event.type === "message_start") {
                    streamBlocks.set(streamMessageId, []);
                }
                if (event.type === "content_block_start") streamBlocks.get(streamMessageId)?.push({ type: event.content_block.type, index: event.index });
                if (event.type === "content_block_delta" && event.delta.type === "text_delta" && streamMessageId) {
                    const id = `${streamMessageId}:${event.index}`;
                    let item = turn.items.find((entry: RpcParams) => entry.id === id);
                    if (!item) { item = { id, type: "agentMessage", text: "" }; turn.items.push(item); }
                    item.text += event.delta.text;
                    emit("item/agentMessage/delta", { turnId: turn.id, itemId: id, delta: event.delta.text });
                }
            } else if (message.type === "assistant" || message.type === "user") {
                let blockIndexes: (number | undefined)[] | undefined;
                if (message.type === "assistant") {
                    const usage = message.message.usage;
                    usedTokens = usage.input_tokens + usage.output_tokens + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
                    // 完成帧通常只含一个块；数组下标不是原始流式块编号。
                    blockIndexes = assistantBlocks.get(message.uuid);
                    if (!blockIndexes) {
                        const pending = streamBlocks.get(message.message.id) || [];
                        blockIndexes = message.message.content.map((block) => {
                            const index = pending.findIndex((entry) => entry.type === block.type);
                            return index < 0 ? undefined : pending.splice(index, 1)[0].index;
                        });
                        assistantBlocks.set(message.uuid, blockIndexes);
                    }
                }
                for (const item of messageItems(message as unknown as SessionMessage, turn.items, blockIndexes)) upsert(item);
            } else if (message.type === "result") {
                persisted = true;
                const totals = Object.values(message.modelUsage || {});
                if (usedTokens !== undefined) emit("thread/tokenUsage/updated", { turnId: turn.id, tokenUsage: {
                    last: { totalTokens: usedTokens },
                    total: { totalTokens: totals.reduce((sum, value) => sum + value.inputTokens + value.outputTokens + value.cacheReadInputTokens + value.cacheCreationInputTokens, 0) },
                    modelContextWindow: message.modelUsage[actual.model || ""]?.contextWindow ?? null,
                } });
                const error = message.subtype === "success" ? message.is_error ? message.result : undefined : message.errors.join("\n");
                finish(interrupted ? "interrupted" : error ? "failed" : "completed", interrupted ? undefined : error);
            }
        };
        const stopQuery = () => {
            const old = current;
            current = undefined;
            deliver?.(null);
            deliver = undefined;
            old?.close();
        };
        const openQuery = async () => {
            const previousExit = processExit;
            stopQuery();
            await previousExit;
            if (stopped) throw new Error("Claude Code 连接已关闭");
            // 输入队列留空时只初始化原生会话与能力，不发送模型请求。
            let resolveInput: ((message: SDKUserMessage | null) => void) | undefined;
            const messages: SDKUserMessage[] = [];
            let ended = false;
            deliver = (message) => {
                if (!message) ended = true;
                if (resolveInput) { const resolve = resolveInput; resolveInput = undefined; resolve(message); }
                else if (message) messages.push(message);
            };
            async function* input() {
                while (!ended) {
                    const message = messages.shift() || await new Promise<SDKUserMessage | null>((resolve) => { resolveInput = resolve; });
                    if (message) yield message;
                }
            }
            const instance = query({ prompt: input(), options: {
                cwd, pathToClaudeCodeExecutable: command, settingSources: ["user", "project", "local"], systemPrompt: { type: "preset", preset: "claude_code" },
                ...(persisted ? { resume: sessionId } : { sessionId }), mcpServers, model, effort,
                ...(permissionMode ? { permissionMode, ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}) } : {}),
                includePartialMessages: true, extraArgs: { "replay-user-messages": null },
                // cross-spawn 处理 Windows npm .cmd；不解析终端输出或复制凭证。
                spawnClaudeCodeProcess: (options) => {
                    const child = spawn(command, options.args, { cwd: options.cwd, env: options.env, signal: options.signal, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
                    processExit = new Promise((resolve) => { child.once("close", () => resolve()); });
                    return Object.assign(child, { stdin: child.stdin!, stdout: child.stdout! });
                },
                stderr: (data) => process.stderr.write(data),
                canUseTool: async (toolName, input, options) => {
                    try {
                        if (toolName === "AskUserQuestion") {
                            const questions = input.questions as { question: string; header: string; options?: { label: string; description: string }[] }[];
                            const answer = await ask("item/tool/requestUserInput", { itemId: options.toolUseID, questions: questions.map((question, index) => ({ ...question, id: String(index) })) }, options.signal);
                            return { behavior: "allow", updatedInput: { ...input, answers: Object.fromEntries(questions.map((question, index) => [question.question, answer.answers[String(index)].answers.join(", ")])) } };
                        }
                        const answer = await ask("item/commandExecution/requestApproval", { itemId: options.toolUseID, reason: `${toolName}\n${options.decisionReason || ""}`, command: JSON.stringify(input, null, 2), cwd }, options.signal);
                        return answer.decision === "accept" ? { behavior: "allow", updatedInput: input } : { behavior: "deny", message: "用户拒绝了本次操作" };
                    } catch { return { behavior: "deny", message: "操作确认已取消" }; }
                },
                onElicitation: async (input, options) => {
                    try { return await ask("mcpServer/elicitation/request", { ...input, mode: input.mode || "form" }, options.signal) as { action: "accept" | "decline" | "cancel"; content?: Record<string, string> }; }
                    catch { return { action: "cancel" }; }
                },
            } });
            current = instance;
            void (async () => {
                try {
                    for await (const message of instance) { if (current !== instance || stopped) break; receive(message); }
                    if (current === instance && !stopped) throw new Error("Claude Code 已退出，请重新连接会话");
                } catch (error) {
                    if (current !== instance || stopped) return;
                    finish("failed", error instanceof Error ? error.message : String(error));
                    stopQuery();
                    closed(new Error("Claude Code 连接中断，请检查本机运行时后重新连接"));
                }
            })();
            try { await instance.initializationResult(); }
            catch (error) { if (current === instance) stopQuery(); throw error; }
            return instance;
        };
        const startQuery = () => starting ||= openQuery().finally(() => { starting = undefined; });
        const ensureQuery = async () => starting || current || startQuery();
        const capabilities = async (): Promise<AgentCapabilities> => {
            const instance = await ensureQuery();
            const result: AgentCapabilities = { runtimeId: "claude", permissionModes: ["runtime", "request", "fullAccess"], model: actual.model || model || null, modelProvider: null, reasoningEffort: actual.effort || effort || null, approvalPolicy: actual.permissionMode || permissionMode || null, approvalsReviewer: null, sandbox: (actual.permissionMode || permissionMode) === "bypassPermissions" ? "dangerFullAccess" : null, defaults: { model: null, reasoningEffort: null, approvalPolicy: null, sandbox: null }, models: [], skills: [], mcpServers: [], errors: [] };
            await Promise.all([
                instance.supportedModels().then((models) => { result.models = models.map((model) => ({ id: model.value, name: model.displayName, reasoningEfforts: (model.supportedEffortLevels || []).map((value) => ({ value, label: value })), defaultReasoningEffort: null })); }).catch(() => { result.errors.push("Claude 模型目录读取失败，请重新检测。"); }),
                instance.supportedCommands().then((skills) => { result.skills = skills.map((skill) => ({ name: skill.name, description: skill.description, enabled: true })); }).catch(() => { result.errors.push("Claude Skills 读取失败，请重新检测。"); }),
                instance.mcpServerStatus().then((servers) => { result.mcpServers = servers.map((server) => ({ name: server.name, status: server.status, authStatus: server.status === "needs-auth" ? "needsAuth" : "unknown", tools: server.tools?.map((tool) => tool.name) || [] })); }).catch(() => { result.errors.push("Claude MCP 状态读取失败，请重新检测。"); }),
                resolveSettings({ cwd }).then(({ effective }) => {
                    result.defaults.model = effective.model || null;
                    result.defaults.reasoningEffort = typeof effective.effortLevel === "string" ? effective.effortLevel : null;
                    result.model ||= effective.model || null;
                    result.reasoningEffort ||= result.defaults.reasoningEffort;
                }).catch(() => { result.errors.push("Claude 本机默认配置读取失败，仍由原生运行时加载配置。"); }),
            ]);
            return result;
        };
        const transport: AgentTransport = { runtimeId: "claude", capabilities, close: () => { stopped = true; receipt?.reject(new Error("Claude Code 连接已关闭，提交状态待核对")); receipt = undefined; stopQuery(); }, request: async (method, params) => {
            if (method === "account/read") {
                const account = await (await ensureQuery()).accountInfo();
                const source = (value?: string) => Boolean(value && value !== "none");
                const ready = source(account.tokenSource) || source(account.apiKeySource) || Boolean(account.apiProvider && account.apiProvider !== "firstParty");
                return { account: ready ? { available: true } : null, requiresOpenaiAuth: !ready };
            }
            if (method === "thread/start" || method === "thread/resume") {
                stopQuery();
                persisted = method === "thread/resume";
                sessionId = persisted ? params.threadId : crypto.randomUUID();
                if (persisted && !await getSessionInfo(sessionId, { dir: cwd })) throw new Error(`Claude Code 原会话 ${sessionId} 的历史文件缺失，已保留会话映射，请恢复原文件后重连`);
                messageTurns.clear();
                turns = persisted ? historyTurns(await getSessionMessages(sessionId, { dir: cwd }), messageTurns) : [];
                mcpServers = { "oioi-canvas": params.config["mcp_servers.oioi-canvas"] };
                await startQuery();
                return { thread: { id: sessionId, turns }, approvalPolicy: null, sandbox: null };
            }
            if (method === "thread/turns/list") return { data: turns, nextCursor: null };
            if (method === "thread/items/list") return { data: (turns.find((turn) => turn.id === params.turnId)?.items || []).map((item: RpcParams) => ({ item })), nextCursor: null };
            if (method === "thread/settings/update") {
                if (params.permissionMode === "readOnly") throw new Error("Claude Code 尚不支持此网页只读权限模式");
                permissionMode = params.permissionMode === "fullAccess" ? "bypassPermissions" : params.permissionMode === "request" ? "default" : undefined;
                actual.permissionMode = undefined;
                await startQuery();
                return {};
            }
            if (method === "turn/start") {
                if (turn) throw new Error("Claude Code 当前仍在执行");
                const settingsChanged = Boolean(params.model && params.model !== model || params.effort && params.effort !== effort);
                if (params.model && params.model !== model && !params.effort) effort = undefined;
                if (params.model) model = params.model;
                if (params.effort) effort = params.effort;
                // 普通多轮复用进程，仅参数改变时恢复会话以应用配置。
                await (settingsChanged ? startQuery() : ensureQuery());
                const id = params.clientUserMessageId;
                const text = params.input.map((item: RpcParams) => item.text).join("\n");
                turn = { id, status: "inProgress", items: [] };
                interrupted = false;
                usedTokens = undefined;
                streamMessageId = "";
                streamBlocks.clear();
                assistantBlocks.clear();
                emit("turn/started", { turn: { id } });
                upsert({ id, clientId: id, type: "userMessage", content: [{ type: "text", text }] });
                const accepted = new Promise<void>((resolve, reject) => { receipt = { resolve, reject }; });
                deliver!({ type: "user", uuid: id, session_id: sessionId, parent_tool_use_id: null, message: { role: "user", content: text } });
                await accepted;
                return { turn: { id } };
            }
            if (method === "turn/interrupt") { interrupted = true; await current?.interrupt(); return {}; }
            throw new Error(`Claude Code 不支持此会话操作：${method}`);
        } };
        return transport;
    };
}

function messageItems(entry: SessionMessage, existing: RpcParams[], blockIndexes?: (number | undefined)[]): RpcParams[] {
    const message = entry.message as RpcParams;
    const blocks: RpcParams[] = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content || [];
    if (entry.type === "assistant") return blocks.flatMap<RpcParams>((block, index) => {
        // 历史没有流事件，使用每个完成帧的 UUID，避免同一 message.id 的多个块互相覆盖。
        if (block.type === "text") return [{ id: blockIndexes?.[index] === undefined ? `${entry.uuid}:${index}` : `${message.id}:${blockIndexes[index]}`, type: "agentMessage", text: block.text }];
        if (block.type === "tool_use") return [{ id: block.id, type: "mcpToolCall", tool: block.name, status: "inProgress" }];
        return [];
    });
    const results: RpcParams[] = blocks.filter((block) => block.type === "tool_result").flatMap((block) => {
        const item = existing.find((item) => item.id === block.tool_use_id);
        return item ? [{ ...item, status: block.is_error ? "failed" : "completed" }] : [];
    });
    const text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n");
    if (entry.type === "user" && text && !blocks.some((block) => block.type === "tool_result")) results.push({ id: entry.uuid, clientId: entry.uuid, type: "userMessage", content: [{ type: "text", text }] });
    return results;
}

function historyTurns(messages: SessionMessage[], messageTurns: Map<string, string>) {
    const turns: RpcParams[] = [];
    for (const message of messages) {
        if (message.parent_tool_use_id || message.type === "system") continue;
        const items = messageItems(message, turns.at(-1)?.items || []);
        if (items.some((item) => item.type === "userMessage")) turns.push({ id: message.uuid, status: "completed", items: [] });
        const turn = turns.at(-1);
        if (!turn) continue;
        const nativeId = message.type === "assistant" ? (message.message as RpcParams).id : message.uuid;
        if (nativeId) messageTurns.set(nativeId, turn.id);
        for (const item of items) {
            const index = turn.items.findIndex((current: RpcParams) => current.id === item.id);
            if (index < 0) turn.items.push(item);
            else turn.items[index] = item;
        }
    }
    for (const turn of turns) {
        for (const item of turn.items) if (item.status === "inProgress") { item.status = "failed"; item.error = { message: "原生历史中没有工具结果，请核对执行状态" }; turn.status = "interrupted"; }
    }
    return turns;
}
