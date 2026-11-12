export const AGENT_PROTOCOL_VERSION = 11;

/** 网页与本地服务共享的对话视图；历史正文由原生 Agent 保存。 */
export type AgentMessage = { threadId: string; turnId: string; itemId: string; role: "user" | "assistant" | "tool"; text: string; status?: string };
export type AgentQuestion = { id: string; header: string; question: string; isSecret?: boolean; options?: { label: string; description: string }[] | null };
export type AgentInputValue = string | number | boolean | string[];
export type AgentFormField = { type: string; title?: string; description?: string; default?: AgentInputValue; enum?: string[]; enumNames?: string[]; oneOf?: { const: string; title: string }[]; items?: { enum?: string[]; anyOf?: { const: string; title: string }[] } };
export type AgentRequest = { id: string; threadId: string; turnId: string; itemId: string; kind: "approval" | "input" | "elicitation"; title: string; detail: string; questions?: AgentQuestion[]; form?: { properties: Record<string, AgentFormField>; required?: string[] }; url?: string; unsupported?: boolean };
export type AgentSubmission = { status: "sending" | "accepted" | "uncertain"; turnId?: string };
export type AgentPermissionMode = "runtime" | "request" | "readOnly" | "fullAccess";
export type AgentTokenUsage = { usedTokens: number; totalTokens: number; modelContextWindow: number | null };
export type AgentConversation = {
    instanceId: string;
    revision: number;
    projectId: string;
    conversationId: string;
    threadId: string;
    cwd: string;
    capabilities: AgentCapabilities | null;
    permissionMode: AgentPermissionMode;
    tokenUsage: AgentTokenUsage | null;
    status: "ready" | "running" | "waiting" | "error";
    turnId: string | null;
    messages: AgentMessage[];
    requests: AgentRequest[];
    submissions: Record<string, AgentSubmission>;
    error: string;
};
export type AgentConversationSummary = { id: string; title: string; cwd: string };
export type AgentDirectory = { path: string; parent: string | null; directories: { name: string; path: string }[] };
export type AgentAnswer = { requestId: string; decision?: "accept" | "decline"; answers?: Record<string, string>; content?: Record<string, AgentInputValue> };

export type DetectedRuntime = { id: string; name: string; command: string; path: string | null; version: string | null; supported: boolean; status: "detected" | "missing" | "error"; error?: string };
export type RuntimeCatalog = { machine: string; platform: string; arch: string; cwd: string; runtimes: DetectedRuntime[] };
export type AgentModel = { id: string; name: string; reasoningEfforts: { value: string; label: string }[]; defaultReasoningEffort: string | null };
export type AgentModelSelection = { model?: string; reasoningEffort?: string };
export type AgentCapabilities = {
    runtimeId: "codex";
    model: string | null;
    modelProvider: string | null;
    reasoningEffort: string | null;
    approvalPolicy: string | null;
    approvalsReviewer: string | null;
    sandbox: string | null;
    defaults: { model: string | null; reasoningEffort: string | null; approvalPolicy: string | null; sandbox: string | null };
    models: AgentModel[];
    skills: { name: string; description: string; enabled: boolean }[];
    mcpServers: { name: string; status: string | null; authStatus: string; tools: string[] }[];
    errors: string[];
};

export type RuntimeInfo = { runtimeId: "codex"; status: "ready" | "needsAuth"; capabilities: AgentCapabilities };

/** 实时快照仅在能力发生变化时附带目录，避免逐 token 重发 Skills/MCP 清单。 */
export type AgentConversationUpdate = Omit<AgentConversation, "capabilities"> & { capabilities?: AgentCapabilities | null };
