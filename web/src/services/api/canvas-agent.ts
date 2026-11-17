import i18n from "@/i18n";
import { AGENT_PROTOCOL_VERSION } from "../../../../canvas-agent/src/agent/types";
import type { CanvasAgentSnapshot } from "@/lib/canvas/canvas-agent-ops";

export class AgentApiError<T = unknown> extends Error {
    constructor(readonly status: number, readonly response: T & { code?: string; error?: string; msg?: string }) {
        super(response.error || response.msg || i18n.t("agent.state.requestFailed"));
        this.name = "AgentApiError";
    }
}

export async function postState(endpoint: string, token: string, clientId: string, snapshot: CanvasAgentSnapshot | null) {
    try {
        const response = await fetch(`${endpoint}/canvas/state?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...(snapshot ? { ...snapshot, hasCanvas: true } : { hasCanvas: false }), path: window.location.pathname, pageTitle: document.title }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function activateAgentClient(endpoint: string, token: string, clientId: string) {
    try {
        await fetch(`${endpoint}/canvas/activate?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`, { method: "POST" });
    } catch {}
}

export async function postToolResult(endpoint: string, token: string, clientId: string, body: { requestId: string; result?: unknown; error?: string }) {
    await fetchAgentJson(endpoint, token, `/canvas/result?clientId=${encodeURIComponent(clientId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function fetchAgentJson<T>(endpoint: string, token: string, path: string, init?: RequestInit) {
    const url = `${endpoint}${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    const res = await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; msg?: string };
    if (!res.ok) throw new AgentApiError(res.status, data);
    return data;
}


export { AGENT_PROTOCOL_VERSION } from "../../../../canvas-agent/src/agent/types";
export type { AgentConversation, AgentConversationUpdate, AgentConversationSummary, AgentDirectory, AgentRequest, AgentAnswer, AgentInputValue, AgentCapabilities, AgentModelSelection, AgentPermissionMode, AgentRuntimeId, DetectedRuntime, RuntimeCatalog, RuntimeInfo } from "../../../../canvas-agent/src/agent/types";
import type { AgentConversation, AgentConversationSummary, AgentDirectory, AgentAnswer, AgentModelSelection, AgentPermissionMode, AgentRuntimeId, RuntimeCatalog, RuntimeInfo } from "../../../../canvas-agent/src/agent/types";

export function callAgentSession(endpoint: string, token: string, action: "connect" | "open" | "send" | "interrupt" | "answer" | "capabilities" | "permissions", target: { clientId: string; projectId: string; conversationId?: string }, input: ({ submissionId?: string; text?: string; canvasProjectId?: string } & AgentModelSelection) | AgentAnswer | { mode: AgentPermissionMode } | { id?: string; cwd?: string; runtimeId?: AgentRuntimeId } = {}) {
    return fetchAgentJson<AgentConversation>(endpoint, token, `/agent/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...target, ...input }) });
}

export function fetchAgentConversations(endpoint: string, token: string, target: { clientId: string; projectId: string }) {
    return fetchAgentJson<AgentConversationSummary[]>(endpoint, token, "/agent/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(target) });
}

export function fetchAgentDirectories(endpoint: string, token: string, target: { clientId: string; projectId: string }, path?: string) {
    return fetchAgentJson<AgentDirectory>(endpoint, token, "/agent/directories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...target, path }) });
}

export function localConnectorCommand(origin = window.location.origin) {
    return `npx -y @oioi-npm/canvas-agent@latest install --origin ${origin}`;
}

// 连接器是通用的：一次安装会自动发现本机所有已安装的 Agent，提示词不绑定具体运行时；
// 仅在针对某个运行时（未检测到 / 需登录）时通过 runtimeNote 附加说明。
export function localConnectorInstructions(runtimeNote?: string) {
    const base = i18n.t("agent.connectionGuide.instructions", { command: localConnectorCommand(), protocol: AGENT_PROTOCOL_VERSION });
    return runtimeNote ? `${base}\n${i18n.t("agent.connectionGuide.runtimeNote", { runtime: runtimeNote })}` : base;
}

export async function bootstrapAgent(endpoint: string) {
    const response = await fetch(`${endpoint}/bootstrap`, { method: "POST", headers: { "content-type": "application/json" } });
    const data = await response.json() as { token?: string; url?: string; error?: string };
    if (!response.ok || !data.token) throw new Error(data.error || i18n.t("agent.connect.pairFailed"));
    return data.token;
}

export async function pairAgent(endpoint: string, pairCode: string) {
    const response = await fetch(`${endpoint}/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pairCode }) });
    const data = await response.json() as { token?: string; error?: string };
    if (!response.ok || !data.token) throw new Error(data.error || i18n.t("agent.connect.pairFailed"));
    return data.token;
}

export function fetchAgentRuntimes(endpoint: string, token: string, refresh = false) {
    return fetchAgentJson<RuntimeCatalog>(endpoint, token, `/agent/runtimes?refresh=${refresh}`);
}

export async function probeAgentService(endpoint: string, expectedProtocolVersion: number): Promise<{ status: "running" | "stopped" | "outdated"; protocolVersion?: number }> {
    const base = endpoint.trim().replace(/\/$/, "") || "http://127.0.0.1:17371";
    try {
        const response = await fetch(`${base}/config`, { signal: AbortSignal.timeout(2000) });
        if (!response.ok) return { status: "stopped" };
        const data = await response.json() as { protocolVersion?: number };
        if (data.protocolVersion !== expectedProtocolVersion) return { status: "outdated", protocolVersion: data.protocolVersion };
        return { status: "running", protocolVersion: data.protocolVersion };
    } catch { return { status: "stopped" }; }
}

export function fetchAgentRuntimeInfo(endpoint: string, token: string, runtimeId: AgentRuntimeId) {
    return fetchAgentJson<RuntimeInfo>(endpoint, token, `/agent/runtime-info?runtimeId=${runtimeId}`);
}
