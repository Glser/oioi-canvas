import React, { useMemo, useState } from "react";
import { Check, FileText, Image as ImageIcon, LayoutGrid, Link2, Music2, Search, Video } from "lucide-react";
import { useSyncExternalStore } from "react";

import { canvasThemes } from "@/lib/canvas-theme";
import { getNodeDefinition } from "@/lib/canvas/node-registry";
import { isCanvasReferenceNode } from "@/lib/canvas/canvas-resource-references";
import { getImagePreviewRevision, previewUrlFor, subscribeImagePreviews } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type CategoryKey = "all" | "image" | "video" | "audio" | "text";

type CanvasReferencePickerPopoverProps = {
    targetNodeId: string;
    nodes: CanvasNodeData[];
    connectedNodeIds: Set<string>;
    referenceNodeIds?: Set<string>;
    onToggleReference: (sourceNodeId: string) => void;
    onToggleDirectReference?: (sourceNodeId: string) => void;
};

export function CanvasReferencePickerPopover({
    targetNodeId,
    nodes,
    connectedNodeIds,
    referenceNodeIds = new Set(),
    onToggleReference,
    onToggleDirectReference,
}: CanvasReferencePickerPopoverProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const isDark = colorTheme === "dark";

    const [category, setCategory] = useState<CategoryKey>("all");
    const [searchQuery, setSearchQuery] = useState("");

    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);

    // Filter available reference nodes on the canvas
    const referenceCandidates = useMemo(() => {
        return nodes.filter((node) => {
            if (node.id === targetNodeId) return false;
            return isCanvasReferenceNode(node, nodes);
        });
    }, [nodes, targetNodeId]);

    // Categories
    const categories: { key: CategoryKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = useMemo(() => [
        { key: "all", label: "全部", icon: LayoutGrid },
        { key: "image", label: "图片", icon: ImageIcon },
        { key: "video", label: "视频", icon: Video },
        { key: "audio", label: "音频", icon: Music2 },
        { key: "text", label: "文本", icon: FileText },
    ], []);

    // Filter by category and search
    const filteredNodes = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return referenceCandidates.filter((node) => {
            const resource = getNodeDefinition(node.type)?.resource?.(node);
            const kind = resource?.kind || (node.type === CanvasNodeType.Image ? "image" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Text ? "text" : "other");

            if (category !== "all" && kind !== category) return false;

            if (query) {
                const title = (node.title || "").toLowerCase();
                const content = (node.metadata?.content || node.metadata?.prompt || "").toLowerCase();
                if (!title.includes(query) && !content.includes(query)) return false;
            }

            return true;
        });
    }, [category, referenceCandidates, searchQuery]);

    return (
        <div
            className="flex flex-col select-none rounded-2xl border shadow-2xl backdrop-blur-md transition-all overflow-hidden"
            style={{
                width: 460,
                background: isDark ? "rgba(24, 24, 27, 0.98)" : theme.toolbar.panel,
                borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : theme.toolbar.border,
                color: theme.node.text,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Search Input Bar */}
            <div className="p-2.5 pb-2">
                <div
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-colors"
                    style={{
                        background: isDark ? "rgba(255, 255, 255, 0.08)" : theme.toolbar.itemHover,
                    }}
                >
                    <Search className="size-3.5 shrink-0 opacity-45" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索画布节点"
                        className="w-full bg-transparent text-[11px] outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
                        style={{ color: theme.node.text }}
                        autoFocus
                    />
                </div>
            </div>

            {/* Content: Sidebar + Cards Grid */}
            <div className="flex h-60 min-h-[240px]">
                {/* Left Category Tabs */}
                <div className="w-24 shrink-0 flex flex-col gap-1 px-2.5 py-1 overflow-y-auto thin-scrollbar">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const active = category === cat.key;
                        return (
                            <button
                                key={cat.key}
                                type="button"
                                onClick={() => setCategory(cat.key)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                                    active
                                        ? "bg-black/10 dark:bg-white/15 text-stone-900 dark:text-stone-100 shadow-sm"
                                        : "text-stone-500 dark:text-stone-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-stone-800 dark:hover:text-stone-200"
                                }`}
                            >
                                <Icon className="size-3 shrink-0 opacity-80" />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Right Cards Grid */}
                <div className="flex-1 px-2.5 pb-2.5 overflow-y-auto thin-scrollbar">
                    {filteredNodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[11px] text-stone-400 dark:text-stone-500 gap-1.5 py-8">
                            <span>暂无可引用的画布节点</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2">
                            {filteredNodes.map((node) => {
                                const isConnected = connectedNodeIds.has(node.id);
                                const isDirectRef = referenceNodeIds.has(node.id);
                                return (
                                    <NodePickerCard
                                        key={node.id}
                                        node={node}
                                        isConnected={isConnected}
                                        isDirectRef={isDirectRef}
                                        isDark={isDark}
                                        theme={theme}
                                        onConnectToggle={() => onToggleReference(node.id)}
                                        onClick={() => {
                                            if (onToggleDirectReference) {
                                                onToggleDirectReference(node.id);
                                            } else {
                                                onToggleReference(node.id);
                                            }
                                        }}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function NodePickerCard({
    node,
    isConnected,
    isDirectRef,
    isDark,
    theme,
    onConnectToggle,
    onClick,
}: {
    node: CanvasNodeData;
    isConnected: boolean;
    isDirectRef: boolean;
    isDark: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onConnectToggle: () => void;
    onClick: () => void;
}) {
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    const content = node.metadata?.content || resource?.url;
    const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
    const kind = resource?.kind || (node.type === CanvasNodeType.Image ? "image" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Text ? "text" : "other");

    const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : kind === "audio" ? Music2 : FileText;

    const isPending = !node.metadata?.content && (node.metadata?.isGenerating || !node.metadata?.storageKey);
    const title = node.title || (kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文本");

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                }
            }}
            className={`group relative flex flex-col justify-between h-24 rounded-xl p-2 text-left border cursor-pointer select-none transition-all duration-150 overflow-hidden ${
                isDirectRef
                    ? "ring-2 ring-blue-500 border-blue-500/80 bg-blue-500/10"
                    : isConnected
                    ? "border-blue-400/50 bg-blue-500/5"
                    : isDark
                    ? "bg-white/[0.05] hover:bg-white/[0.08] border-white/5"
                    : "bg-black/[0.03] hover:bg-black/[0.06] border-stone-200/60"
            }`}
        >
            {/* Top Action Row: Pending badge on left, Connect Link button on right */}
            <div className="flex items-center justify-between w-full h-4 z-10">
                <div>
                    {isPending ? (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-stone-300 font-normal leading-none">
                            待生成
                        </span>
                    ) : null}
                </div>
                {/* Connect Link Button */}
                <button
                    type="button"
                    title={isConnected ? "断开连线" : "连线到当前卡片"}
                    onClick={(e) => {
                        e.stopPropagation();
                        onConnectToggle();
                    }}
                    className={`flex items-center justify-center size-5 rounded-full transition-all ${
                        isConnected
                            ? "bg-blue-500 text-white shadow-sm hover:bg-blue-600 scale-105"
                            : isDark
                            ? "bg-white/10 hover:bg-white/25 text-stone-300 hover:text-white"
                            : "bg-black/5 hover:bg-black/15 text-stone-500 hover:text-stone-800"
                    }`}
                >
                    <Link2 className="size-2.5 stroke-[2.2]" />
                </button>
            </div>

            {/* Center Visual / Icon / Thumbnail */}
            <div className="flex-1 flex items-center justify-center my-0.5 overflow-hidden rounded-md pointer-events-none">
                {kind === "image" && thumbnail ? (
                    <img src={thumbnail} alt="" className="size-full object-cover rounded-md" />
                ) : kind === "video" && content ? (
                    <video src={content} className="size-full object-cover rounded-md" muted />
                ) : (
                    <Icon className="size-5 opacity-60 group-hover:opacity-85 transition-opacity" style={{ color: theme.node.text }} />
                )}
            </div>

            {/* Bottom Title */}
            <div className="flex items-center justify-between w-full mt-0.5 pointer-events-none">
                <span className="truncate text-[10px] font-normal leading-tight opacity-80" style={{ color: theme.node.text }}>
                    {title}
                </span>
                {isDirectRef ? (
                    <span className="shrink-0 flex items-center justify-center size-3.5 rounded-full bg-blue-500 text-white ml-1">
                        <Check className="size-2 stroke-[3]" />
                    </span>
                ) : null}
            </div>
        </div>
    );
}
