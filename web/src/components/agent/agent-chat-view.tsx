import { useEffect, useRef, useState } from "react";
import { App, Button, Checkbox, Input, InputNumber, Tooltip, theme } from "antd";
import { Bot, Check, Circle, History, LoaderCircle, MessageSquarePlus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useAgentRuntimeStore } from "@/stores/use-agent-runtime-store";
import { AgentRuntimeView } from "./agent-runtime-view";
import { AgentComposer } from "./agent-composer";
import { AgentSessionDialog } from "./agent-session-dialog";
import { AiStatus, type AiStatusState } from "./ai-status";
import { Select } from "@/components/themed-controls";
import type { AgentInputValue, AgentRequest } from "@/services/api/canvas-agent";

export function AgentChatView() {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const { projectId, conversation, pending, connecting, submitting, error, submit, discard, activate, openConversation } = useAgentChatStore();
    const [historyOpen, setHistoryOpen] = useState(false);
    const runtimeReady = useAgentRuntimeStore((state) => state.info?.status === "ready");
    const scroll = useRef<HTMLDivElement>(null);
    const follow = useRef(true);
    const running = Boolean(conversation?.turnId) || conversation?.status === "running" || conversation?.status === "waiting";
    const busy = connecting || submitting || running;
    const latest = conversation?.messages.at(-1);
    const currentItem = latest?.threadId === conversation?.threadId && latest?.turnId === conversation?.turnId ? latest : undefined;
    const activity: AiStatusState | "waiting" = connecting || submitting ? "thinking"
        : conversation?.status === "waiting" ? "waiting"
        : running ? currentItem?.status === "completed" ? "thinking" : currentItem?.role === "assistant" ? "writing" : currentItem?.role === "tool" ? "analyzing" : "thinking"
        : error || conversation?.status === "error" ? "error" : "done";
    useEffect(() => {
        if (submitting) follow.current = true;
        if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [conversation?.revision, pending, submitting]);
    const clearPending = () => void discard().catch((error: unknown) => message.error(String(error)));
    const status = connecting ? "connecting" : conversation?.status || (runtimeReady ? "ready" : "offline");
    const newConversation = async () => {
        try { await openConversation(); message.success(t("agent.sessions.created")); follow.current = true; }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    };
    return (
        <div className="flex min-h-0 flex-1 flex-col" style={{ color: token.colorText }}>
            <div className="flex items-center justify-between gap-2 px-4 pb-3 text-xs" style={{ color: token.colorTextSecondary }}>
                <span className="flex min-w-0 items-center gap-2" role="status">{busy ? <LoaderCircle className="size-3 shrink-0 animate-spin motion-reduce:animate-none" /> : <Circle className="size-2 shrink-0" />}<span className="truncate">Codex · {t(`agent.conversation.${status}`)}</span></span>
                {projectId ? <div className="flex shrink-0 items-center">
                    <Tooltip title={t("agent.sessions.new")}><button type="button" aria-label={t("agent.sessions.new")} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40" disabled={busy || Boolean(pending) || !conversation} onClick={() => void newConversation()}><MessageSquarePlus className="size-3.5" /></button></Tooltip>
                    <Tooltip title={t("agent.sessions.history")}><button type="button" aria-label={t("agent.sessions.history")} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40" disabled={busy || Boolean(pending) || !conversation} onClick={() => setHistoryOpen(true)}><History className="size-3.5" /></button></Tooltip>
                    <Tooltip title={t("agent.conversation.refresh")}><button type="button" aria-label={t("agent.conversation.refresh")} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40" disabled={busy} onClick={() => void activate(projectId)}><RefreshCw className="size-3.5" /></button></Tooltip>
                </div> : null}
            </div>
            <div ref={scroll} onScroll={() => { const el = scroll.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <details className="mb-4"><summary className="cursor-pointer py-1 text-xs" style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.title")}</summary><div className="mt-3"><AgentRuntimeView /></div></details>
                {!projectId ? <p className="py-6 text-sm" style={{ color: token.colorTextSecondary }}>{t("agent.connectionGuide.homeReady")}</p> : null}
                {projectId && !conversation?.messages.length && !pending ? <div className="py-8"><h3 className="text-base font-medium">{t("agent.conversation.emptyTitle")}</h3><p className="mt-2 text-sm leading-6" style={{ color: token.colorTextSecondary }}>{t("agent.conversation.emptyText")}</p></div> : null}
                <div className="space-y-6" aria-label={t("agent.conversation.messages")}>
                    {conversation?.messages.map((item) => (
                        <article key={`${item.threadId}:${item.turnId}:${item.itemId}`} data-message-role={item.role} aria-label={item.role === "user" ? t("agent.conversation.you") : item.role === "assistant" ? "Codex" : undefined} className={`flex min-w-0 items-start gap-3 ${item.role === "user" ? "justify-end" : ""}`}>
                            {item.role === "tool" ? <details className="ml-9 min-w-0 flex-1 text-xs" style={{ color: token.colorTextSecondary }}>
                                <summary className="flex cursor-pointer items-center gap-2 py-1">{item.status === "inProgress" ? <LoaderCircle className="size-3 shrink-0 animate-spin motion-reduce:animate-none" /> : <Check className="size-3 shrink-0" />}<span className="min-w-0 flex-1 truncate">{item.text}</span><span className="shrink-0">{item.status ? t(`agent.conversation.toolStatus.${item.status}`, { defaultValue: item.status }) : ""}</span></summary>
                                <pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-5 [overflow-wrap:anywhere]">{item.text}</pre>
                            </details> : item.role === "user" ? <div className="max-w-[88%] rounded-2xl rounded-tr-sm px-3 py-2.5 text-left text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ background: token.colorFillSecondary }}>{item.text || "…"}</div> : <>
                                <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center" style={{ color: token.colorTextSecondary }}><Bot className="size-[18px]" /></span>
                                <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{item.text || "…"}</div>
                            </>}
                        </article>
                    ))}
                </div>
                {busy || conversation?.messages.length || error || conversation?.error ? <AiStatus
                    key={`${projectId}:${conversation?.threadId || ""}`}
                    className="mt-3 ml-9 max-w-[calc(100%-2.25rem)]"
                    state={activity}
                    states={{ waiting: { active: true } }}
                    label={connecting ? t("agent.conversation.connecting") : activity === "waiting" ? t("agent.conversation.waiting") : undefined}
                    detail={running && currentItem?.role === "tool" ? currentItem.text : undefined}
                    shimmer={busy && activity !== "waiting"}
                    timer={!connecting}
                /> : null}
                {pending ? <section className="mt-6 flex min-w-0 flex-col items-end gap-2"><div className="max-w-[88%] rounded-2xl rounded-tr-sm px-3 py-2.5" style={{ background: token.colorFillSecondary }}><p className="text-xs" style={{ color: token.colorTextSecondary }}>{t(pending.phase === "queued" ? "agent.conversation.pending" : "agent.conversation.checkReceipt")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{pending.text}</p></div><div className="flex max-w-full flex-wrap justify-end gap-1"><Button type="text" size="small" disabled={busy || !conversation} onClick={() => void submit()}>{t("agent.conversation.retry")}</Button><Button type="text" size="small" disabled={submitting} onClick={clearPending}>{t("agent.conversation.discard")}</Button></div></section> : null}
                {error || conversation?.error ? <p role="alert" className="mt-4 ml-9 whitespace-pre-wrap break-words text-xs leading-6" style={{ color: token.colorError }}>{error || conversation?.error}</p> : null}
            </div>
            {conversation?.requests.length ? <div className="thin-scrollbar max-h-[40dvh] shrink-0 overflow-y-auto px-4 pb-3" aria-label={t("agent.conversation.waiting")}>
                {conversation.requests.map((request) => <AgentRequestCard key={request.id} request={request} />)}
            </div> : null}
            {projectId ? <div className="shrink-0"><AgentComposer key={conversation?.conversationId || projectId} /></div> : null}
            {historyOpen ? <AgentSessionDialog key={projectId} mode="history" onClose={() => { setHistoryOpen(false); follow.current = true; }} /> : null}
        </div>
    );
}

function AgentRequestCard({ request }: { request: AgentRequest }) {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const answer = useAgentChatStore((state) => state.answer);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [content, setContent] = useState<Record<string, AgentInputValue>>(() => Object.fromEntries(Object.entries(request.form?.properties || {}).filter(([, field]) => field.default != null || field.type === "boolean").map(([key, field]) => [key, field.default ?? false])));
    const [sending, setSending] = useState(false);
    const [failure, setFailure] = useState("");
    const respond = async (decision?: "accept" | "decline") => {
        setSending(true);
        setFailure("");
        try { await answer({ requestId: request.id, decision, ...(request.kind === "input" ? { answers } : request.kind === "elicitation" ? { content } : {}) }); }
        catch (error) { setFailure(error instanceof Error ? error.message : String(error)); }
        finally { setSending(false); }
    };
    return <section className="mt-2 rounded-xl border p-3" style={{ borderColor: token.colorBorder }} aria-label={request.title}>
        <h4 className="text-sm font-medium">{request.title}</h4>
        {request.detail ? <pre className="thin-scrollbar mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5">{request.detail}</pre> : null}
        {request.form && !request.unsupported ? Object.entries(request.form.properties).map(([key, field]) => {
            const label = field.title || key;
            const choices = field.type === "array" ? field.items?.anyOf : field.oneOf;
            const values = field.type === "array" ? field.items?.enum : field.enum;
            const options = choices?.map((option) => ({ value: option.const, label: option.title })) || values?.map((value, index) => ({ value, label: field.enumNames?.[index] || value }));
            const update = (value: AgentInputValue | null) => setContent((previous) => { const next = { ...previous }; if (value == null) delete next[key]; else next[key] = value; return next; });
            return <div key={key} className="mt-3 grid gap-2 text-xs">
                <span>{label}{request.form?.required?.includes(key) ? " *" : ""}</span>
                {options ? <Select aria-label={label} aria-required={request.form?.required?.includes(key)} options={options} mode={field.type === "array" ? "multiple" : undefined} value={content[key] as string | string[] | undefined} disabled={sending} onChange={update} />
                    : field.type === "boolean" ? <Checkbox aria-label={label} checked={content[key] === true} disabled={sending} onChange={(event) => update(event.target.checked)}>{t("agent.conversation.confirmOption")}</Checkbox>
                    : field.type === "number" || field.type === "integer" ? <InputNumber className="w-full" aria-label={label} value={content[key] as number | undefined} disabled={sending} onChange={update} />
                    : <Input aria-label={label} aria-required={request.form?.required?.includes(key)} value={content[key] as string | undefined} disabled={sending} onChange={(event) => update(event.target.value)} />}
                {field.description ? <p style={{ color: token.colorTextSecondary }}>{field.description}</p> : null}
            </div>;
        }) : null}
        {request.url ? <a className="mt-3 block break-all text-xs underline" href={request.url} target="_blank" rel="noopener noreferrer">{t("agent.conversation.openAuthorization")}</a> : null}
        {request.unsupported ? <p className="mt-3 text-xs leading-5" style={{ color: token.colorWarning }}>{t("agent.conversation.nativeAuthorization")}</p> : null}
        {request.questions?.map((question) => <div key={question.id} className="mt-3"><label className="grid gap-2 text-sm"><span>{question.question}</span>{question.isSecret ? <Input.Password aria-label={question.question} value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /> : <Input.TextArea aria-label={question.question} value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} autoSize />}</label>{question.options?.map((option) => <button type="button" key={option.label} className="mt-1 block w-full rounded-lg p-2 text-left hover:bg-black/5 dark:hover:bg-white/10" aria-pressed={answers[question.id] === option.label} onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.label }))}><span className="text-xs font-medium">{option.label}</span><span className="mt-1 block text-xs" style={{ color: token.colorTextSecondary }}>{option.description}</span></button>)}</div>)}
        {failure ? <p role="alert" className="mt-2 text-xs leading-5" style={{ color: token.colorError }}>{failure}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">{request.kind === "input" ? <Button type="text" aria-label={t("agent.conversation.confirm")} loading={sending} disabled={request.questions?.some((question) => !answers[question.id]?.trim())} onClick={() => void respond()}>{t("agent.conversation.confirm")}</Button> : <><Button type="text" aria-label={t(request.url ? "agent.conversation.authorizationComplete" : "agent.conversation.allowOnce")} loading={sending} disabled={request.unsupported} onClick={() => void respond("accept")}>{t(request.url ? "agent.conversation.authorizationComplete" : "agent.conversation.allowOnce")}</Button><Button type="text" aria-label={t("agent.conversation.decline")} disabled={sending} onClick={() => void respond("decline")}>{t("agent.conversation.decline")}</Button></>}</div>
    </section>;
}
