import { useEffect, useRef, useState } from "react";
import { App, Button, Input, Tooltip, theme } from "antd";
import { ArrowUp, Check, Circle, LoaderCircle, RefreshCw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { Select } from "@/components/themed-controls";
import { useAgentRuntimeStore } from "@/stores/use-agent-runtime-store";
import { AgentRuntimeView } from "./agent-runtime-view";
import type { AgentRequest } from "@/services/api/canvas-agent";

export function AgentChatView() {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const { projectId, conversation, pending, connecting, submitting, error, queue, submit, discard, activate, interrupt, selection, setSelection } = useAgentChatStore();
    const catalog = useAgentRuntimeStore((state) => state.catalog);
    const runtimeReady = useAgentRuntimeStore((state) => state.info?.status === "ready");
    const capability = conversation?.capabilities;
    const selectedModel = selection.model || capability?.model || "";
    const modelInfo = capability?.models.find((model) => model.id === selectedModel);
    const models = [...(capability?.models || [])];
    if (capability?.model && !models.some((model) => model.id === capability.model)) models.unshift({ id: capability.model, name: capability.model, reasoningEfforts: [], defaultReasoningEffort: null });
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const scroll = useRef<HTMLDivElement>(null);
    const follow = useRef(true);
    const running = Boolean(conversation?.turnId) || conversation?.status === "running" || conversation?.status === "waiting";
    const busy = connecting || submitting || saving || running;
    useEffect(() => {
        if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    }, [conversation?.revision, pending]);
    const send = async () => {
        const value = draft.trim();
        if (!value || busy || pending || !conversation) return;
        setSaving(true);
        try {
            await queue(projectId, value);
            setDraft("");
            follow.current = true;
            await submit();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    };
    const clearPending = () => void discard().catch((error: unknown) => message.error(String(error)));
    const status = connecting ? "connecting" : conversation?.status || (runtimeReady ? "ready" : "offline");
    return (
        <div className="flex min-h-0 flex-1 flex-col" style={{ color: token.colorText }}>
            <div className="flex items-center justify-between gap-2 px-4 pb-3 text-xs" style={{ color: token.colorTextSecondary }}>
                <span className="flex items-center gap-2" role="status">{busy ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : <Circle className="size-2" />}Codex · {t(`agent.conversation.${status}`)}</span>
                {projectId ? <Tooltip title={t("agent.conversation.refresh")}><button type="button" aria-label={t("agent.conversation.refresh")} className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10" disabled={connecting || submitting} onClick={() => void activate(projectId)}><RefreshCw className="size-3.5" /></button></Tooltip> : null}
            </div>
            <div ref={scroll} onScroll={() => { const el = scroll.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; }} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <details className="mb-4"><summary className="cursor-pointer py-1 text-xs" style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.title")}</summary><div className="mt-3"><AgentRuntimeView /></div></details>
                {!projectId ? <p className="py-6 text-sm" style={{ color: token.colorTextSecondary }}>{t("agent.connectionGuide.homeReady")}</p> : null}
                {projectId && !conversation?.messages.length && !pending ? <div className="py-8"><h3 className="text-base font-medium">{t("agent.conversation.emptyTitle")}</h3><p className="mt-2 text-sm leading-6" style={{ color: token.colorTextSecondary }}>{t("agent.conversation.emptyText")}</p></div> : null}
                <div className="space-y-6" aria-label={t("agent.conversation.messages")}>
                    {conversation?.messages.map((item) => (
                        <article key={`${item.threadId}:${item.turnId}:${item.itemId}`} className="min-w-0">
                            {item.role === "tool" ? <details className="text-xs" style={{ color: token.colorTextSecondary }}><summary className="flex cursor-pointer items-center gap-2 py-1">{item.status === "inProgress" ? <LoaderCircle className="size-3 shrink-0 animate-spin motion-reduce:animate-none" /> : <Check className="size-3 shrink-0" />}<span className="min-w-0 truncate">{item.text}</span><span className="shrink-0">{item.status ? t(`agent.conversation.toolStatus.${item.status}`, { defaultValue: item.status }) : ""}</span></summary><pre className="mt-2 whitespace-pre-wrap break-words font-sans leading-5">{item.text}</pre></details> : <><p className="mb-2 text-xs font-medium" style={{ color: item.role === "user" ? token.colorTextSecondary : token.colorText }}>{item.role === "user" ? t("agent.conversation.you") : "Codex"}</p><div className="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{item.text || "…"}</div></>}
                        </article>
                    ))}
                </div>
                {pending ? <section className="mt-6 border-l-2 pl-3" style={{ borderColor: token.colorBorder }}><p className="text-xs" style={{ color: token.colorTextSecondary }}>{t(pending.phase === "queued" ? "agent.conversation.pending" : "agent.conversation.checkReceipt")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{pending.text}</p><div className="mt-2 flex gap-1"><Button type="text" size="small" disabled={busy || !conversation} onClick={() => void submit()}>{t("agent.conversation.retry")}</Button><Button type="text" size="small" disabled={submitting} onClick={clearPending}>{t("agent.conversation.discard")}</Button></div></section> : null}
                {conversation?.requests.map((request) => <AgentRequestCard key={request.id} request={request} />)}
                {error || conversation?.error ? <p role="alert" className="mt-4 whitespace-pre-wrap break-words text-xs leading-6" style={{ color: token.colorError }}>{error || conversation?.error}</p> : null}
            </div>
            {projectId ? <div className="shrink-0 border-t px-4 pb-4 pt-3" style={{ borderColor: token.colorBorderSecondary }}>
                {conversation?.cwd ? <Tooltip title={conversation.cwd}><p tabIndex={0} className="mb-2 truncate text-[11px]" style={{ color: token.colorTextSecondary }}>{t("agent.conversation.cwd")}：{conversation.cwd}</p></Tooltip> : null}
                {projectId ? <div className="mb-2 flex flex-wrap gap-1">
                    <Select aria-label={t("agent.runtimeDiscovery.runtime")} size="small" variant="borderless" value="codex" className="min-w-24 max-w-full" popupMatchSelectWidth={false} options={(catalog?.runtimes || [{ id: "codex", name: "Codex", supported: true, status: "detected" }]).map((runtime) => ({ value: runtime.id, label: runtime.name + (!runtime.supported ? ` · ${t("agent.runtimeDiscovery.unsupported")}` : runtime.status !== "detected" ? ` · ${t("agent.runtimeDiscovery.missing")}` : ""), disabled: !runtime.supported || runtime.status !== "detected" }))} />
                    <Select aria-label={t("agent.runtimeDiscovery.model")} size="small" variant="borderless" className="min-w-28 max-w-full flex-1" value={selection.model || ""} disabled={busy || Boolean(pending) || !capability} popupMatchSelectWidth={false} options={[{ value: "", label: `${t("agent.runtimeDiscovery.follow")}${capability?.model ? ` · ${capability.model}` : ""}` }, ...models.map((model) => ({ value: model.id, label: model.name }))]} onChange={(model) => setSelection(model ? { model } : {})} />
                    {modelInfo?.reasoningEfforts.length ? <Select aria-label={t("agent.runtimeDiscovery.reasoning")} size="small" variant="borderless" className="min-w-24 max-w-full" value={selection.reasoningEffort || ""} disabled={busy || Boolean(pending)} popupMatchSelectWidth={false} options={[{ value: "", label: t("agent.runtimeDiscovery.follow") }, ...modelInfo.reasoningEfforts.map((effort) => ({ value: effort.value, label: effort.value }))]} onChange={(reasoningEffort) => setSelection({ ...selection, reasoningEffort: reasoningEffort || undefined })} /> : null}
                </div> : null}
                <Input.TextArea aria-label={t("agent.conversation.input")} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t("agent.conversation.placeholder")} autoSize={{ minRows: 2, maxRows: 6 }} variant="borderless" disabled={!projectId || Boolean(pending)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
                <div className="mt-2 flex items-center justify-between gap-2"><span className="text-[11px]" style={{ color: token.colorTextSecondary }}>{t("agent.conversation.inputHint")}</span>{running ? <Tooltip title={t("agent.conversation.stop")}><Button type="text" aria-label={t("agent.conversation.stop")} icon={<Square className="size-4" />} disabled={!conversation?.turnId} onClick={() => void interrupt()}>{t("agent.conversation.stop")}</Button></Tooltip> : <Tooltip title={t("agent.conversation.send")}><Button type="text" aria-label={t("agent.conversation.send")} icon={<ArrowUp className="size-4" />} loading={submitting || saving} disabled={!draft.trim() || busy || !conversation || Boolean(pending)} onClick={() => void send()}>{t("agent.conversation.send")}</Button></Tooltip>}</div>
            </div> : null}
        </div>
    );
}

function AgentRequestCard({ request }: { request: AgentRequest }) {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const answer = useAgentChatStore((state) => state.answer);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [sending, setSending] = useState(false);
    const respond = async (decision?: "accept" | "decline") => {
        setSending(true);
        try { await answer({ requestId: request.id, decision, ...(request.kind === "input" ? { answers } : {}) }); }
        finally { setSending(false); }
    };
    return <section className="mt-5 rounded-xl border p-3" style={{ borderColor: token.colorBorder }} aria-label={request.title}>
        <h4 className="text-sm font-medium">{request.title}</h4>
        {request.detail ? <pre className="thin-scrollbar mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5">{request.detail}</pre> : null}
        {request.questions?.map((question) => <div key={question.id} className="mt-3"><label className="grid gap-2 text-sm"><span>{question.question}</span>{question.isSecret ? <Input.Password aria-label={question.question} value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} /> : <Input.TextArea aria-label={question.question} value={answers[question.id] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} autoSize />}</label>{question.options?.map((option) => <button type="button" key={option.label} className="mt-1 block w-full rounded-lg p-2 text-left hover:bg-black/5 dark:hover:bg-white/10" aria-pressed={answers[question.id] === option.label} onClick={() => setAnswers((current) => ({ ...current, [question.id]: option.label }))}><span className="text-xs font-medium">{option.label}</span><span className="mt-1 block text-xs" style={{ color: token.colorTextSecondary }}>{option.description}</span></button>)}</div>)}
        <div className="mt-3 flex gap-2">{request.kind === "input" ? <Button type="text" loading={sending} disabled={request.questions?.some((question) => !answers[question.id]?.trim())} onClick={() => void respond()}>{t("agent.conversation.confirm")}</Button> : <><Button type="text" loading={sending} onClick={() => void respond("accept")}>{t("agent.conversation.allowOnce")}</Button><Button type="text" disabled={sending} onClick={() => void respond("decline")}>{t("agent.conversation.decline")}</Button></>}</div>
    </section>;
}
