import { useState } from "react";
import { Button, theme } from "antd";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import type { DetectedRuntime } from "@/services/api/canvas-agent";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useAgentRuntimeStore } from "@/stores/use-agent-runtime-store";
import { useAgentStore } from "@/stores/use-agent-store";

const KNOWN_RUNTIMES: DetectedRuntime[] = [
    { id: "codex", name: "Codex", command: "codex", path: null, version: null, supported: true, status: "missing" },
    { id: "claude", name: "Claude Code", command: "claude", path: null, version: null, supported: false, status: "missing" },
    { id: "workbuddy", name: "WorkBuddy", command: "workbuddy", path: null, version: null, supported: false, status: "missing" },
];

const RUNTIME_ICONS: Record<string, string> = { codex: "/icons/codex.svg", claude: "/icons/claude-color.svg", workbuddy: "/icons/workbuddy.svg" };

export function AgentRuntimeView() {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const copyText = useCopyText();
    const connected = useAgentStore((state) => state.connected);
    const { catalog, info, detecting, load } = useAgentRuntimeStore();
    const { projectId, conversation, refreshCapabilities, activate } = useAgentChatStore();
    const capabilities = conversation?.capabilities || info?.capabilities;
    const [refreshing, setRefreshing] = useState(false);
    const [expanded, setExpanded] = useState<string | null>(null);
    const runtimes = catalog?.runtimes.length ? catalog.runtimes : KNOWN_RUNTIMES;
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
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium tracking-wide" style={{ color: token.colorTextSecondary }}>{t("agent.runtimeDiscovery.runtimes")}</h4>
                <Button type="text" size="small" icon={<RefreshCw className={`size-3.5 ${refreshing || detecting ? "animate-spin motion-reduce:animate-none" : ""}`} />} onClick={() => void refresh()}>{t("agent.runtimeDiscovery.refresh")}</Button>
            </div>

            <ul className="mt-2">
                {runtimes.map((runtime) => {
                    const ready = runtime.id === "codex" && connected && ((conversation?.threadId && conversation.status !== "error") || info?.status === "ready");
                    const status = runtime.status === "missing" ? "missing" : !connected ? "offline" : runtime.status === "error" ? "failed" : !runtime.supported ? "unsupported" : ready ? "ready" : info?.status === "needsAuth" ? "needsAuth" : "detected";
                    const icon = RUNTIME_ICONS[runtime.id];
                    const install = runtime.status === "missing" && runtime.id === "codex";
                    const open = expanded === runtime.id;
                    return (
                        <li key={runtime.id} className="border-b last:border-b-0" style={{ borderColor: token.colorBorderSecondary }}>
                            <div className="flex items-center gap-3 py-2.5">
                                {icon ? <img src={icon} alt="" aria-hidden="true" className="size-[18px] shrink-0 object-contain" style={ready ? undefined : { filter: "grayscale(1) opacity(0.55)" }} /> : null}
                                <span className="min-w-0 flex-1 truncate text-sm">{runtime.name}{runtime.version ? <span className="ml-1.5 text-xs" style={{ color: token.colorTextSecondary }}>v{runtime.version}</span> : null}</span>
                                <span className="shrink-0 text-xs" style={{ color: ready ? token.colorSuccess : token.colorTextSecondary }}>{t(`agent.runtimeDiscovery.${status}`)}</span>
                                {install ? (
                                    <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10" onClick={() => copyText("npm install -g @openai/codex")}>{t("agent.runtimeDiscovery.installOrConfig")}</button>
                                ) : (
                                    <button type="button" aria-label={runtime.name} aria-expanded={open} className="grid size-6 shrink-0 place-items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10" onClick={() => setExpanded(open ? null : runtime.id)}>
                                        <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} style={{ color: token.colorTextSecondary }} />
                                    </button>
                                )}
                            </div>
                            {open ? <div className="pb-3 pl-[30px] pr-2 text-xs leading-5" style={{ color: token.colorTextSecondary }}>
                                {runtime.path ? <p className="break-all">{t("agent.runtimeDiscovery.path")}: {runtime.path}</p> : null}
                                {!runtime.supported ? <p>{t("agent.runtimeDiscovery.unsupportedHint")}</p> : null}
                                {runtime.error ? <p style={{ color: token.colorError }}>{runtime.error}</p> : null}
                                {runtime.id === "codex" && connected && info?.status === "needsAuth" ? (
                                    <p className="flex items-center gap-1">{t("agent.runtimeDiscovery.authHint")}<Button type="text" size="small" className="px-1" onClick={() => copyText("codex login")}>codex login</Button></p>
                                ) : null}
                                {runtime.id === "codex" && capabilities && connected ? (
                                    <div className="mt-2 space-y-2">
                                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
                                            <dt>{t("agent.runtimeDiscovery.model")}</dt><dd className="break-all" style={{ color: token.colorText }}>{capabilities.model || t("agent.runtimeDiscovery.follow")}</dd>
                                            <dt>{t("agent.runtimeDiscovery.provider")}</dt><dd className="break-all" style={{ color: token.colorText }}>{capabilities.modelProvider || t("agent.runtimeDiscovery.follow")}</dd>
                                            <dt>{t("agent.runtimeDiscovery.reasoning")}</dt><dd style={{ color: token.colorText }}>{capabilities.reasoningEffort || t("agent.runtimeDiscovery.follow")}</dd>
                                            <dt>{t("agent.runtimeDiscovery.approval")}</dt><dd className="break-all" style={{ color: token.colorText }}>{capabilities.approvalPolicy || t("agent.runtimeDiscovery.follow")}</dd>
                                            <dt>{t("agent.runtimeDiscovery.sandbox")}</dt><dd className="break-all" style={{ color: token.colorText }}>{capabilities.sandbox || t("agent.runtimeDiscovery.follow")}</dd>
                                        </dl>
                                        {capabilities.approvalPolicy === "never" || capabilities.sandbox === "dangerFullAccess" || capabilities.sandbox === "danger-full-access" ? <p style={{ color: token.colorWarning }}>{t("agent.runtimeDiscovery.permissionNotice")}</p> : null}
                                        <details><summary className="cursor-pointer py-1" style={{ color: token.colorText }}>Skills · {capabilities.skills.length}</summary><div className="thin-scrollbar mt-1 max-h-48 space-y-2 overflow-y-auto">{capabilities.skills.map((skill, index) => <div key={`${skill.name}:${index}`}><p className="font-medium" style={{ color: token.colorText }}>{skill.name}{!skill.enabled ? ` · ${t("agent.runtimeDiscovery.disabled")}` : ""}</p><p className="mt-0.5 leading-5">{skill.description}</p></div>)}</div></details>
                                        <details><summary className="cursor-pointer py-1" style={{ color: token.colorText }}>MCP · {capabilities.mcpServers.length}</summary><div className="thin-scrollbar mt-1 max-h-48 space-y-2 overflow-y-auto">{capabilities.mcpServers.map((server) => <div key={server.name}><p className="font-medium" style={{ color: token.colorText }}>{server.name} · {server.status || t("agent.runtimeDiscovery.unknown")}</p><p className="mt-0.5 break-words leading-5">{server.tools.join(" · ") || t("agent.runtimeDiscovery.noTools")}</p></div>)}</div></details>
                                    </div>
                                ) : null}
                            </div> : null}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
