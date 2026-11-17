import { create } from "zustand";
import localforage from "localforage";
import i18n from "@/i18n";
import { useAgentStore } from "./use-agent-store";
import { callAgentSession, postState, type AgentConversation, type AgentConversationUpdate, type AgentAnswer, type AgentModelSelection, type AgentPermissionMode, type AgentRuntimeId } from "@/services/api/canvas-agent";

type PendingMessage = { id: string; projectId: string; canvasProjectId: string; conversationId?: string; text: string; phase: "queued" | "sending"; endpoint?: string; selection?: AgentModelSelection };
const drafts = localforage.createInstance({ name: "oioi-canvas", storeName: "agent_pending_messages" });
let activation = 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const text = (key: string) => i18n.t(`agent.conversation.${key}`);

type ChatStore = {
    projectId: string;
    runtimeId: AgentRuntimeId;
    selectRuntime: (runtimeId: AgentRuntimeId) => Promise<void>;
    selection: AgentModelSelection;
    setSelection: (selection: AgentModelSelection) => void;
    refreshCapabilities: () => Promise<void>;
    setPermissions: (mode: AgentPermissionMode) => Promise<void>;
    conversation: AgentConversation | null;
    pending: PendingMessage | null;
    connecting: boolean;
    submitting: boolean;
    error: string;
    queue: (projectId: string, value: string, canvasProjectId?: string) => Promise<void>;
    activate: (projectId: string) => Promise<void>;
    openConversation: (options?: { id?: string; cwd?: string; runtimeId?: AgentRuntimeId }) => Promise<void>;
    receive: (state: AgentConversationUpdate) => void;
    submit: () => Promise<void>;
    discard: () => Promise<void>;
    answer: (answer: AgentAnswer) => Promise<void>;
    interrupt: () => Promise<void>;
};

