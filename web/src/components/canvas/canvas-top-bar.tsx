import { useEffect, useRef, useState } from "react";
import { BookOpen, Bot, Download, Home, Images, Menu, PanelLeftOpen, Plus, Redo2, Trash2, Undo2, Upload } from "lucide-react";
import { Dropdown, Modal, Tooltip } from "antd";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { canvasThemes } from "@/lib/canvas-theme";
import { AGENT_RUNTIME_BRANDS } from "@/lib/agent/agent-runtime-brand";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useCanvasSidePanelStore } from "@/stores/use-canvas-side-panel-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useNewApiStore } from "@/stores/use-newapi-store";
import { CANVAS_AGENT_PANEL_MOTION_MS } from "@/stores/use-agent-store";
import { useCanvasToolbarLayout } from "./use-canvas-toolbar-layout";
import styles from "./canvas-top-bar.module.css";

export function CanvasTopBar({
    title,
    titleDraft,
    isTitleEditing,
    onTitleDraftChange,
    onStartTitleEditing,
    onFinishTitleEditing,
    onCancelTitleEditing,
    canUndo,
    canRedo,
    onHome,
    onProjects,
    onCreateProject,
    onDeleteProject,
    onExportProject,
    onImportImage,
    onOpenPlugins,
    onUndo,
    onRedo,
    agentOpen,
    compactAgentStatus,
    onToggleAgent,
}: {
    title: string;
    titleDraft: string;
    isTitleEditing: boolean;
    onTitleDraftChange: (value: string) => void;
    onStartTitleEditing: () => void;
    onFinishTitleEditing: () => void;
    onCancelTitleEditing: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onHome: () => void;
    onProjects: () => void;
    onCreateProject: () => void;
    onDeleteProject: () => void;
    onExportProject: () => void;
    onImportImage: () => void;
    onOpenPlugins: () => void;
    onUndo: () => void;
    onRedo: () => void;
    agentOpen: boolean;
    compactAgentStatus: { connected: boolean; enabled: boolean; activity: string };
    onToggleAgent: () => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const { t } = useTranslation();
    const theme = canvasThemes[colorTheme];
    const titleRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const insets = useCanvasToolbarLayout(toolbarRef);
    const reduceMotion = useReducedMotion();
    const transition = { duration: reduceMotion ? 0 : CANVAS_AGENT_PANEL_MOTION_MS / 1000, ease: [0.22, 1, 0.36, 1] as const };
    const [shortcutsOpen, setShortcutsOpen] = useState(false);
    const sidePanelOpen = useCanvasSidePanelStore((state) => state.panelOpen);
    const toggleSidePanel = useCanvasSidePanelStore((state) => state.togglePanel);
    const docsLink = useNewApiStore((state) => state.docsLink);

    useEffect(() => {
        if (!isTitleEditing) return;
        const close = (event: PointerEvent) => {
            if (!titleRef.current?.contains(event.target as Node)) onFinishTitleEditing();
        };
        document.addEventListener("pointerdown", close, true);
        return () => document.removeEventListener("pointerdown", close, true);
    }, [isTitleEditing, onFinishTitleEditing]);

    return (
        <>
            <div ref={toolbarRef} data-canvas-toolbar className={`${styles.shell} pointer-events-none absolute top-0 z-50`} style={insets}>
                <div className={styles.toolbar}>
                    <motion.div layout="position" layoutDependency={`${sidePanelOpen}:${agentOpen}`} transition={transition} className={`${styles.identity} pointer-events-auto`}>
                        {!sidePanelOpen ? <Tooltip trigger={["hover", "focus"]} title={t("canvas.expandPanel")}>
                            <button
                                type="button"
                                onClick={toggleSidePanel}
                                aria-label={t("canvas.expandPanel")}
                                className="grid size-7 shrink-0 place-items-center rounded-full transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10"
                                style={{ color: theme.node.text }}
                            >
                                <PanelLeftOpen className="size-4" />
                            </button>
                        </Tooltip> : null}
                        <Tooltip trigger={["hover", "focus"]} title={t("canvas.backHome")}>
                            <button
                                type="button"
                                onClick={onHome}
                                aria-label={t("canvas.backHome")}
                                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10"
                                style={{ color: theme.node.text }}
                            >
                                <Home className="size-4" />
                                <span className={styles.homeLabel}>{t("canvas.backHome")}</span>
                            </button>
                        </Tooltip>
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "home", icon: <Home className="size-4" />, label: t("canvas.home"), onClick: onHome },
                                    ...(docsLink ? [{ key: "docs", icon: <BookOpen className="size-4" />, label: t("canvas.docs"), onClick: () => window.open(docsLink, "_blank", "noopener,noreferrer") }] : []),
                                    { key: "projects", icon: <Images className="size-4" />, label: t("canvas.projects"), onClick: onProjects },
                                    { type: "divider" },
                                    { key: "new", icon: <Plus className="size-4" />, label: t("canvas.create"), onClick: onCreateProject },
                                    { key: "delete", danger: true, icon: <Trash2 className="size-4" />, label: t("canvas.deleteCurrent"), onClick: onDeleteProject },
                                    { type: "divider" },
                                    { key: "import", icon: <Upload className="size-4" />, label: t("canvas.importAsset"), onClick: onImportImage },
                                    { key: "export", icon: <Download className="size-4" />, label: t("canvas.exportCurrent"), onClick: onExportProject },
                                    { type: "divider" },
                                    { key: "undo", disabled: !canUndo, icon: <Undo2 className="size-4" />, label: <MenuLabel text={t("canvas.undo")} shortcut="⌘ Z" />, onClick: onUndo },
                                    { key: "redo", disabled: !canRedo, icon: <Redo2 className="size-4" />, label: <MenuLabel text={t("canvas.redo")} shortcut="⌘ ⇧ Z / ⌘ Y" />, onClick: onRedo },
                                ],
                            }}
                        >
                            <Tooltip trigger={["hover", "focus"]} title={t("canvas.openMenu")}>
                                <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10" style={{ color: theme.node.text }} aria-label={t("canvas.openMenu")}>
                                    <Menu className="size-4" />
                                </button>
                            </Tooltip>
                        </Dropdown>
                    </motion.div>

                    <motion.div layout="position" layoutDependency={`${sidePanelOpen}:${agentOpen}`} transition={transition} className={`${styles.actions} pointer-events-auto`}>
                        <div ref={titleRef} className={`flex min-w-0 items-center gap-2 ${styles.titleGroup}`}>
                            {isTitleEditing ? (
                                <input
                                    autoFocus
                                    value={titleDraft}
                                    onChange={(event) => onTitleDraftChange(event.target.value)}
                                    onBlur={onFinishTitleEditing}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") onFinishTitleEditing();
                                        if (event.key === "Escape") onCancelTitleEditing();
                                    }}
                                    className="min-w-0 w-full max-w-[280px] bg-transparent p-0 text-left text-lg font-semibold tracking-normal outline-none"
                                    aria-label={t("canvas.renameHint")}
                                    style={{ color: theme.node.text }}
                                />
                            ) : (
                                <Tooltip trigger={["hover", "focus"]} title={t("canvas.renameHint")}>
                                    <button
                                        type="button"
                                        className={`${styles.title} min-w-0 max-w-[280px] border-b border-dashed border-transparent text-left text-lg font-semibold tracking-normal transition hover:border-current focus-visible:outline-2 focus-visible:outline-current`}
                                        style={{ color: theme.node.text }}
                                        onDoubleClick={onStartTitleEditing}
                                    >
                                        {title}
                                    </button>
                                </Tooltip>
                            )}
                        </div>
                        {!agentOpen ? <AgentRuntimeButton status={compactAgentStatus} onClick={onToggleAgent} /> : null}
                        <UserStatusActions variant="canvas" onOpenShortcuts={() => setShortcutsOpen(true)} onOpenPlugins={onOpenPlugins} />
                    </motion.div>
                </div>
            </div>
            <Modal title={t("canvas.shortcuts")} open={shortcutsOpen} onCancel={() => setShortcutsOpen(false)} footer={null} centered>
                <div className="space-y-2 border-t pt-4 text-sm" style={{ borderColor: theme.node.stroke }}>
                    <Shortcut keys={["Ctrl / Space", t("canvas.shortcut.drag")]} value={t("canvas.shortcut.toggleTool")} />
                    <Shortcut keys={[t("canvas.shortcut.wheel")]} value={t("canvas.shortcut.zoom")} />
                    <Shortcut keys={[t("canvas.shortcut.zoomSlider")]} value={t("canvas.shortcut.preciseZoom")} />
                    <Shortcut keys={[t("canvas.shortcut.drag")]} value={t("canvas.shortcut.boxSelect")} />
                    <Shortcut keys={["Shift / Cmd", t("canvas.shortcut.click")]} value={t("canvas.shortcut.addSelection")} />
                    <Shortcut keys={["Ctrl / Cmd", "A"]} value={t("canvas.shortcut.selectAll")} />
                    <Shortcut keys={["Ctrl / Cmd", "C / V"]} value={t("canvas.shortcut.copyPaste")} />
                    <Shortcut keys={["Ctrl / Cmd", "G"]} value={t("canvas.shortcut.group")} />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "G"]} value={t("canvas.shortcut.ungroup")} />
                    <Shortcut keys={["Ctrl / Cmd", "Z"]} value={t("canvas.undo")} />
                    <Shortcut keys={["Ctrl / Cmd", "Shift", "Z"]} value={t("canvas.redo")} />
                    <Shortcut keys={["Ctrl / Cmd", "Y"]} value={t("canvas.redo")} />
                    <Shortcut keys={["Delete / Backspace"]} value={t("canvas.shortcut.delete")} />
                    <Shortcut keys={["Esc"]} value={t("canvas.shortcut.escape")} />
                    <Shortcut keys={[t("canvas.shortcut.dropMedia")]} value={t("canvas.shortcut.upload")} />
                </div>
            </Modal>
        </>
    );
}

