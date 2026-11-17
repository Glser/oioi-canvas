import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { CanvasSession } from "../canvas/session.js";
import { AgentConversations } from "./conversations.js";
import { ConversationManifest } from "./manifest.js";
import type { AgentTransportFactory, RpcParams } from "./codex-rpc.js";

function fixture(t: { after: (fn: () => void) => void }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-agent-test-"));
    const manifestFile = path.join(dir, "conversations.json");
    const canvas = new CanvasSession();
    const target = { clientId: "page", projectId: "canvas", origin: "https://canvas.example" };
    const attach = (clientId = target.clientId, projectId = target.projectId, origin = target.origin) => {
        const response = Object.assign(new EventEmitter(), { writeHead() {}, write() { return true; }, end() { this.emit("close"); } });
        canvas.openEvents(new URL(`http://localhost/events?clientId=${clientId}`), response as unknown as ServerResponse, origin);
        canvas.updateState({ projectId, nodes: [], connections: [], viewport: { x: 0, y: 0, k: 1 } }, clientId);
    };
    attach();
    const calls: { method: string; params: RpcParams }[] = [];
    let notify: (method: string, params: RpcParams) => void;
    let ask: (method: string, params: RpcParams, id: string) => Promise<unknown>;
    let failTurn = false;
    let turns: RpcParams[] = [];
    let items: RpcParams[] = [];
    let resolveStart: ((value: unknown) => void) | undefined;
    let blockStart = false;
    const factory: AgentTransportFactory = async (notification, request) => {
        notify = notification; ask = request;
        return { close() {}, async request(method, params) {
            calls.push({ method, params });
            if (method === "account/read") return { account: { type: "apiKey" } };
            if (method === "thread/start" || method === "thread/resume") return { thread: { id: "thread", turns: [] } };
            if (method === "thread/turns/list") return { data: turns, nextCursor: null };
            if (method === "thread/items/list") return { data: items.map((item) => ({ turnId: "turn", item })), nextCursor: null };
            if (method === "turn/start") {
                if (failTurn) throw new Error("transport lost");
                if (blockStart) return await new Promise((resolve) => { resolveStart = resolve; });
                notification("turn/started", { threadId: "thread", turn: { id: "turn" } });
                return { turn: { id: "turn" } };
            }
            return {};
        } };
    };
    let manager = new AgentConversations(canvas, new ConversationManifest(manifestFile), dir, factory);
    t.after(() => { manager.close(); canvas.close(); });
    return { canvas, target, attach, calls, dir, manifestFile, get manager() { return manager; }, emit: (method: string, params: RpcParams) => notify(method, params), ask: (method: string, params: RpcParams, id = "number:1") => ask(method, params, id), failTurn: () => { failTurn = true; }, setTurns: (value: RpcParams[]) => { turns = value; }, setItems: (value: RpcParams[]) => { items = value; }, restart: () => { manager.close(); manager = new AgentConversations(canvas, new ConversationManifest(manifestFile), dir, factory); }, blockStart: () => { blockStart = true; }, resolveStart: () => resolveStart!({ turn: { id: "turn" } }) };
}

test("同一提交只发送一次，运行中不接收另一条输入", async (t) => {
    const f = fixture(t); await f.manager.connect(f.target);
    const id = crypto.randomUUID();
    await f.manager.send(f.target, id, "创建海报");
    await f.manager.send(f.target, id, "创建海报");
    await assert.rejects(f.manager.send(f.target, crypto.randomUUID(), "另一条"), /仍在执行/);
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 1);
});

test("完整 turn 快照覆盖增量，迟到事件不能重复拼接历史", async (t) => {
    const f = fixture(t); const state = await f.manager.connect(f.target);
    const event = { threadId: "thread", turnId: "turn", itemId: "reply" };
    f.emit("item/agentMessage/delta", { ...event, delta: "你" });
    f.emit("item/agentMessage/delta", { ...event, delta: "好" });
    f.emit("turn/completed", { threadId: "thread", turn: { id: "turn", status: "completed", itemsView: "full", items: [{ id: "reply", type: "agentMessage", text: "你好" }] } });
    f.emit("item/agentMessage/delta", { ...event, delta: "你好" });
    f.emit("item/agentMessage/delta", { ...event, threadId: "other", delta: "wrong" });
    assert.equal(state.messages.length, 1); assert.equal(state.messages[0].text, "你好");
});

