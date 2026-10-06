import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import assert from "node:assert/strict";
import test from "node:test";

import { CanvasSession } from "./session.js";

test("未绑定时拒绝业务工具，目标列表不自动选择焦点页", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState({ ...snapshot("canvas-first"), path: "/canvas/canvas-first", pageTitle: "页面" }, "first");
    const list = session.listClients("mcp-1");
    assert.equal(list.binding, null);
    assert.equal(list.clients[0].path, "/canvas/canvas-first");
    await assert.rejects(session.callTool("canvas_get_state", {}, "mcp-1"), /尚未绑定/);
    await assert.rejects(session.callTool("canvas_list_clients", {}, undefined), /bindingId/);
});

test("独立 MCP 绑定不受焦点影响，读取使用 canvas_get_state SSE", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("mcp-1", "first", "canvas-first");
    session.bindClient("mcp-2", "second", "canvas-second");
    session.activateClient("second");

    const result = session.callTool("canvas_get_state", {}, "mcp-1");
    const call = first.event("tool_call");
    assert.equal(field(call, "name"), "canvas_get_state");
    assert.equal(field(call, "clientId"), "first");
    assert.equal(field(call, "expectedProjectId"), "canvas-first");
    assert.equal(second.event("tool_call"), undefined);
    session.resolveResult("first", { requestId: String(field(call, "requestId")), result: snapshot("canvas-first") });
    assert.equal(field(await result, "projectId"), "canvas-first");
    assert.deepEqual(session.listClients("mcp-2").binding, { clientId: "second", projectId: "canvas-second" });
    session.releaseClient("mcp-1");
    await assert.rejects(session.callTool("canvas_get_state", {}, "mcp-1"), /尚未绑定/);
});

test("写操作与结果按 clientId 隔离，成功快照立即用于后续布局", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.updateState({ ...snapshot("canvas-first"), path: "/canvas/canvas-first", pageTitle: "页面" }, "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("mcp-1", "first");
    session.activateClient("second");
    const result = session.callTool("canvas_create_text_node", { text: "bound" }, "mcp-1");
    const call = first.event("tool_call");
    const requestId = String(field(call, "requestId"));
    assert.equal(field(call, "name"), "canvas_apply_ops");
    assert.equal(second.event("tool_call"), undefined);
    assert.equal(session.resolveResult("second", { requestId, result: { ok: true } }), false);
    const updated = { ...snapshot("canvas-first"), nodes: [{ id: "node-1", type: "text" as const, position: { x: 100, y: 0 }, width: 200, height: 100 }] };
    session.resolveResult("first", { requestId, result: updated });
    await result;
    assert.equal(session.listClients("mcp-1").clients[0].pageTitle, "页面");
    const next = session.callTool("canvas_create_text_node", { text: "next" }, "mcp-1");
    const nextCall = first.events("tool_call")[1];
    const input = field(nextCall, "input") as { ops: Array<{ position: { x: number } }> };
    assert.equal(input.ops[0].position.x, 380);
    session.resolveResult("first", { requestId: String(field(nextCall, "requestId")), result: updated });
    await next;
});

test("页内切换画布后拒绝旧绑定的读写与画布任务查询", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState(snapshot("old"), "first");
    session.bindClient("mcp-1", "first", "old");
    session.updateState(snapshot("new"), "first");
    await assert.rejects(session.callTool("canvas_get_state", {}, "mcp-1"), /切换画布/);
    await assert.rejects(session.callTool("canvas_create_text_node", { text: "wrong" }, "mcp-1"), /切换画布/);
    await assert.rejects(session.callTool("generation_get_status", { scope: "all" }, "mcp-1"), /切换画布/);
    assert.throws(() => session.bindClient("mcp-1", "first", "old"), /已改变/);
    assert.equal(first.event("tool_call"), undefined);
    assert.deepEqual(session.bindClient("mcp-1", "first", "new"), { clientId: "first", projectId: "new" });
});

test("断开绑定网页拒绝在途请求，不回退其他标签；重连仍核对原画布", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    const second = connect(session, "second");
    t.after(() => { first.close(); second.close(); });
    session.updateState(snapshot("canvas-first"), "first");
    session.updateState(snapshot("canvas-second"), "second");
    session.bindClient("mcp-1", "first");
    const result = session.callTool("canvas_create_text_node", { text: "pending" }, "mcp-1");
    first.close();
    await assert.rejects(result, /断开/);
    await assert.rejects(session.callTool("canvas_get_state", {}, "mcp-1"), /断开/);
    assert.equal(second.event("tool_call"), undefined);
    const reconnected = connect(session, "first");
    t.after(() => reconnected.close());
    session.updateState(snapshot("different"), "first");
    await assert.rejects(session.callTool("canvas_get_state", {}, "mcp-1"), /切换画布/);
});

test("替换相同 clientId 连接清除旧快照，旧连接关闭不移除新连接", (t) => {
    const session = new CanvasSession();
    const old = connect(session, "first");
    session.updateState(snapshot("old"), "first");
    const current = connect(session, "first");
    t.after(() => { old.close(); current.close(); });
    assert.throws(() => session.bindClient("mcp-1", "first"), /尚未上报/);
    old.close();
    session.updateState(snapshot("new"), "first");
    assert.deepEqual(session.bindClient("mcp-1", "first"), { clientId: "first", projectId: "new" });
});

test("任务查询仅在包含画布时附 expectedProjectId，非画布页使用空 ID", async (t) => {
    const session = new CanvasSession();
    const first = connect(session, "first");
    t.after(() => first.close());
    session.updateState({ hasCanvas: false, path: "/image" }, "first");
    session.bindClient("mcp-1", "first");
    for (const [input, expected] of [[{ scope: "all" }, ""], [{ scope: "image" }, undefined], [{ taskId: "task-1" }, undefined]] as const) {
        const result = session.callTool("generation_get_status", input, "mcp-1");
        const call = first.events("tool_call").at(-1);
        assert.equal(field(call, "expectedProjectId"), expected);
        session.resolveResult("first", { requestId: String(field(call, "requestId")), result: { tasks: [] } });
        await result;
    }
});

function connect(session: CanvasSession, clientId: string) {
    const response = new FakeSseResponse();
    session.openEvents(new URL(`http://127.0.0.1/events?clientId=${clientId}`), response as unknown as ServerResponse);
    return response;
}

function snapshot(projectId: string) {
    return { projectId, title: projectId, nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
}

function field(value: unknown, key: string) {
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

class FakeSseResponse extends EventEmitter {
    private chunks: string[] = [];
    writeHead() { return this; }
    write(chunk: string) { this.chunks.push(chunk); return true; }
    end() { this.close(); }
    event(type: string) { return this.events(type)[0]; }
    events(type: string) {
        return this.chunks.flatMap((chunk) => {
            if (!chunk.startsWith(`event: ${type}\n`)) return [];
            const data = chunk.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
            return data ? [JSON.parse(data) as unknown] : [];
        });
    }
    close() { this.emit("close"); }
}
