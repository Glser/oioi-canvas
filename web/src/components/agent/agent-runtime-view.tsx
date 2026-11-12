import { useState } from "react";
import { Button, theme } from "antd";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import type { DetectedRuntime } from "@/services/api/canvas-agent";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useAgentRuntimeStore } from "@/stores/use-agent-runtime-store";
import { useAgentStore } from "@/stores/use-agent-store";

const KNOWN_RUNTIMES: DetectedRuntime[] = [
    { id: "codex", name: "Codex", command: "codex", path: null, version: null, supported: true, status: "missing" },
    { id: "claude", name: "Claude Code", command: "claude", path: null, version: null, supported: false, status: "missing" },
    { id: "codebuddy", name: "CodeBuddy", command: "codebuddy", path: null, version: null, supported: false, status: "missing" },
    { id: "opencode", name: "OpenCode", command: "opencode", path: null, version: null, supported: false, status: "missing" },
];

export function AgentRuntimeView() {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const copyText = useCopyText();
    const connected = useAgentStore((state) => state.connected);
    const { catalog, info, detecting, load } = useAgentRuntimeStore();
    const { projectId, conversation, refreshCapabilities, activate } = useAgentChatStore();
    const capabilities = conversation?.capabilities || info?.capabilities;
    const [refreshing, setRefreshing] = useState(false);
    const runtimes = catalog?.runtimes.length ? catalog.runtimes : KNOWN_RUNTIMES;
    const detected = runtimes.filter((runtime) => runtime.status === "detected").length;
    const available = connected ? runtimes.filter((runtime) => runtime.supported && runtime.status === "detected" && (runtime.id !== "codex" || info?.status === "ready" || Boolean(conversation?.threadId))).length : 0;
    const refresh = async () => {
        setRefreshing(true);
        try {
            await load(true);
            if (projectId) {
                if (conversation?.status !== "error" && conversation) await refreshCapabilities();
                else await activate(projectId);
            }
        } finally { setRefreshing(false); }
    };

    return (
        <section className="mt-5 min-w-0" aria-label={t("agent.runtimeDiscovery.title")}>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl text-center text-xs" style={{ background: token.colorBorderSecondary }}>
                <div className="px-3 py-3" style={{ background: token.colorBgContainer }}>
                    <p style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.runtimes")}</p>
                    <p className="mt-1 text-sm font-medium">{t("agent.runtimeDiscovery.availableCount", { available, total: detected || runtimes.length })}</p>
                </div>
                <div className="px-3 py-3" style={{ background: token.colorBgContainer }}>
                    <p style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.status")}</p>
                    <p className="mt-1 text-sm font-medium">{t(connected ? "agent.runtimeDiscovery.online" : "agent.runtimeDiscovery.offline")}</p>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium tracking-wide" style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.runtimes")}</h4>
                <Button type="text" size="small" icon={<RefreshCw className={`size-3.5 ${refreshing || detecting ? "animate-spin motion-reduce:animate-none" : ""}`} />} onClick={() => void refresh()}>{t("agent.runtimeDiscovery.refresh")}</Button>
            </div>

            <div className="mt-2 divide-y overflow-hidden rounded-2xl border" style={{ borderColor: token.colorBorderSecondary }}>
                {runtimes.map((runtime) => {
                    const ready = runtime.id === "codex" && connected && ((conversation?.threadId && conversation.status !== "error") || info?.status === "ready");
                    const status = runtime.status === "missing" ? "missing" : !connected ? "offline" : runtime.status === "error" ? "failed" : !runtime.supported ? "unsupported" : ready ? "ready" : info?.status === "needsAuth" ? "needsAuth" : "detected";
                    return (
                        <details key={runtime.id} className="px-4 py-3">
                            <summary className="flex cursor-pointer list-none items-center gap-3 text-sm [&::-webkit-details-marker]:hidden">
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2 font-medium">
                                        {runtime.name}
                                        <span className="rounded-full px-1.5 py-0.5 text-[11px] font-normal" style={{ color: ready ? token.colorSuccess : token.colorTextSecondary, background: token.colorFillTertiary }}>{t(`agent.runtimeDiscovery.${status}`)}</span>
                                    </span>
                                    <span className="mt-1 block text-xs" style={{ color: token.colorTextSecondary }}>{[runtime.version, t(`agent.runtimeDiscovery.${status}`)].filter(Boolean).join(" · ")}</span>
                                </span>
                                {runtime.status === "missing" && runtime.id === "codex" ? (
                                    <button type="button" className="shrink-0 text-xs hover:bg-black/5 dark:hover:bg-white/10 rounded-lg px-2 py-1" onClick={(event) => { event.preventDefault(); copyText("npm install -g @openai/codex"); }}>{t("agent.runtimeDiscovery.installOrConfig")}</button>
                                ) : <ChevronRight className="size-4 shrink-0 opacity-40" />}
                            </summary>
                            {runtime.path ? <p className="mt-2 break-all text-xs leading-5" style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.path")}: {runtime.path}</p> : null}
                            {!runtime.supported ? <p className="mt-2 text-xs leading-5" style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.unsupportedHint")}</p> : null}
                            {runtime.error ? <p className="mt-2 text-xs" style={{ color: token.colorError }}>{runtime.error}</p> : null}
                            {runtime.id === "codex" && connected && info?.status === "needsAuth" ? (
                                <div className="mt-2 text-xs leading-5">
                                    <p>{t("agent.runtimeDiscovery.authHint")}</p>
                                    <Button type="text" size="small" onClick={() => copyText("codex login")}>codex login</Button>
                                </div>
                            ) : null}
                            {runtime.id === "codex" && capabilities && connected ? (
                                <div className="mt-3 space-y-3 text-xs">
                                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 leading-5">
                                        <dt>{t("agent.runtimeDiscovery.model")}</dt><dd className="break-all">{capabilities.model || t("agent.runtimeDiscovery.follow")}</dd>
                                        <dt>{t("agent.runtimeDiscovery.provider")}</dt><dd className="break-all">{capabilities.modelProvider || t("agent.runtimeDiscovery.follow")}</dd>
                                        <dt>{t("agent.runtimeDiscovery.reasoning")}</dt><dd>{capabilities.reasoningEffort || t("agent.runtimeDiscovery.follow")}</dd>
                                        <dt>{t("agent.runtimeDiscovery.approval")}</dt><dd className="break-all">{capabilities.approvalPolicy || t("agent.runtimeDiscovery.follow")}</dd>
                                        <dt>{t("agent.runtimeDiscovery.sandbox")}</dt><dd className="break-all">{capabilities.sandbox || t("agent.runtimeDiscovery.follow")}</dd>
                                    </dl>
                                    {capabilities.approvalPolicy === "never" || capabilities.sandbox === "dangerFullAccess" || capabilities.sandbox === "danger-full-access" ? <p style={{ color: token.colorWarning }}>{t("agent.runtimeDiscovery.permissionNotice")}</p> : null}
                                    <details><summary className="cursor-pointer py-1">Skills · {capabilities.skills.length}</summary><div className="thin-scrollbar mt-2 max-h-48 space-y-3 overflow-y-auto">{capabilities.skills.map((skill, index) => <div key={`${skill.name}:${index}`}><p className="font-medium">{skill.name}{!skill.enabled ? ` · ${t("agent.runtimeDiscovery.disabled")}` : ""}</p><p className="mt-1 leading-5" style={{ color: token.colorTextSecondary }}>{skill.description}</p></div>)}</div></details>
                                    <details><summary className="cursor-pointer py-1">MCP · {capabilities.mcpServers.length}</summary><div className="thin-scrollbar mt-2 max-h-48 space-y-3 overflow-y-auto">{capabilities.mcpServers.map((server) => <div key={server.name}><p className="font-medium">{server.name} · {server.status || t("agent.runtimeDiscovery.unknown")}</p><p className="mt-1 break-words leading-5" style={{ color: token.colorTextSecondary }}>{server.tools.join(" · ") || t("agent.runtimeDiscovery.noTools")}</p></div>)}</div></details>
                                </div>
                            ) : null}
                        </details>
                    );
                })}
            </div>
        </section>
    );
}
