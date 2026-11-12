import { useEffect, useState } from "react";
import { Button, theme as antdTheme } from "antd";
import { Copy, LoaderCircle, Monitor, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentRuntimeView } from "./agent-runtime-view";
import { useCopyText } from "@/hooks/use-copy-text";
import { bootstrapAgent, localConnectorCommand } from "@/services/api/canvas-agent";
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
    const { conversation, connecting, error: chatError, projectId, activate } = useAgentChatStore();
    const { token: colors } = antdTheme.useToken();
    const copyText = useCopyText();
    const [retrying, setRetrying] = useState(false);
    const [bootstrapFailed, setBootstrapFailed] = useState(false);
    const command = localConnectorCommand();
    const machine = catalog?.machine || t("agent.runtimeDiscovery.machine");
    const online = connected;
    const codex = catalog?.runtimes.find((runtime) => runtime.id === "codex");
    const ready = projectId ? Boolean(conversation?.threadId) && conversation?.status !== "error" : info?.status === "ready";
    const waiting = serviceStatus === "running" && !connectError && !bootstrapFailed;
    const banner = !connected
        ? serviceStatus === "outdated" ? "outdated" : waiting ? "connecting" : serviceStatus === "checking" || serviceStatus === "idle" ? "checking" : "offline"
        : detecting || connecting ? "detecting" : codex?.status === "missing" ? "missing" : info?.status === "needsAuth" ? "login" : ready ? "" : "error";
    const actionCommand = banner === "offline" || banner === "outdated" ? command : banner === "missing" ? "npm install -g @openai/codex" : banner === "login" ? "codex login" : "";

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
        if (actionCommand) copyText(actionCommand);
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
            if (projectId) await activate(projectId);
        } catch {
            // Keep the current banner; the copied command is the next action.
        } finally {
            setRetrying(false);
        }
    };

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4" style={{ color: colors.colorText }}>
            <section className="flex items-start gap-3 py-4" aria-label={t("agent.connectionGuide.status")}>
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl" style={{ background: colors.colorFillSecondary }}>
                    <Monitor className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold leading-6">{machine}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="size-1.5 rounded-full" style={{ background: online ? colors.colorSuccess : colors.colorTextQuaternary }} />
                            {t(online ? "agent.runtimeDiscovery.online" : "agent.runtimeDiscovery.offline")}
                        </span>
                        <span>{platformLabel(catalog?.platform, catalog?.arch) || t("agent.runtimeDiscovery.localMachine")}</span>
                    </p>
                </div>
                {connected ? (
                    <button type="button" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/10" onClick={() => onToggleEnabled()}>
                        <Unplug className="size-3.5" />
                        {t("agent.connect.disconnect")}
                    </button>
                ) : null}
            </section>

            {banner ? (
                <section className="rounded-2xl px-4 py-3" style={{ background: banner === "connecting" || banner === "checking" || banner === "detecting" ? colors.colorFillTertiary : colors.colorSuccessBg || colors.colorFillSecondary }} aria-live="polite">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-6">{t(`agent.connectionGuide.${banner}`)}</p>
                            <p className="mt-1 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t(`agent.connectionGuide.${banner}Hint`)}</p>
                            {actionCommand ? (
                                <div className="mt-3 flex min-w-0 items-start gap-2">
                                    <code className="min-w-0 flex-1 break-all py-1 text-xs leading-5">{actionCommand}</code>
                                    <Button type="text" size="small" className="shrink-0" icon={<Copy className="size-3.5" />} aria-label={t("agent.connectionGuide.copy")} onClick={() => copyText(actionCommand)} />
                                </div>
                            ) : (banner === "checking" || banner === "connecting" || banner === "detecting") ? (
                                <p className="mt-2 inline-flex items-center gap-2 text-xs" style={{ color: colors.colorTextSecondary }}>
                                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                                    {t("agent.connectionGuide.wait")}
                                </p>
                            ) : null}
                        </div>
                        {banner === "offline" || banner === "outdated" || banner === "missing" || banner === "login" || banner === "error" ? (
                            <Button type="text" className="shrink-0" loading={retrying} onClick={() => void repair()}>{t(banner === "offline" || banner === "outdated" ? "agent.connectionGuide.repair" : "agent.connectionGuide.retry")}</Button>
                        ) : null}
                    </div>
                </section>
            ) : !projectId ? (
                <p className="text-sm leading-6" style={{ color: colors.colorTextSecondary }}>{t("agent.connectionGuide.homeReady")}</p>
            ) : null}

            <AgentRuntimeView />
            {connectError || chatError || runtimeError ? <p role="alert" className="mt-3 break-words text-xs leading-5" style={{ color: colors.colorError }}>{connectError || chatError || runtimeError}</p> : null}
        </div>
    );
}
