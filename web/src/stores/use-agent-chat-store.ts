import { create } from "zustand";
import localforage from "localforage";
import i18n from "@/i18n";
import { useAgentStore } from "./use-agent-store";
import { callAgentSession, postState, type AgentConversation, type AgentConversationUpdate, type AgentAnswer, type AgentModelSelection } from "@/services/api/canvas-agent";

type PendingMessage = { id: string; projectId: string; text: string; phase: "queued" | "sending"; endpoint?: string; selection?: AgentModelSelection };
const drafts = localforage.createInstance({ name: "oioi-canvas", storeName: "agent_pending_messages" });
let activation = 0;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const text = (key: string) => i18n.t(`agent.conversation.${key}`);

type ChatStore = {
    projectId: string;
    selection: AgentModelSelection;
    setSelection: (selection: AgentModelSelection) => void;
    refreshCapabilities: () => Promise<void>;
    conversation: AgentConversation | null;
    pending: PendingMessage | null;
    connecting: boolean;
    submitting: boolean;
    error: string;
    queue: (projectId: string, value: string) => Promise<void>;
    activate: (projectId: string) => Promise<void>;
    receive: (state: AgentConversationUpdate) => void;
    submit: () => Promise<void>;
    discard: () => Promise<void>;
    answer: (answer: AgentAnswer) => Promise<void>;
    interrupt: () => Promise<void>;
};

export const useAgentChatStore = create<ChatStore>((set, get) => ({
    projectId: "", selection: {}, setSelection: (selection) => set({ selection }), conversation: null, pending: null, connecting: false, submitting: false, error: "",
    queue: async (projectId, value) => {
        const existing = await drafts.getItem<PendingMessage>(projectId);
        if (existing) throw new Error(text("pendingExists"));
        const pending: PendingMessage = { id: crypto.randomUUID(), projectId, text: value, phase: "queued", selection: { ...get().selection } };
        await drafts.setItem(projectId, pending);
        if (get().projectId === projectId) set({ pending });
    },
    activate: async (projectId) => {
        const current = ++activation;
        set({ projectId, selection: {}, conversation: null, pending: null, error: "", connecting: Boolean(projectId), submitting: false });
        if (!projectId) return;
        try {
            const pending = await drafts.getItem<PendingMessage>(projectId);
            if (current !== activation) return;
            set({ pending });
            const { url, token, connected, clientId, canvasContext } = useAgentStore.getState();
            if (!connected || canvasContext?.snapshot.projectId !== projectId) return;
            if (!await postState(url, token, clientId, canvasContext.snapshot)) throw new Error(text("snapshotFailed"));
            const conversation = await callAgentSession(url, token, "connect", { clientId, projectId });
            if (current !== activation) return;
            get().receive(conversation);
            set({ connecting: false });
            if (pending && conversation.submissions[pending.id]?.status === "accepted") await get().discard();
            else if (pending?.phase === "queued") await get().submit();
            else if (pending) set({ error: text("uncertain") });
        } catch (error) {
            if (current === activation) set({ error: errorText(error) });
        } finally {
            if (current === activation) set({ connecting: false });
        }
    },
    receive: (conversation) => {
        if (conversation.projectId !== get().projectId) return;
        const previous = get().conversation;
        if (previous?.instanceId === conversation.instanceId && previous.revision > conversation.revision) return;
        set({ conversation: { ...conversation, capabilities: conversation.capabilities !== undefined ? conversation.capabilities : previous?.instanceId === conversation.instanceId ? previous.capabilities : null } });
    },
    submit: async () => {
        const { pending, submitting, conversation, projectId } = get();
        const { url, token, clientId, connected } = useAgentStore.getState();
        if (!pending || submitting || !connected || !conversation) return;
        const current = activation;
        if (pending.endpoint && pending.endpoint !== url) { set({ error: text("endpointChanged") }); return; }
        set({ submitting: true, error: "" });
        try {
            const sending: PendingMessage = { ...pending, phase: "sending", endpoint: url };
            await drafts.setItem(projectId, sending);
            if (current === activation) set({ pending: sending });
            const next = await callAgentSession(url, token, "send", { clientId, projectId }, { submissionId: pending.id, text: pending.text, ...pending.selection });
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
            const next = await callAgentSession(url, token, "answer", { clientId, projectId: get().projectId }, answer);
            if (current === activation) { get().receive(next); set({ error: "" }); }
        } catch (error) { if (current === activation) set({ error: errorText(error) }); }
    },
    refreshCapabilities: async () => {
        const current = activation;
        const { url, token, clientId, connected } = useAgentStore.getState();
        if (!connected || !get().conversation) return;
        try {
            const next = await callAgentSession(url, token, "capabilities", { clientId, projectId: get().projectId });
            if (current === activation) get().receive(next);
        } catch (error) { if (current === activation) set({ error: errorText(error) }); }
    },
    interrupt: async () => {
        const current = activation;
        const { url, token, clientId } = useAgentStore.getState();
        try {
            const next = await callAgentSession(url, token, "interrupt", { clientId, projectId: get().projectId });
            if (current === activation) get().receive(next);
        } catch (error) { if (current === activation) set({ error: errorText(error) }); }
    },
}));
