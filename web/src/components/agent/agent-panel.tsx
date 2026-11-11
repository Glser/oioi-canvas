import type { PointerEvent as ReactPointerEvent } from "react";
import { ConfigProvider } from "antd";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import styles from "./agent-panel.module.css";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { LocalAgentPanel } from "./local-agent-panel";
import { CANVAS_AGENT_PANEL_MOTION_MS, useAgentStore } from "@/stores/use-agent-store";
import { useThemeStore } from "@/stores/use-theme-store";

const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;

export function AgentPanel() {
    const { t } = useTranslation();
    const appearance = getWorkbenchAppearance(useThemeStore((state) => state.theme) === "dark");
    const width = useAgentStore((state) => state.width);
    const reduceMotion = useReducedMotion();
    const panelMounted = useAgentStore((state) => state.panelMounted);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const panelClosing = useAgentStore((state) => state.panelClosing);
    const setAgentState = useAgentStore((state) => state.setAgentState);
    const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        let nextWidth = startWidth;
        const onMove = (moveEvent: PointerEvent) => {
            nextWidth = Math.min(760, Math.max(360, startWidth + startX - moveEvent.clientX));
            setAgentState({ width: nextWidth });
        };
        const onUp = () => {
            localStorage.setItem("oioi-canvas-agent-panel-width", String(nextWidth));
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };

    if (!panelMounted) return null;

    return (
        <ConfigProvider theme={appearance.theme} tooltip={appearance.tooltip}>
        <motion.div
            className={`${styles.shell} pointer-events-none absolute inset-y-0 right-0 z-[70] flex`}
            initial={{ x: reduceMotion ? 0 : "100%", opacity: 0 }}
            animate={{ x: panelOpen || reduceMotion ? 0 : "100%", opacity: panelOpen ? 1 : 0 }}
            transition={{ duration: PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ ...appearance.style, width: width + 1, maxWidth: "100%" }}
            inert={!panelOpen || panelClosing}
        >
            <aside
                className={`${styles.panel} relative flex min-h-0 min-w-0 flex-1 flex-col`}
                data-canvas-shortcuts-ignore
                style={{ pointerEvents: panelOpen && !panelClosing ? "auto" : "none" }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onPointerDown={startResize} aria-label={t("agent.panel.resize")} />
                <LocalAgentPanel embedded />
            </aside>
        </motion.div>
        </ConfigProvider>
    );
}
