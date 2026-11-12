import type { AgentTransport, RpcParams } from "./codex-rpc.js";
import type { AgentCapabilities, AgentModelSelection, RuntimeInfo } from "./types.js";

const string = (value: unknown) => typeof value === "string" ? value : null;
const policy = (value: unknown) => string(value) || (value && typeof value === "object" ? "custom" : null);

/** 只投影网页需要的字段，禁止把原始 config、环境变量或账号信息直接返回浏览器。 */
export async function readCapabilities(rpc: AgentTransport, cwd: string, session: RpcParams): Promise<AgentCapabilities> {
    const result: AgentCapabilities = {
        runtimeId: "codex", model: string(session.model), modelProvider: string(session.modelProvider), reasoningEffort: string(session.reasoningEffort),
        approvalPolicy: policy(session.approvalPolicy), sandbox: string(session.sandbox?.type),
        defaults: { model: null, reasoningEffort: null, approvalPolicy: null, sandbox: null }, models: [], skills: [], mcpServers: [], errors: [],
    };
    const read = async (name: string, task: () => Promise<void>) => {
        try { await task(); }
        catch { result.errors.push(`${name}读取失败，可重新检测；不会使用猜测数据。`); }
    };
    await Promise.all([
        read("本地配置", async () => {
            const { config } = await rpc.request("config/read", { cwd, includeLayers: false });
            if (!session.thread?.id) { result.model = string(config.model); result.modelProvider = string(config.model_provider); result.reasoningEffort = string(config.model_reasoning_effort); result.approvalPolicy = policy(config.approval_policy); result.sandbox = string(config.sandbox_mode); }
            result.defaults = { model: string(config.model), reasoningEffort: string(config.model_reasoning_effort), approvalPolicy: policy(config.approval_policy), sandbox: string(config.sandbox_mode) };
        }),
        read("模型目录", async () => {
            const models: AgentCapabilities["models"] = [];
            let cursor: string | null = null;
            do {
                const page = await rpc.request("model/list", { cursor, includeHidden: false });
                for (const model of page.data) {
                    if (model.hidden) continue;
                    models.push({ id: model.model, name: model.displayName || model.model, reasoningEfforts: (model.supportedReasoningEfforts || []).map((effort: RpcParams) => ({ value: effort.reasoningEffort, label: effort.description || effort.reasoningEffort })), defaultReasoningEffort: string(model.defaultReasoningEffort) });
                }
                cursor = page.nextCursor;
            } while (cursor);
            result.models = models;
        }),
        read("Skills", async () => {
            const response = await rpc.request("skills/list", { cwds: [cwd], forceReload: true });
            result.skills = response.data.flatMap((entry: RpcParams) => entry.skills.map((skill: RpcParams) => ({ name: skill.name, description: skill.description || "", enabled: skill.enabled !== false })));
            if (response.data.some((entry: RpcParams) => entry.errors?.length)) result.errors.push("部分 Skills 加载失败，请检查本机配置。");
        }),
        read("MCP", async () => {
            const servers: AgentCapabilities["mcpServers"] = [];
            let cursor: string | null = null;
            do {
                const page = await rpc.request("mcpServerStatus/list", { threadId: session.thread?.id, cursor, detail: "toolsAndAuthOnly" });
                for (const server of page.data) servers.push({ name: server.name, status: string(server.runtimeStatus), authStatus: server.authStatus, tools: Object.keys(server.tools || {}) });
                cursor = page.nextCursor;
            } while (cursor);
            result.mcpServers = servers;
        }),
    ]);
    return result;
}

/** 目录不包含自定义模型时仍可沿用当前模型，但不猜测其他可选模型。 */
export function resolveModelSelection(capabilities: AgentCapabilities | null, selection: AgentModelSelection) {
    const model = selection.model?.trim();
    const effort = selection.reasoningEffort?.trim();
    const selected = capabilities?.models.find((entry) => entry.id === (model || capabilities.model));
    if (model && model !== capabilities?.model && !selected) throw new Error("所选模型不在当前运行时目录中，请重新检测");
    if (effort && !selected?.reasoningEfforts.some((entry) => entry.value === effort)) throw new Error("所选推理强度不受该模型支持，请重新选择");
    const nextEffort = effort || (model && model !== capabilities?.model ? selected?.defaultReasoningEffort : undefined);
    return { ...(model ? { model } : {}), ...(nextEffort ? { effort: nextEffort } : {}) };
}

/** 无需创建对话即可读取本机默认能力；认证结果只暴露状态，不返回账号或凭证。 */
export async function inspectRuntime(rpc: AgentTransport, cwd: string): Promise<RuntimeInfo> {
    const [account, capabilities] = await Promise.all([rpc.request("account/read", { refreshToken: false }), readCapabilities(rpc, cwd, {})]);
    return { runtimeId: "codex", status: account.account || account.requiresOpenaiAuth === false ? "ready" : "needsAuth", capabilities };
}
