import { useEffect, useState } from "react";
import { Button, Tooltip, theme as antdTheme } from "antd";
import { Copy, LoaderCircle, Monitor, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentRuntimeView } from "./agent-runtime-view";
import { useCopyText } from "@/hooks/use-copy-text";
import { AGENT_RUNTIME_BRANDS } from "@/lib/agent/agent-runtime-brand";
import { bootstrapAgent, localConnectorInstructions } from "@/services/api/canvas-agent";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useAgentRuntimeStore } from "@/stores/use-agent-runtime-store";
import { useAgentStore } from "@/stores/use-agent-store";

function platformLabel(platform?: string, arch?: string) {
    const os = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : platform === "linux" ? "Linux" : platform || "";
    const cpu = arch === "x64" ? "x86_64" : arch || "";
    return [os, cpu ? `(${cpu})` : ""].filter(Boolean).join(" ");
}

export function AgentConnectView({ onToggleEnabled }: { onToggleEnabled: (options?: { token?: string }) => void }) {
    const { t } = useTranslation();
    const { url, token, enabled, connected, connectError, serviceStatus } = useAgentStore();
    const { catalog, info, detecting, error: runtimeError, load } = useAgentRuntimeStore();
    const { conversation, connecting, error: chatError, projectId, runtimeId, activate } = useAgentChatStore();
    const { token: colors } = antdTheme.useToken();
    const copyText = useCopyText();
    const [retrying, setRetrying] = useState(false);
    const [bootstrapFailed, setBootstrapFailed] = useState(false);
    const machine = catalog?.machine || t("agent.runtimeDiscovery.machine");
    const online = connected;
    const runtime = catalog?.runtimes.find((runtime) => runtime.id === runtimeId);
    const runtimeName = AGENT_RUNTIME_BRANDS[runtimeId].name;
    const instructions = localConnectorInstructions(runtimeName);
    const ready = Boolean(conversation?.threadId) && conversation?.status !== "error";
    const waiting = serviceStatus === "running" && !connectError && !bootstrapFailed;
    const banner = !connected
        ? waiting ? "connecting" : serviceStatus === "checking" || serviceStatus === "idle" ? "checking" : "offline"
        : detecting || connecting ? "detecting" : runtime?.status === "missing" ? "missing" : info?.runtimeId === runtimeId && info.status === "needsAuth" ? "login" : ready ? "" : "error";
    const busy = banner === "checking" || banner === "connecting" || banner === "detecting";

    useEffect(() => {
        if (serviceStatus !== "running") setBootstrapFailed(false);
        if (enabled || connected || token.trim() || serviceStatus !== "running") return;
        const endpoint = url.trim().replace(/\/$/, "");
        if (!endpoint) return;
        let cancelled = false;
        void bootstrapAgent(endpoint).then((nextToken) => {
            if (cancelled) return;
            setBootstrapFailed(false);
            const store = useAgentStore.getState();
            store.setConnectionSettings({ token: nextToken });
            store.connectAgent({ silent: true });
        }).catch(() => { if (!cancelled) setBootstrapFailed(true); });
        return () => { cancelled = true; };
    }, [connected, enabled, serviceStatus, token, url]);

    const repair = async () => {
        setRetrying(true);
        setBootstrapFailed(false);
        try {
            if (enabled) useAgentStore.getState().disconnectAgent({ connectError: "", manualDisconnect: false });
            if (serviceStatus === "running") {
                const nextToken = await bootstrapAgent(url.trim().replace(/\/$/, ""));
                const store = useAgentStore.getState();
                store.setConnectionSettings({ token: nextToken });
                store.connectAgent({ silent: true });
            }
            await load(true);
            await activate(projectId);
        } catch {
            // Connection and runtime stores retain the error for the current banner.
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4" style={{ color: colors.colorText }}>
            <section className="flex items-center gap-2 py-2" aria-label={t("agent.connectionGuide.status")}>
                <Monitor className="size-4 shrink-0" style={{ color: colors.colorTextSecondary }} />
                <div className="flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap">
                    <span className="min-w-0 truncate text-sm font-medium leading-5">{machine}</span>
                    <span className="flex min-w-0 translate-y-px items-center gap-2 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>
                        <span className="inline-flex shrink-0 items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: online ? colors.colorSuccess : colors.colorTextQuaternary }} />
                            {t(online ? "agent.runtimeDiscovery.online" : "agent.runtimeDiscovery.offline")}
                        </span>
                        <span className="min-w-0 truncate">{platformLabel(catalog?.platform, catalog?.arch)}</span>
                    </span>
                </div>
                {connected ? (
                    <button type="button" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10" onClick={() => onToggleEnabled()}>
                        <Unplug className="size-3.5" />
                        {t("agent.connect.disconnect")}
                    </button>
                ) : null}
            </section>

            {banner ? (
                <section className="min-w-0 pt-2" aria-live="polite">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 text-sm font-medium leading-6">
                            {busy ? <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : null}
                            {t(`agent.connectionGuide.${banner}`, { runtime: runtimeName })}
                        </h4>
                        {!busy ? <Tooltip title={t("agent.connectionGuide.retryHint")}>
                            <Button type="text" size="small" loading={retrying} onClick={() => void repair()} style={{ color: colors.colorTextSecondary }}>{t("agent.connectionGuide.retry")}</Button>
                        </Tooltip> : null}
                    </div>
                    {banner !== "offline" ? <p className="mt-1 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t(`agent.connectionGuide.${banner}Hint`)}</p> : null}
                    {!busy ? (
                            <div className="relative mt-2 overflow-hidden rounded-lg border focus-within:ring-1" style={{ borderColor: colors.colorBorderSecondary, background: colors.colorBgContainer }}>
                                <div className="absolute right-1 top-1">
                                    <Tooltip title={t("agent.connectionGuide.copy")}>
                                        <Button type="text" size="small" icon={<Copy className="size-3.5" />} aria-label={t("agent.connectionGuide.copy")} onClick={() => copyText(instructions, t("agent.connectionGuide.copied"))}>{t("common.copy")}</Button>
                                    </Tooltip>
                                </div>
                                <textarea readOnly rows={5} value={instructions} aria-label={t("agent.connectionGuide.prompt")} className="thin-scrollbar block w-full resize-none border-0 bg-transparent py-2 pl-3 pr-20 text-xs leading-5 outline-none" style={{ color: colors.colorTextSecondary }} />
                            </div>
                    ) : null}
                </section>
            ) : null}

            <AgentRuntimeView />
            {connectError || chatError || runtimeError ? <p role="alert" className="mt-3 break-words text-xs leading-5" style={{ color: colors.colorError }}>{connectError || chatError || runtimeError}</p> : null}
        </div>
    );
}
