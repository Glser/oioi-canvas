import { useRef, useState, type CSSProperties } from "react";
import { App, Input, Popover, Tooltip, theme } from "antd";
import { ArrowUp, Brain, Check, ChevronDown, FileText, FolderOpen, LoaderCircle, Plus, ShieldCheck, ShieldOff, Square, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import type { AgentPermissionMode } from "@/services/api/canvas-agent";
import styles from "./agent-composer.module.css";
import { EffortSlider } from "./effort-slider";
import { AgentSessionDialog } from "./agent-session-dialog";

type Attachment = { id: string; name: string; text: string };

export function AgentComposer() {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const { projectId, conversation, pending, connecting, submitting, selection, setSelection, setPermissions, queue, submit, interrupt } = useAgentChatStore();
    const [draft, setDraft] = useState("");
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [saving, setSaving] = useState(false);
    const [reading, setReading] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [changingPermission, setChangingPermission] = useState(false);
    const [directoryOpen, setDirectoryOpen] = useState(false);
    const [popover, setPopover] = useState<"model" | "permission" | "context" | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const trigger = useRef<HTMLButtonElement | null>(null);
    const capability = conversation?.capabilities;
    const selectedModel = selection.model || capability?.model || "";
    const models = [...(capability?.models || [])];
    if (selectedModel && !models.some((model) => model.id === selectedModel)) models.unshift({ id: selectedModel, name: selectedModel, reasoningEfforts: [], defaultReasoningEffort: null });
    const model = models.find((item) => item.id === selectedModel);
    const effortLabel = (value: string) => t(`agent.connectedComposer.efforts.${value}`, { defaultValue: value });
    const efforts = [{ value: "", label: t("agent.runtimeDiscovery.follow") }, ...(model?.reasoningEfforts || []).map((effort) => ({ ...effort, label: effortLabel(effort.value) }))];
    const effortIndex = Math.max(0, efforts.findIndex((effort) => effort.value === (selection.reasoningEffort || "")));
    const effectiveEffort = selection.reasoningEffort || (selection.model ? model?.defaultReasoningEffort : capability?.reasoningEffort);
    const running = Boolean(conversation?.turnId) || conversation?.status === "running" || conversation?.status === "waiting";
    const busy = connecting || submitting || saving || reading || changingPermission || running;
    const locked = busy || Boolean(pending) || !conversation;
    const fullAccess = capability?.sandbox === "dangerFullAccess" || capability?.sandbox === "danger-full-access";
    const permission = conversation?.permissionMode || "runtime";
    const permissionLabel = permission === "runtime" ? (fullAccess ? "fullAccess" : capability?.sandbox === "readOnly" || capability?.sandbox === "read-only" ? "readOnly" : "permissions") : permission;
    const usage = conversation?.tokenUsage;
    const percent = usage?.modelContextWindow ? Math.min(100, Math.max(0, usage.usedTokens / usage.modelContextWindow * 100)) : null;
    const number = (value: number) => value.toLocaleString();
    const changePermission = async (mode: AgentPermissionMode) => {
        setChangingPermission(true);
        try { await setPermissions(mode); setPopover(null); trigger.current?.focus(); }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setChangingPermission(false); }
    };
    const variables = {
        "--composer-bg": token.colorBgContainer,
        "--composer-ink": token.colorText,
        "--composer-muted": token.colorTextSecondary,
        "--composer-border": token.colorBorderSecondary,
        "--composer-tint": token.colorFillTertiary,
        "--composer-hover": token.colorFillSecondary,
        "--composer-accent": token["blue-6"],
        "--composer-warning": token.colorWarning,
    } as CSSProperties;
    const send = async () => {
        const text = [draft.trim(), ...attachments.map((file) => `### ${t("agent.connectedComposer.attachment")}: ${file.name}\n${file.text}`)].filter(Boolean).join("\n\n");
        if (!text || locked) return;
        setSaving(true);
        try {
            await queue(projectId, text);
            setDraft("");
            setAttachments([]);
            await submit();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    };
    const addFiles = async (files: File[]) => {
        if (!files.length) return;
        setReading(true);
        try {
            const next = await Promise.all(files.map(async (file) => ({ id: crypto.randomUUID(), name: file.name, text: await file.text() })));
            setAttachments((current) => [...current, ...next]);
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setReading(false); }
    };
    const stop = async () => {
        setStopping(true);
        try { await interrupt(); }
        finally { setStopping(false); }
    };

    return (
        <div className={styles.composer} style={variables} onKeyDown={(event) => {
            if (event.key === "Escape" && popover) { event.stopPropagation(); setPopover(null); trigger.current?.focus(); }
        }}>
            <div className={styles.surface} aria-busy={saving || reading}>
                {attachments.length ? <div className={styles.attachments} aria-label={t("agent.connectedComposer.attachments")}>
                    {attachments.map((file) => <div key={file.id} className={styles.attachment}>
                        <FileText className="size-4 shrink-0" />
                        <Tooltip title={file.name}><span className="min-w-0 truncate">{file.name}</span></Tooltip>
                        <Tooltip title={t("agent.connectedComposer.removeAttachment")}><button type="button" className={styles.remove} aria-label={`${t("agent.connectedComposer.removeAttachment")} ${file.name}`} disabled={saving || submitting} onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}><X className="size-3" /></button></Tooltip>
                    </div>)}
                </div> : null}
                <Input.TextArea
                    className={styles.editor}
                    aria-label={t("agent.conversation.input")}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t("agent.conversation.placeholder")}
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    variant="borderless"
                    disabled={Boolean(pending) || saving || submitting}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
                    }}
                />
                <div className={styles.toolbar}>
                    <input ref={fileInput} type="file" multiple accept=".txt,.md,.json,.csv,.yaml,.yml,.ts,.tsx,.js,.jsx,.css,.html,.py,.go,.java,.log" className="hidden" onChange={(event) => { void addFiles(Array.from(event.target.files || [])); event.target.value = ""; }} />
                    <Tooltip title={t("agent.connectedComposer.addAttachment")}><button type="button" className={styles.iconButton} aria-label={t("agent.connectedComposer.addAttachment")} disabled={locked} onClick={() => fileInput.current?.click()}>{reading ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Plus className="size-4" />}</button></Tooltip>
                    <Popover trigger="click" placement="topLeft" arrow={false} open={popover === "permission"} onOpenChange={(open) => setPopover(open ? "permission" : null)} content={
                        <div className={styles.infoMenu} style={variables}>
                            <p className="mb-2 font-medium">{t("agent.connectedComposer.permissions")}</p>
                            <div role="group" aria-label={t("agent.connectedComposer.permissions")}>
                                {(["runtime", "request", "readOnly", "fullAccess"] as const).map((mode) => <button key={mode} type="button" className={styles.modelOption} aria-pressed={permission === mode} disabled={locked || !capability} onClick={() => void changePermission(mode)}>
                                    <span className="min-w-0"><span className="block">{t(`agent.connectedComposer.permissionModes.${mode}`)}</span><span className={styles.optionDescription}>{t(`agent.connectedComposer.permissionDescriptions.${mode}`)}</span></span>
                                    {permission === mode ? <Check className="size-3.5 shrink-0" /> : null}
                                </button>)}
                            </div>
                        </div>
                    }>
                        <Tooltip title={t("agent.connectedComposer.permissions")} open={popover === "permission" ? false : undefined}><button type="button" className={`${styles.permission} ${fullAccess ? styles.fullAccess : ""}`} aria-label={t("agent.connectedComposer.permissions")} aria-expanded={popover === "permission"} disabled={changingPermission || !capability} onClick={(event) => { trigger.current = event.currentTarget; }}>
                            {changingPermission ? <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : fullAccess ? <ShieldOff className="size-3.5 shrink-0" /> : <ShieldCheck className="size-3.5 shrink-0" />}<span className={styles.permissionLabel}>{t(`agent.connectedComposer.${permissionLabel}`)}</span><ChevronDown className="size-3 shrink-0" />
                        </button></Tooltip>
                    </Popover>
                    <div className="flex-1" />
                    <Popover trigger="click" placement="topRight" arrow={false} open={popover === "context"} onOpenChange={(open) => setPopover(open ? "context" : null)} content={
                        <div className={styles.infoMenu} style={variables}>
                            <p className="font-medium">{t("agent.connectedComposer.context")}</p>
                            {usage ? <dl className={`${styles.settings} mt-3`}>
                                <dt>{t("agent.connectedComposer.contextUsed")}</dt><dd>{number(usage.usedTokens)} tokens</dd>
                                <dt>{t("agent.connectedComposer.contextCapacity")}</dt><dd>{usage.modelContextWindow ? `${number(usage.modelContextWindow)} tokens` : t("agent.runtimeDiscovery.unknown")}</dd>
                                <dt>{t("agent.connectedComposer.totalTokens")}</dt><dd>{number(usage.totalTokens)} tokens</dd>
                            </dl> : <p className={styles.caption}>{t("agent.connectedComposer.contextUnknown")}</p>}
                            <p className={styles.caption}>{t("agent.connectedComposer.contextHint")}</p>
                        </div>
                    }>
                        <Tooltip title={percent === null ? t("agent.connectedComposer.contextUnknown") : t("agent.connectedComposer.contextPercent", { percent: Math.round(percent) })} open={popover === "context" ? false : undefined}><button type="button" className={styles.iconButton} aria-label={t("agent.connectedComposer.context")} aria-expanded={popover === "context"} onClick={(event) => { trigger.current = event.currentTarget; }}>
                            <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                                <circle cx="12" cy="12" r="8" fill="none" stroke="var(--composer-border)" strokeWidth="2.5" />
                                {percent !== null ? <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${percent} 100`} transform="rotate(-90 12 12)" /> : null}
                            </svg>
                        </button></Tooltip>
                    </Popover>

                    <Popover trigger="click" placement="topRight" arrow={false} open={popover === "model"} onOpenChange={(open) => setPopover(open ? "model" : null)} content={
                        <div className={styles.modelMenu} style={variables}>
                            <p className={styles.sectionLabel}>{t("agent.runtimeDiscovery.model")}</p>
                            <div className={styles.modelList} role="group" aria-label={t("agent.runtimeDiscovery.model")}>
                                {[{ id: "", name: t("agent.runtimeDiscovery.follow") }, ...models].map((item) => <button key={item.id} type="button" className={styles.modelOption} aria-pressed={(selection.model || "") === item.id} disabled={locked} onClick={() => setSelection(item.id ? { model: item.id } : {})}><span className="min-w-0 truncate">{item.name}</span>{(selection.model || "") === item.id ? <Check className="size-3.5 shrink-0" /> : null}</button>)}
                            </div>
                            {efforts.length > 1 ? <div className={styles.effort}>
                                <div className="mb-3 flex items-center justify-between gap-3"><span>{t("agent.runtimeDiscovery.reasoning")}</span><span className={styles.effortValue}>{efforts[effortIndex].label}</span></div>
                                <EffortSlider stops={efforts} value={selection.reasoningEffort || ""} disabled={locked} onValueChange={(value) => setSelection({ ...selection, reasoningEffort: value || undefined })} />
                            </div> : null}
                        </div>
                    }>
                        <Tooltip title={t("agent.connectedComposer.modelSettings")} open={popover === "model" ? false : undefined}><button type="button" className={styles.modelTrigger} aria-label={t("agent.connectedComposer.modelSettings")} aria-expanded={popover === "model"} disabled={locked || !capability} onClick={(event) => { trigger.current = event.currentTarget; }}>
                            <Brain className="size-3.5 shrink-0" /><span className="truncate">{model?.name || t("agent.runtimeDiscovery.follow")}</span>{effectiveEffort ? <span className={`${styles.effortValue} shrink-0`}>{effortLabel(effectiveEffort)}</span> : null}<ChevronDown className="size-3 shrink-0" />
                        </button></Tooltip>
                    </Popover>
                    <Tooltip title={t(running ? "agent.conversation.stop" : "agent.conversation.send")}><button type="button" className={styles.send} aria-label={t(running ? "agent.conversation.stop" : "agent.conversation.send")} disabled={running ? !conversation?.turnId || stopping : locked || (!draft.trim() && !attachments.length)} onClick={() => void (running ? stop() : send())}>
                        {submitting || saving || stopping ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : running ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" strokeWidth={2.5} />}
                    </button></Tooltip>
                </div>
            </div>
            <div className={styles.footer}>
                <Tooltip title={conversation?.cwd || t("agent.conversation.cwd")}><button type="button" aria-label={t("agent.sessions.directory")} className={styles.directory} disabled={locked} onClick={() => setDirectoryOpen(true)}><FolderOpen className="size-3 shrink-0" /><span className="truncate">{conversation?.cwd?.split(/[\\/]/).filter(Boolean).pop() || "Codex"}</span><ChevronDown className="size-3 shrink-0" /></button></Tooltip>
                <Tooltip title={t("agent.conversation.inputHint")}><span tabIndex={0} className="shrink-0">{t("agent.connectedComposer.sendHint")}</span></Tooltip>
            </div>
            {directoryOpen ? <AgentSessionDialog mode="directory" onClose={() => setDirectoryOpen(false)} /> : null}
        </div>
    );
}
