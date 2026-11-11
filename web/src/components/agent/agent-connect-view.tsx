import { useState } from "react";
import { Button, Input, theme as antdTheme } from "antd";
import { ChevronDown, Copy, KeyRound, Link2, LoaderCircle, Unplug, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAgentServiceProbe } from "@/hooks/use-agent-service-probe";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAgentStore } from "@/stores/use-agent-store";

const AGENT_START_COMMAND = "npx -y @oioi-npm/canvas-agent@latest";
const AGENT_PROTOCOL_VERSION = 7;
const MCP_COMMANDS = {
    Codex: "codex mcp add oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp",
    "Claude Code": "claude mcp add --scope user --transport stdio oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp",
};

export function AgentConnectView({ onToggleEnabled }: { onToggleEnabled: (options?: { token?: string }) => void }) {
    const { t } = useTranslation();
    const { url, token, enabled, connected, connectError, clientId, canvasContext, pendingTask, setAgentState } = useAgentStore();
    const [agent, setAgent] = useState<keyof typeof MCP_COMMANDS>("Codex");
    const [pairCode, setPairCode] = useState("");
    const [pairing, setPairing] = useState(false);
    const [pairAgain, setPairAgain] = useState(false);
    const { token: colors } = antdTheme.useToken();
    const copyText = useCopyText();
    const { status: serviceStatus, probe } = useAgentServiceProbe(url, AGENT_PROTOCOL_VERSION);
    const targetTitle = canvasContext?.snapshot.title || t("agent.connect.noCanvas");
    const prompt = t("agent.connect.examplePrompt", { clientId, title: targetTitle });
    const savedToken = Boolean(token.trim());
    const showPairForm = serviceStatus === "running" && !enabled && (!savedToken || pairAgain || Boolean(connectError));
    const needsService = serviceStatus === "stopped" || serviceStatus === "outdated";
    const actionClass = "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";

    /** 用终端里的配对码换连接 token，成功后自动填入并连接。 */
    const handlePair = async () => {
        const code = pairCode.trim();
        if (code.length !== 6 || pairing || enabled) return;
        setPairAgain(true);
        setPairing(true);
        setAgentState({ connectError: "" });
        try {
            const endpoint = url.trim().replace(/\/$/, "");
            const response = await fetch(`${endpoint}/pair`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ pairCode: code }),
            });
            const data = (await response.json()) as { ok?: boolean; token?: string; error?: string };
            if (!response.ok || !data.ok || !data.token) {
                setAgentState({ connectError: data.error || t("agent.connect.pairFailed") });
                return;
            }
            setPairCode("");
            onToggleEnabled({ token: data.token });
        } catch {
            setAgentState({ connectError: t("agent.connect.pairFailed") });
        } finally {
            setPairing(false);
            void probe();
        }
    };
    const commandBlock = (command: string) => (
        <div className="mt-3 flex min-w-0 items-center gap-2 py-1">
            <code className="min-w-0 flex-1 whitespace-normal text-xs leading-5 [overflow-wrap:anywhere]" style={{ color: colors.colorTextSecondary }}>{command}</code>
            <button type="button" className={`${actionClass} shrink-0 whitespace-nowrap`} onClick={() => copyText(command)}>
                <Copy className="size-4" />{t("agent.connect.copyCommand")}
            </button>
        </div>
    );

    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-1" style={{ color: colors.colorText }}>
            <p className="mb-6 text-sm leading-6" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.description")}</p>
            <div className="grid gap-6">
                {!connected ? (
                    <section aria-label={t("agent.connect.webConnection")}>
                        <h3 className="text-sm font-medium">{t(needsService ? "agent.connect.directTitle" : enabled ? "agent.status.connecting" : serviceStatus === "running" ? "agent.connect.webConnection" : "agent.connect.connectionText")}</h3>
                        {needsService ? (
                            <>
                                <p className="mt-2 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t(serviceStatus === "outdated" ? "agent.connect.protocolMismatch" : "agent.connect.directText")}</p>
                                {commandBlock(AGENT_START_COMMAND)}
                            </>
                        ) : enabled ? (
                            <div className="mt-3 flex items-center gap-2 text-xs" role="status">
                                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                                <span>{t("agent.connect.connectingHint")}</span>
                                <button type="button" className={actionClass} onClick={() => onToggleEnabled()}>{t("agent.connect.disconnect")}</button>
                            </div>
                        ) : showPairForm ? (
                            <div className="mt-3 grid gap-2">
                                <label className="grid gap-2">
                                    <span className="text-xs" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.pairHint")}</span>
                                    <div className="flex items-center gap-2">
                                        <Input aria-label={t("agent.connect.pairCode")} className="!h-10 !rounded-lg" value={pairCode} inputMode="numeric" autoComplete="one-time-code" onChange={(event) => { setPairAgain(true); setPairCode(event.target.value.replace(/\D/g, "")); }} placeholder={t("agent.connect.pairCodePlaceholder")} onPressEnter={() => void handlePair()} maxLength={6} disabled={pairing} />
                                        <Button className="!h-10 !rounded-lg !font-medium" type="text" loading={pairing} disabled={pairCode.length !== 6} onClick={() => void handlePair()}>{t("agent.connect.pairSubmit")}</Button>
                                    </div>
                                </label>
                            </div>
                        ) : serviceStatus === "running" && savedToken ? (
                            <div className="mt-3 grid gap-2">
                                <p className="text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.reconnectHint")}</p>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className={actionClass} onClick={() => onToggleEnabled()}>{t("agent.connect.connect")}</button>
                                    <button type="button" className={actionClass} style={{ color: colors.colorTextSecondary }} onClick={() => setPairAgain(true)}>{t("agent.connect.pairAgain")}</button>
                                </div>
                            </div>
                        ) : null}
                        {connectError ? <p role="alert" className="mt-3 text-xs leading-5" style={{ color: colors.colorError }}>{connectError}</p> : null}
                    </section>
                ) : (
                    <section>
                        <h3 className="text-sm font-medium">{t("agent.connect.useTitle", { agent })}</h3>
                        <p className="mt-2 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.useText", { agent })}</p>
                        <p className="mt-3 truncate text-xs" title={targetTitle} style={{ color: colors.colorTextSecondary }}>{t("agent.connect.currentTarget", { title: targetTitle })}</p>
                        {!pendingTask && clientId ? <button type="button" className={`${actionClass} mt-3`} onClick={() => copyText(prompt)}><Copy className="size-4" />{t("agent.connect.copyPrompt", { agent })}</button> : null}
                    </section>
                )}
                {pendingTask ? (
                    <section>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-medium">{t("agent.connect.pendingTask")}</h3>
                            <button type="button" className={actionClass} aria-label={t("agent.connect.clearTask")} onClick={() => setAgentState({ pendingTask: "" })}><X className="size-4" /></button>
                        </div>
                        <p className="mt-2 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.pendingTaskHint", { agent })}</p>
                        <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{pendingTask}</p>
                        <button type="button" className={`${actionClass} mt-3`} disabled={!connected || !clientId} onClick={() => copyText(t("agent.connect.pendingTaskPrompt", { clientId, title: targetTitle, prompt: pendingTask }))}><Copy className="size-4" />{t("agent.connect.copyTaskPrompt")}</button>
                    </section>
                ) : null}
                <details className="group" open={!connected}>
                    <summary className="cursor-pointer list-none py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center justify-between gap-2"><span>{t("agent.connect.mcpTitle", { agent })}</span><ChevronDown className="size-4 shrink-0 group-open:rotate-180" /></span>
                    </summary>
                    <p className="mt-2 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.mcpText", { agent })}</p>
                    <div className="mt-2 flex gap-1">
                        {(Object.keys(MCP_COMMANDS) as (keyof typeof MCP_COMMANDS)[]).map((name) => (
                            <button type="button" key={name} aria-pressed={agent === name} onClick={() => setAgent(name)} className={actionClass} style={{ background: agent === name ? colors.controlItemBgActive : "transparent" }}>{name}</button>
                        ))}
                    </div>
                    {commandBlock(MCP_COMMANDS[agent])}
                </details>
                <details className="group">
                    <summary className="cursor-pointer list-none py-2 text-xs [&::-webkit-details-marker]:hidden" style={{ color: colors.colorTextSecondary }}>
                        <span className="flex items-center justify-between gap-2"><span>{t("agent.connect.connectionSettings")}</span><ChevronDown className="size-4 shrink-0 group-open:rotate-180" /></span>
                    </summary>
                    <p className="mt-2 text-xs leading-5" style={{ color: colors.colorTextSecondary }}>{t("agent.connect.localOnly")}</p>
                    <div className="mt-3 grid gap-3">
                        <label className="grid gap-2">
                            <span className="text-xs">{t("agent.connect.localAddress")}</span>
                            <Input className="!h-10 !rounded-lg" prefix={<Link2 className="size-4" />} value={url} disabled={enabled} onChange={(event) => setAgentState({ url: event.target.value, connectError: "" })} placeholder={t("agent.connect.urlPlaceholder")} />
                        </label>
                        <label className="grid gap-2">
                            <span className="text-xs">{t("agent.connect.token")}</span>
                            <Input.Password className="!h-10 !rounded-lg" prefix={<KeyRound className="size-4" />} value={token} disabled={enabled} onChange={(event) => setAgentState({ token: event.target.value, connectError: "" })} placeholder={t("agent.connect.tokenPlaceholder")} />
                        </label>
                        {clientId ? <p className="break-all text-xs" style={{ color: colors.colorTextSecondary }}>clientId: {clientId}</p> : null}
                        <button type="button" className={`${actionClass} justify-self-start`} disabled={!enabled && (!url.trim() || !savedToken)} onClick={() => onToggleEnabled()}>
                            {enabled ? <Unplug className="size-4" /> : <Link2 className="size-4" />}{t(enabled ? "agent.connect.disconnect" : "agent.connect.connect")}
                        </button>
                    </div>
                </details>
            </div>
        </div>
    );
}