export const useAgentChatStore = create<ChatStore>((set, get) => ({
    projectId: "", selection: {}, setSelection: (selection) => set({ selection }), conversation: null, pending: null, connecting: false, submitting: false, error: "",
    runtimeId: "codex",
    selectRuntime: async (runtimeId) => {
        if (get().pending || get().connecting || get().submitting || get().conversation?.turnId || get().conversation?.requests.length) throw new Error(i18n.t("agent.sessions.busy"));
        if (!useAgentStore.getState().connected) { set({ runtimeId, selection: {} }); return; }
        await get().openConversation({ runtimeId });
    },
    queue: async (projectId, value, canvasProjectId = useAgentStore.getState().canvasContext?.snapshot.projectId || "") => {
        const current = activation;
        const existing = await drafts.getItem<PendingMessage>(projectId);
        if (existing) throw new Error(text("pendingExists"));
        if (get().projectId === projectId && (get().connecting || current !== activation || get().pending || get().submitting || get().conversation?.turnId || get().conversation?.requests.length)) throw new Error(i18n.t("agent.sessions.busy"));
        const pending: PendingMessage = { id: crypto.randomUUID(), projectId, canvasProjectId, conversationId: get().projectId === projectId ? get().conversation?.conversationId : undefined, text: value, phase: "queued", selection: { ...get().selection } };
        if (get().projectId === projectId) set({ pending });
        try { await drafts.setItem(projectId, pending); }
        catch (error) { if (get().pending?.id === pending.id) set({ pending: null }); throw error; }
    },
    activate: async (projectId) => {
        const current = ++activation;
        set({ projectId, selection: {}, conversation: null, pending: null, error: "", connecting: true, submitting: false });
        try {
            const pending = await drafts.getItem<PendingMessage>(projectId);
            if (current !== activation) return;
            set({ pending });
            const { url, token, connected, clientId, canvasContext } = useAgentStore.getState();
            if (!connected) return;
            if (!await postState(url, token, clientId, canvasContext?.snapshot || null)) throw new Error(text("snapshotFailed"));
            const conversation = await callAgentSession(url, token, "connect", { clientId, projectId }, { runtimeId: get().runtimeId });
            if (current !== activation) return;
            set({ connecting: false, conversation: null });
            get().receive(conversation);
            if (pending?.conversationId && pending.conversationId !== conversation.conversationId) { set({ error: i18n.t("agent.sessions.pendingDifferent") }); return; }
            if (pending && conversation.submissions[pending.id]?.status === "accepted") await get().discard();
            else if (pending?.phase === "queued" && pending.canvasProjectId === (useAgentStore.getState().canvasContext?.snapshot.projectId || "")) await get().submit();
            else if (pending?.phase === "queued") set({ error: text("targetChanged") });
            else if (pending) set({ error: text("uncertain") });
        } catch (error) {
            if (current === activation) set({ error: errorText(error) });
        } finally {
            if (current === activation) set({ connecting: false });
        }
    },
    openConversation: async (options = {}) => {
        const { projectId, conversation, pending, connecting, submitting } = get();
        if (pending) throw new Error(text("pendingExists"));
        if ((!conversation && !options.runtimeId) || connecting || submitting || conversation?.turnId || conversation?.requests.length || conversation?.status === "running" || conversation?.status === "waiting") throw new Error(i18n.t("agent.sessions.busy"));
        const { url, token, clientId, connected } = useAgentStore.getState();
        if (!connected) throw new Error(text("offline"));
        const current = ++activation;
        set({ connecting: true, error: "" });
        try {
            const next = await callAgentSession(url, token, "open", { clientId, projectId, conversationId: conversation?.conversationId }, options);
            if (current === activation) {
                set({ conversation: null, connecting: false, selection: {} });
                get().receive(next);
            }
        } catch (error) {
            if (current === activation) set({ error: errorText(error) });
            throw error;
        } finally { if (current === activation) set({ connecting: false }); }
    },
    receive: (conversation) => {
        if (conversation.projectId !== get().projectId) return;
        const previous = get().conversation;
        if (previous && previous.conversationId !== conversation.conversationId) return;
        if (previous?.instanceId === conversation.instanceId && previous.revision > conversation.revision) return;
        set({ runtimeId: conversation.runtimeId, conversation: { ...conversation, capabilities: conversation.capabilities !== undefined ? conversation.capabilities : previous?.instanceId === conversation.instanceId ? previous.capabilities : null } });
    },
    submit: async () => {
        const { pending, submitting, conversation, projectId } = get();
        const { url, token, clientId, connected } = useAgentStore.getState();
        if (!pending || submitting || get().connecting || !connected || !conversation || conversation.turnId || conversation.requests.length) return;
        const current = activation;
        if (pending.conversationId ? pending.conversationId !== conversation.conversationId : pending.phase === "sending") { set({ error: i18n.t("agent.sessions.pendingDifferent") }); return; }
        if (pending.endpoint && pending.endpoint !== url) { set({ error: text("endpointChanged") }); return; }
        set({ submitting: true, error: "" });
        try {
            const snapshot = useAgentStore.getState().canvasContext?.snapshot || null;
            if (pending.canvasProjectId !== (snapshot?.projectId || "")) throw new Error(text("targetChanged"));
            if (!await postState(url, token, clientId, snapshot)) throw new Error(text("snapshotFailed"));
            if (current !== activation) return;
            if (pending.canvasProjectId !== (useAgentStore.getState().canvasContext?.snapshot.projectId || "")) throw new Error(text("targetChanged"));
            const sending: PendingMessage = { ...pending, conversationId: conversation.conversationId, phase: "sending", endpoint: url };
            await drafts.setItem(projectId, sending);
            if (current === activation) set({ pending: sending });
            if (current !== activation) return;
            const next = await callAgentSession(url, token, "send", { clientId, projectId, conversationId: conversation.conversationId }, { submissionId: pending.id, text: pending.text, canvasProjectId: pending.canvasProjectId, ...pending.selection });
            if (next.submissions[pending.id]?.status === "accepted") {
                const saved = await drafts.getItem<PendingMessage>(projectId);
                if (saved?.id === pending.id) await drafts.removeItem(projectId);
                if (current === activation) set({ pending: null });
            }
            if (current === activation) get().receive(next);
        } catch (error) {
            if (current === activation) set({ error: errorText(error) });
        } finally {
            if (current === activation) set({ submitting: false });
        }
    },
    discard: async () => {
        const { projectId, pending } = get();
        if (!pending) return;
        await drafts.removeItem(projectId);
        if (get().pending?.id === pending.id) set({ pending: null, error: "" });
    },
    answer: async (answer) => {
        const current = activation;
        const { url, token, clientId } = useAgentStore.getState();
        try {
            const next = await callAgentSession(url, token, "answer", { clientId, projectId: get().projectId, conversationId: get().conversation?.conversationId }, answer);
            if (current === activation) { get().receive(next); set({ error: "" }); }
        } catch (error) { if (current === activation) set({ error: errorText(error) }); throw error; }
    },
    setPermissions: async (mode) => {
        const current = activation;
        const { url, token, clientId } = useAgentStore.getState();
        const next = await callAgentSession(url, token, "permissions", { clientId, projectId: get().projectId, conversationId: get().conversation?.conversationId }, { mode });
        if (current === activation) { get().receive(next); set({ error: "" }); }
    },
    refreshCapabilities: async () => {
        const current = activation;
        const { url, token, clientId, connected } = useAgentStore.getState();
        if (!connected || !get().conversation) return;
        try {
            const next = await callAgentSession(url, token, "capabilities", { clientId, projectId: get().projectId, conversationId: get().conversation?.conversationId });
            if (current === activation) get().receive(next);
        } catch (error) { if (current === activation) set({ error: errorText(error) }); }
    },
    interrupt: async () => {
        const current = activation;
        const { url, token, clientId } = useAgentStore.getState();
        try {
            const next = await callAgentSession(url, token, "interrupt", { clientId, projectId: get().projectId, conversationId: get().conversation?.conversationId });
            if (current === activation) get().receive(next);
        } catch (error) { if (current === activation) set({ error: errorText(error) }); }
    },
}));
