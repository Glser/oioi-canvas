import assert from "node:assert/strict";
import test from "node:test";
import { readCapabilities, inspectRuntime, resolveModelSelection } from "./capabilities.js";
import { RuntimeDiscovery } from "./runtimes.js";
import type { AgentTransport } from "./codex-rpc.js";

const secret = "never-send-this-credential";
function transport(): AgentTransport {
    return { close() {}, async request(method, params) {
        if (method === "account/read") return { account: { type: "chatgpt", email: "private@example.com", token: secret } };
        if (method === "config/read") return { config: { model: "custom-local", model_provider: "local-provider", model_reasoning_effort: "high", approval_policy: "on-request", sandbox_mode: "workspace-write", api_key: secret, model_providers: { local: { env: { TOKEN: secret } } } } };
        if (method === "model/list") return params.cursor ? { data: [{ model: "second", displayName: "Second", supportedReasoningEfforts: [], defaultReasoningEffort: null }], nextCursor: null } : { data: [{ model: "first", displayName: "First", supportedReasoningEfforts: [{ reasoningEffort: "low", description: "Low" }], defaultReasoningEffort: "low" }], nextCursor: "next" };
        if (method === "skills/list") return { data: [{ skills: [{ name: "canvas", description: "Edit canvas", enabled: true }], errors: [] }] };
        if (method === "mcpServerStatus/list") return { data: [{ name: "canvas", runtimeStatus: "ready", authStatus: "notLoggedIn", tools: { canvas_get_state: {} }, env: { SECRET: secret } }], nextCursor: null };
        throw new Error("Unexpected method");
    } };
}

test("能力投影保留真实配置和分页目录，不回传原始配置、账号或凭证", async () => {
    const result = await inspectRuntime(transport(), "D:/测试 空间");
    assert.equal(result.status, "ready");
    assert.equal(result.capabilities.model, "custom-local");
    assert.equal(result.capabilities.modelProvider, "local-provider");
    assert.deepEqual(result.capabilities.models.map((model) => model.id), ["first", "second"]);
    assert.deepEqual(result.capabilities.mcpServers[0].tools, ["canvas_get_state"]);
    assert.equal(JSON.stringify(result).includes(secret), false);
    assert.equal(JSON.stringify(result).includes("private@example.com"), false);
});

test("会话实际模型优先于本机默认，读取失败不捏造目录", async () => {
    const rpc = transport();
    const result = await readCapabilities(rpc, "D:/work", { thread: { id: "t" }, model: "session-model", modelProvider: "provider", reasoningEffort: "medium", approvalPolicy: "never", sandbox: { type: "readOnly" } });
    assert.equal(result.model, "session-model");
    assert.equal(result.defaults.model, "custom-local");
    assert.equal(result.approvalPolicy, "never");
    const failed = await readCapabilities({ close() {}, request: async () => { throw new Error(secret); } }, "D:/work", { thread: { id: "t" }, model: "session-model" });
    assert.equal(failed.model, "session-model");
    assert.equal(failed.models.length, 0);
    assert.equal(failed.errors.length, 4);
    assert.equal(JSON.stringify(failed).includes(secret), false);
});

test("模型选择只接受运行时目录或当前模型，默认不覆盖原生参数", async () => {
    const result = await inspectRuntime(transport(), "D:/work");
    assert.deepEqual(resolveModelSelection(result.capabilities, {}), {});
    assert.deepEqual(resolveModelSelection(result.capabilities, { model: "first" }), { model: "first", effort: "low" });
    assert.deepEqual(resolveModelSelection(result.capabilities, { model: "custom-local" }), { model: "custom-local" });
    assert.throws(() => resolveModelSelection(result.capabilities, { model: "invented" }), /不在当前运行时目录/);
    assert.throws(() => resolveModelSelection(result.capabilities, { model: "first", reasoningEffort: "high" }), /不受该模型支持/);
});

test("发现结果区分安装与适配，普通读取复用结果，手动检测刷新", async () => {
    let calls = 0;
    const discovery = new RuntimeDiscovery("D:/work", async (runtime) => {
        calls += 1;
        return { ...runtime, path: runtime.id === "opencode" ? null : `D:/tools/${runtime.command}.cmd`, version: "1.2.3", status: runtime.id === "opencode" ? "missing" : "detected" };
    });
    const first = await discovery.list();
    await discovery.list();
    assert.equal(calls, 4);
    assert.equal(first.runtimes.find((runtime) => runtime.id === "claude")?.supported, false);
    assert.equal(first.runtimes.find((runtime) => runtime.id === "codex")?.supported, true);
    await discovery.list(true);
    assert.equal(calls, 8);
});
