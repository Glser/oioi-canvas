import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Modal, Tooltip, theme } from "antd";
import { ArrowRight, ArrowUp, Check, Folder, HardDrive, LoaderCircle, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAgentStore } from "@/stores/use-agent-store";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { fetchAgentConversations, fetchAgentDirectories, type AgentConversationSummary, type AgentDirectory } from "@/services/api/canvas-agent";

export function AgentSessionDialog({ mode, onClose }: { mode: "history" | "directory"; onClose: () => void }) {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const { url, token: credential, clientId } = useAgentStore();
    const { projectId, conversation, pending, connecting, submitting, openConversation } = useAgentChatStore();
    const [sessions, setSessions] = useState<AgentConversationSummary[]>([]);
    const [directory, setDirectory] = useState<AgentDirectory | null>(null);
    const [path, setPath] = useState("");
    const [loading, setLoading] = useState(true);
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState("");
    const request = useRef(0);
    const busy = opening || connecting || submitting || Boolean(pending || conversation?.turnId || conversation?.requests.length);
    const load = useCallback(async (path?: string) => {
        const current = ++request.current;
        setLoading(true);
        setError("");
        try {
            if (mode === "history") {
                const rows = await fetchAgentConversations(url, credential, { clientId, projectId });
                if (current === request.current) setSessions(rows);
            } else {
                const next = await fetchAgentDirectories(url, credential, { clientId, projectId }, path);
                if (current === request.current) { setDirectory(next); setPath(next.path); }
            }
        } catch (error) { if (current === request.current) setError(error instanceof Error ? error.message : String(error)); }
        finally { if (current === request.current) setLoading(false); }
    }, [mode, url, credential, clientId, projectId]);
    useEffect(() => { void load(); return () => { request.current += 1; }; }, [load]);
    const open = async (id?: string) => {
        setOpening(true);
        setError("");
        try {
            await openConversation(id ? { id } : { cwd: path.trim() });
            message.success(t(id ? "agent.sessions.switched" : "agent.sessions.created"));
            onClose();
        } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
        finally { setOpening(false); }
    };
    return <Modal open centered width={560} title={t(`agent.sessions.${mode}`)} onCancel={onClose} closable={!opening} keyboard={!opening} mask={{ closable: !opening }}
        styles={{ body: { display: "flex", flexDirection: "column", gap: 12, minHeight: 0, maxHeight: "min(560px, calc(100dvh - 220px))", overflow: "hidden" } }}
        footer={mode === "directory" ? <div className="flex flex-wrap justify-end gap-2"><Button type="text" disabled={opening} onClick={onClose}>{t("agent.sessions.cancel")}</Button><Button type="text" disabled={busy || loading || !path.trim()} loading={opening} onClick={() => void open()}>{t("agent.sessions.useDirectory")}</Button></div> : null}>
        {mode === "directory" ? <>
            <form className="flex shrink-0 items-center gap-1" onSubmit={(event) => { event.preventDefault(); void load(path.trim()); }}>
                <Tooltip title={t("agent.sessions.roots")}><button type="button" aria-label={t("agent.sessions.roots")} disabled={loading || busy} onClick={() => void load("")} className="shrink-0 rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"><HardDrive className="size-4" /></button></Tooltip>
                <Tooltip title={t("agent.sessions.parent")}><button type="button" aria-label={t("agent.sessions.parent")} disabled={loading || busy || directory?.parent == null} onClick={() => void load(directory?.parent ?? "")} className="shrink-0 rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"><ArrowUp className="size-4" /></button></Tooltip>
                <Input className="min-w-0 flex-1" aria-label={t("agent.conversation.cwd")} placeholder={t("agent.sessions.pathPlaceholder")} value={path} disabled={loading || busy} onChange={(event) => setPath(event.target.value)} />
                <Tooltip title={t("agent.sessions.go")}><button type="submit" aria-label={t("agent.sessions.go")} disabled={loading || busy} className="shrink-0 rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"><ArrowRight className="size-4" /></button></Tooltip>
            </form>
            <p className="shrink-0 text-xs leading-5" style={{ color: token.colorTextSecondary }}>{t("agent.sessions.directoryHint")}</p>
        </> : null}
        {error ? <p role="alert" className="shrink-0 break-words text-xs leading-5" style={{ color: token.colorError }}>{error}</p> : null}
        {loading ? <div role="status" aria-label={t("agent.sessions.loading")} className="flex justify-center py-8"><LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" /></div> : <div className="thin-scrollbar min-h-0 overflow-y-auto overscroll-contain">
            {mode === "history" ? sessions.map((session) => <button key={session.id} type="button" disabled={busy || session.id === conversation?.conversationId} onClick={() => void open(session.id)} className="flex w-full min-w-0 items-start gap-3 rounded-lg p-3 text-left hover:bg-black/5 dark:hover:bg-white/10 disabled:cursor-default" aria-current={session.id === conversation?.conversationId ? "true" : undefined}>
                <MessageSquare className="mt-0.5 size-4 shrink-0" style={{ color: token.colorTextSecondary }} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm">{session.title || t("agent.sessions.new")}</span><Tooltip title={session.cwd}><span tabIndex={0} className="mt-1 block truncate text-xs" style={{ color: token.colorTextSecondary }}>{session.cwd}</span></Tooltip></span>
                {session.id === conversation?.conversationId ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
            </button>) : directory?.directories.map((folder) => <button key={folder.path} type="button" disabled={busy} onClick={() => void load(folder.path)} className="flex w-full min-w-0 items-center gap-3 rounded-lg p-3 text-left hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"><Folder className="size-4 shrink-0" style={{ color: token.colorTextSecondary }} /><span className="min-w-0 break-all text-sm">{folder.name}</span></button>)}
            {!(mode === "history" ? sessions.length : directory?.directories.length) ? <p className="py-8 text-center text-xs" style={{ color: token.colorTextSecondary }}>{t(mode === "history" ? "agent.sessions.noHistory" : "agent.sessions.noFolders")}</p> : null}
        </div>}
    </Modal>;
}