function MenuLabel({ text, shortcut }: { text: string; shortcut: string }) {
    return (
        <span className="flex min-w-36 items-center justify-between gap-8">
            <span>{text}</span>
            <span className="text-xs opacity-45">{shortcut}</span>
        </span>
    );
}

function AgentRuntimeButton({ status, onClick }: { status: { connected: boolean; enabled: boolean; activity: string }; onClick: () => void }) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const { t } = useTranslation();
    const sessionRuntimeId = useAgentChatStore((state) => state.conversation?.runtimeId);
    const selectedRuntimeId = useAgentChatStore((state) => state.runtimeId);
    const runtimeId = sessionRuntimeId || selectedRuntimeId;
    const brand = status.connected ? AGENT_RUNTIME_BRANDS[runtimeId] : undefined;
    const dotColor = status.connected ? "#22c55e" : status.enabled ? "#f59e0b" : theme.node.muted;
    const tooltip = brand ? `${brand.name} · ${t("canvas.agentConnected")}` : t("canvas.openAgent");
    return (
        <Tooltip trigger={["hover", "focus"]} title={tooltip}>
            <button type="button" className="relative grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10" style={{ color: theme.node.text }} onClick={onClick} aria-label={tooltip}>
                {brand ? <img src={brand.icon} alt="" className="size-[18px] object-contain" /> : <Bot className="size-4" />}
                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-black/10 dark:border-white/20" style={{ background: dotColor }} />
            </button>
        </Tooltip>
    );
}

function Shortcut({ keys, value }: { keys: string[]; value: string }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-6 rounded-lg px-1 py-1.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                {keys.map((key, index) => (
                    <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                        {index ? <span className="text-xs opacity-35">+</span> : null}
                        <kbd
                            className="min-w-9 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,.08),0_1px_2px_rgba(0,0,0,.06)]"
                            style={{ borderColor: "rgba(120,113,108,.28)", background: "linear-gradient(#fff, rgba(245,245,244,.92))", color: "rgb(68,64,60)" }}
                        >
                            {key}
                        </kbd>
                    </span>
                ))}
            </span>
            <span className="text-right text-sm opacity-55">{value}</span>
        </div>
    );
}