test("完成通知未加载 items 时保留实时内容，再使用原生历史替换", async (t) => {
    const f = fixture(t); const state = await f.manager.connect(f.target);
    f.emit("item/agentMessage/delta", { threadId: "thread", turnId: "turn", itemId: "reply", delta: "你好" });
    f.setItems([{ id: "reply", type: "agentMessage", text: "你好" }]);
    f.emit("turn/completed", { threadId: "thread", turn: { id: "turn", status: "completed", itemsView: "notLoaded", items: [] } });
    assert.equal(state.messages[0].text, "你好");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.messages.length, 1); assert.equal(state.messages[0].text, "你好");
});

test("重启恢复同一个原生 thread，不重放首页请求", async (t) => {
    const f = fixture(t); await f.manager.connect(f.target);
    const id = crypto.randomUUID(); await f.manager.send(f.target, id, "hello");
    f.setTurns([{ id: "turn", status: "completed", items: [{ type: "userMessage", id: "user", clientId: id, content: [{ type: "text", text: "hello" }] }] }]);
    f.restart(); const state = await f.manager.connect(f.target);
    assert.equal(state.messages[0].text, "hello");
    await f.manager.send(f.target, id, "hello");
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 1);
    assert.equal(f.calls.filter((call) => call.method === "thread/resume").length, 1);
});

test("发送结果不确定时拒绝自动重试", async (t) => {
    const f = fixture(t); await f.manager.connect(f.target); f.failTurn();
    const id = crypto.randomUUID(); await assert.rejects(f.manager.send(f.target, id, "hello"), /transport lost/);
    await assert.rejects(f.manager.send(f.target, id, "hello"), /尚不确定/);
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 1);
});

test("会话默认模型、权限与指令跟随原生配置，不由桥接层写死", async (t) => {
    const f = fixture(t); await f.manager.connect(f.target);
    const start = f.calls.find((call) => call.method === "thread/start");
    assert.ok(start);
    for (const key of ["model", "approvalPolicy", "sandbox", "developerInstructions"]) assert.equal(start.params[key], undefined);
    assert.ok(start.params.config["mcp_servers.oioi-canvas"]);
});

test("网页模型选择传入 turn，未知模型在发起执行前被拒绝", async (t) => {
    const f = fixture(t); const state = await f.manager.connect(f.target);
    assert.ok(state.capabilities);
    state.capabilities.model = "current";
    state.capabilities.models = [{ id: "selected", name: "Selected", reasoningEfforts: [{ value: "high", label: "High" }], defaultReasoningEffort: "high" }];
    await assert.rejects(f.manager.send(f.target, crypto.randomUUID(), "bad", { model: "unknown" }), /不在当前运行时目录/);
    assert.equal(f.calls.filter((call) => call.method === "turn/start").length, 0);
    await f.manager.send(f.target, crypto.randomUUID(), "hello", { model: "selected", reasoningEffort: "high" });
    const turn = f.calls.find((call) => call.method === "turn/start");
    assert.equal(turn?.params.model, "selected");
    assert.equal(turn?.params.effort, "high");
    assert.equal(state.capabilities.model, "selected");
});

test("能力清单不随每条流式增量重复发送，重新连接仍返回完整能力", async (t) => {
    const f = fixture(t);
    const events: RpcParams[] = [];
    f.canvas.emitToClient = (_client, _event, payload) => { events.push(structuredClone(payload) as RpcParams); };
    await f.manager.connect(f.target);
    assert.ok(events.at(-1)?.capabilities);
    f.emit("item/agentMessage/delta", { threadId: "thread", turnId: "turn", itemId: "reply", delta: "hello" });
    assert.equal(events.at(-1)?.capabilities, undefined);
    await f.manager.connect(f.target);
    assert.ok(events.at(-1)?.capabilities);
});
