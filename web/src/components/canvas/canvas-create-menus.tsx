import { useEffect, useRef } from "react";
import { ImageIcon, List, Music2, Settings2, Video, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { listNodeDefinitions, useNodeRegistryVersion } from "@/lib/canvas/node-registry";
import { CanvasNodeType, type ConnectionHandle, type Position } from "@/types/canvas";

export type PendingConnectionCreate = {
    connection: ConnectionHandle;
    position: Position;
};

export function ConnectionCreateMenu({
    pending,
    onCreate,
    onClose,
}: {
    pending: PendingConnectionCreate;
    onCreate: (type: CanvasNodeType.Image | CanvasNodeType.Text | CanvasNodeType.Config | CanvasNodeType.Video | CanvasNodeType.Audio) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    return (
        <div
            className="absolute z-[120] w-[218px] rounded-2xl border p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.28)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            data-connection-create-menu
            style={{ left: pending.position.x, top: pending.position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-1 flex items-center justify-between px-2 py-0.5">
                <span className="text-[11px] font-medium tracking-wide opacity-50">
                    {t("canvas.createMenu.fromNode")}
                </span>
                <button type="button" className="grid size-5 place-items-center rounded-md text-xs opacity-40 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    <X className="size-3" />
                </button>
            </div>
            <div className="flex flex-col gap-0.5">
                <ConnectionCreateOption theme={theme} icon={<List className="size-3.5" />} title={t("canvas.createMenu.text")} onClick={() => onCreate(CanvasNodeType.Text)} />
                <ConnectionCreateOption theme={theme} icon={<ImageIcon className="size-3.5" />} title={t("canvas.createMenu.image")} onClick={() => onCreate(CanvasNodeType.Image)} />
                <ConnectionCreateOption theme={theme} icon={<Video className="size-3.5" />} title={t("canvas.createMenu.video")} onClick={() => onCreate(CanvasNodeType.Video)} />
                <ConnectionCreateOption theme={theme} icon={<Music2 className="size-3.5" />} title={t("canvas.createMenu.audio")} onClick={() => onCreate(CanvasNodeType.Audio)} />
                <ConnectionCreateOption theme={theme} icon={<Settings2 className="size-3.5" />} title={t("canvas.createMenu.config")} onClick={() => onCreate(CanvasNodeType.Config)} />
            </div>
        </div>
    );
}

export function ConnectionCreateOption({ theme, icon, title, description, onClick }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; icon: React.ReactNode; title: string; description?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            className="group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 text-left transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/10"
            style={{ color: theme.node.text }}
            onClick={onClick}
        >
            <span
                className="grid size-6 shrink-0 place-items-center rounded-lg opacity-70 transition-transform duration-150 group-hover:scale-110 group-hover:opacity-100"
                style={{ background: theme.node.fill, color: theme.node.text }}
            >
                {icon}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">
                {title}
            </span>
        </button>
    );
}

export function NodeCreateMenu({ position, onCreate, onClose }: { position: Position; onCreate: (type: string) => void; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();
    useNodeRegistryVersion();
    const menuRef = useRef<HTMLDivElement>(null);
    const definitions = listNodeDefinitions().filter((def) => def.showInCreateMenu !== false);
    // Close automatically when clicking outside the menu.
    useEffect(() => {
        const handlePointerDown = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener("pointerdown", handlePointerDown, true);
        return () => document.removeEventListener("pointerdown", handlePointerDown, true);
    }, [onClose]);
    return (
        <div
            ref={menuRef}
            className="absolute z-[120] max-h-[70vh] w-[218px] overflow-y-auto rounded-2xl border p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl thin-scrollbar animate-in fade-in zoom-in-95 duration-150"
            data-canvas-no-zoom
            style={{ left: position.x, top: position.y, background: theme.node.panel, borderColor: theme.node.stroke, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="mb-1 flex items-center justify-between px-2 py-0.5">
                <span className="text-[11px] font-medium tracking-wide opacity-50">
                    {t("canvas.createMenu.select")}
                </span>
                <button type="button" className="grid size-5 place-items-center rounded-md text-xs opacity-40 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={onClose} aria-label={t("canvas.createMenu.close")}>
                    <X className="size-3" />
                </button>
            </div>
            <div className="flex flex-col gap-0.5">
                {definitions.map((def) => (
                    <ConnectionCreateOption
                        key={def.type}
                        theme={theme}
                        icon={def.icon ? <span className="[&_svg]:size-3.5">{def.icon}</span> : null}
                        title={def.title}
                        onClick={() => onCreate(def.type)}
                    />
                ))}
            </div>
        </div>
    );
}
