import { useState } from "react";
import { Input, Tooltip } from "antd";
import { Copy, KeyRound, Link2, PlugZap } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import { canvasThemes } from "@/lib/canvas-theme";
import { useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

const AGENT_START_COMMAND = "npx -y @oioi-npm/canvas-agent@latest";
const MCP_COMMANDS = {
    Codex: "codex mcp add oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp",
    "Claude Code": "claude mcp add --scope user --transport stdio oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp",
};

export function AgentConnectView({ onToggleEnabled }: { onToggleEnabled: () => void }) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { url, token, enabled, connected, connectError, clientId, canvasContext, setAgentState } = useAgentStore();
    const [agent, setAgent] = useState<keyof typeof MCP_COMMANDS>("Codex");
    const copyText = useCopyText();
    const targetTitle = canvasContext?.snapshot.title || t("agent.connect.noCanvas");
    const prompt = t("agent.connect.examplePrompt", { clientId, title: targetTitle });
    const commandBlock = (command: string) => (
        <div className="mt-2 flex items-start gap-2 rounded-xl px-2.5 py-2" style={{ background: theme.node.fill }}>
            <code className="min-w-0 flex-1 break-all text-[11px] leading-5">{command}</code>
            <Tooltip title={t("agent.connect.copyCommand")}>
                <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10" aria-label={t("agent.connect.copyCommand")} onClick={() => copyText(command)}>
                    <Copy className="size-3.5" />
                </button>
            </Tooltip>
        </div>
    );

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-1">
            <p className="mb-4 text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.description")}</p>
            <div className="grid gap-3">
                <section className="rounded-2xl border border-black/[0.06] p-3.5 dark:border-white/[0.08]" style={{ background: theme.node.panel }}>
                    <h3 className="text-sm font-medium leading-5">{t("agent.connect.directTitle")}</h3>
                    <p className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.directText")}</p>
                    {commandBlock(AGENT_START_COMMAND)}
                </section>
                <section className="rounded-2xl border border-black/[0.06] p-3.5 dark:border-white/[0.08]" style={{ background: theme.node.panel }}>
                    <h3 className="text-sm font-medium leading-5">{t("agent.connect.mcpTitle")}</h3>
                    <p className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.mcpText")}</p>
                    <div className="mt-2 flex gap-1">
                        {(Object.keys(MCP_COMMANDS) as (keyof typeof MCP_COMMANDS)[]).map((name) => (
                            <button type="button" key={name} aria-pressed={agent === name} onClick={() => setAgent(name)} className="rounded-full px-2.5 py-1 text-xs transition hover:bg-black/5 dark:hover:bg-white/10" style={{ background: agent === name ? theme.toolbar.activeBg : "transparent" }}>{name}</button>
                        ))}
                    </div>
                    {commandBlock(MCP_COMMANDS[agent])}
                </section>
                <section className="rounded-2xl border border-black/[0.06] p-3.5 dark:border-white/[0.08]" style={{ background: theme.node.panel }}>
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium leading-5">{t("agent.connect.webConnection")}</h3>
                        <button type="button" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition hover:bg-black/5 dark:hover:bg-white/10" onClick={onToggleEnabled}>
                            <PlugZap className="size-3.5" />
                            {enabled ? t("agent.connect.disconnect") : t("agent.connect.connect")}
                        </button>
                    </div>
                    <p className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.connectionText")}</p>
                    <div className="mt-3 grid gap-2.5">
                        <label className="grid gap-1.5">
                            <span className="text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("agent.connect.localAddress")}</span>
                            <Input className="!h-9 !rounded-xl" prefix={<Link2 className="mr-1 size-3.5" style={{ color: theme.node.faint }} />} value={url} disabled={enabled} onChange={(event) => setAgentState({ url: event.target.value, connectError: "" })} placeholder={t("agent.connect.urlPlaceholder")} />
                        </label>
                        <label className="grid gap-1.5">
                            <span className="text-[11px] font-medium" style={{ color: theme.node.muted }}>{t("agent.connect.token")}</span>
                            <Input.Password className="!h-9 !rounded-xl" prefix={<KeyRound className="mr-1 size-3.5" style={{ color: theme.node.faint }} />} value={token} disabled={enabled} onChange={(event) => setAgentState({ token: event.target.value, connectError: "" })} placeholder={t("agent.connect.tokenPlaceholder")} />
                        </label>
                        {connectError ? <p role="alert" className="text-xs leading-5 text-red-600 dark:text-red-400">{connectError}</p> : null}
                    </div>
                </section>
                <section className="px-1 pt-1">
                    <h3 className="text-sm font-medium leading-5">{t("agent.connect.useTitle")}</h3>
                    <p className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.useText")}</p>
                    {connected && clientId ? (
                        <div className="mt-2">
                            <div className="text-xs leading-5">{t("agent.connect.currentTarget", { title: targetTitle })}</div>
                            <div className="break-all text-[11px] leading-5" style={{ color: theme.node.muted }}>clientId: {clientId}</div>
                            <button type="button" className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-xs transition hover:bg-black/5 dark:hover:bg-white/10" onClick={() => copyText(prompt)}><Copy className="size-3.5" />{t("agent.connect.copyPrompt")}</button>
                        </div>
                    ) : null}
                    <p className="mt-2 text-[11px] leading-5" style={{ color: theme.node.muted }}>{t("agent.connect.localOnly")}</p>
                </section>
            </div>
        </div>
    );
}
