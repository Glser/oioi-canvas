import { useMemo } from "react";
import { theme } from "antd";
import { Check, ChevronDown, CircleAlert, LoaderCircle, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { AGENT_RUNTIME_BRANDS } from "@/lib/agent/agent-runtime-brand";
import type { AgentMessage } from "@/services/api/canvas-agent";
import styles from "./agent-messages.module.css";

const messageKey = (item: AgentMessage) => JSON.stringify([item.threadId, item.turnId, item.itemId]);

export function AgentMessages() {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const messages = useAgentChatStore((state) => state.conversation?.messages);
    const runtimeId = useAgentChatStore((state) => state.conversation?.runtimeId || state.runtimeId);
    const runtimeBrand = AGENT_RUNTIME_BRANDS[runtimeId];
    const groups = useMemo(() => {
        const result: AgentMessage[][] = [];
        for (const item of messages || []) {
            const previous = result.at(-1);
            if (item.role === "tool" && previous?.[0].role === "tool" && previous[0].threadId === item.threadId && previous[0].turnId === item.turnId) previous.push(item);
            else result.push([item]);
        }
        return result;
    }, [messages]);

    return <div className={`${styles.messages} min-w-0 w-full`} aria-label={t("agent.conversation.messages")}>
        {groups.map((items) => {
            const item = items[0];
            if (item.role === "tool") {
                const active = items.some((tool) => tool.status === "inProgress");
                const failed = items.some((tool) => tool.status === "failed" || tool.status === "declined");
                return <details key={messageKey(item)} className="group ml-7 min-w-0 text-xs" data-message-role="tool" style={{ color: token.colorTextSecondary }}>
                    <summary className={`${styles.toolSummary} h-6 max-w-full cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded leading-6 focus-visible:outline focus-visible:outline-2 [&::-webkit-details-marker]:hidden`}>
                        {active ? <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" /> : <Wrench className="size-3.5 shrink-0" />}
                        <span className="min-w-0 truncate">{t("agent.toolCalls.count", { count: items.length })}</span>
                        {active || failed ? <span className="shrink-0" style={failed ? { color: token.colorError } : undefined}>{t(`agent.conversation.toolStatus.${active ? "inProgress" : "failed"}`)}</span> : null}
                        <ChevronDown className="size-3.5 shrink-0 group-open:rotate-180" />
                    </summary>
                    <div className={`${styles.toolDetails} space-y-2 pt-1`}>
                        {items.map((tool, index) => <div key={messageKey(tool)}>
                            <div className="mb-1 flex items-center gap-2" style={tool.status === "failed" || tool.status === "declined" ? { color: token.colorError } : undefined}>
                                {tool.status === "inProgress" ? <LoaderCircle className="size-3 shrink-0 animate-spin motion-reduce:animate-none" /> : tool.status === "failed" || tool.status === "declined" ? <CircleAlert className="size-3 shrink-0" /> : <Check className="size-3 shrink-0" />}
                                <span>{t("agent.toolCalls.item", { index: index + 1 })}{tool.status ? ` · ${t(`agent.conversation.toolStatus.${tool.status}`, { defaultValue: tool.status })}` : ""}</span>
                            </div>
                            <pre className="whitespace-pre-wrap break-words font-sans leading-5 [overflow-wrap:anywhere]">{tool.text}</pre>
                        </div>)}
                    </div>
                </details>;
            }
            return <article key={messageKey(item)} data-message-role={item.role} aria-label={item.role === "user" ? t("agent.conversation.you") : runtimeBrand.name} className={`min-w-0 w-full items-start ${item.role === "user" ? "flex justify-end" : "grid grid-cols-[20px_minmax(0,1fr)] gap-2"}`}>
                {item.role === "user" ? <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tr-sm px-3 py-2.5 text-left text-sm leading-6 [overflow-wrap:anywhere]" style={{ background: token.colorFillSecondary }}>{item.text || "…"}</div> : <>
                    <img src={runtimeBrand.icon} alt="" aria-hidden="true" className="mt-1 size-5 object-contain" />
                    <Streamdown className={`agent-streamdown ${styles.markdown} text-sm leading-7`} isAnimating={item.status === "inProgress"} controls={false} skipHtml>{item.text || "…"}</Streamdown>
                </>}
            </article>;
        })}
    </div>;
}
