import React, { useMemo, useState } from "react";
import { Check, FileText, Image as ImageIcon, LayoutGrid, Music2, Search, Video } from "lucide-react";
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
    onToggleReference: (sourceNodeId: string) => void;
};

export function CanvasReferencePickerPopover({
    targetNodeId,
    nodes,
    connectedNodeIds,
    onToggleReference,
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
                width: 490,
                background: isDark ? "rgba(24, 24, 27, 0.98)" : theme.toolbar.panel,
                borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : theme.toolbar.border,
                color: theme.node.text,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Search Input Bar */}
            <div className="p-3 pb-2.5">
                <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
                    style={{
                        background: isDark ? "rgba(255, 255, 255, 0.08)" : theme.toolbar.itemHover,
                    }}
                >
                    <Search className="size-4 shrink-0 opacity-45" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索画布节点"
                        className="w-full bg-transparent text-xs sm:text-[13px] outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
                        style={{ color: theme.node.text }}
                        autoFocus
                    />
                </div>
            </div>

            {/* Content: Sidebar + Cards Grid */}
            <div className="flex h-64 min-h-[256px]">
                {/* Left Category Tabs */}
                <div className="w-24 shrink-0 flex flex-col gap-1 px-3 py-1 overflow-y-auto thin-scrollbar">
                    {categories.map((cat) => {
                        const Icon = cat.icon;
                        const active = category === cat.key;
                        return (
                            <button
                                key={cat.key}
                                type="button"
                                onClick={() => setCategory(cat.key)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                                    active
                                        ? "bg-black/10 dark:bg-white/15 text-stone-900 dark:text-stone-100 shadow-sm"
                                        : "text-stone-500 dark:text-stone-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-stone-800 dark:hover:text-stone-200"
                                }`}
                            >
                                <Icon className="size-3.5 shrink-0 opacity-80" />
                                <span>{cat.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Right Cards Grid */}
                <div className="flex-1 px-3 pb-3 overflow-y-auto thin-scrollbar">
                    {filteredNodes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-xs text-stone-400 dark:text-stone-500 gap-1.5 py-8">
                            <span>暂无可引用的画布节点</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2.5">
                            {filteredNodes.map((node) => {
                                const isConnected = connectedNodeIds.has(node.id);
                                return (
                                    <NodePickerCard
                                        key={node.id}
                                        node={node}
                                        isConnected={isConnected}
                                        isDark={isDark}
                                        theme={theme}
                                        onClick={() => onToggleReference(node.id)}
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
    isDark,
    theme,
    onClick,
}: {
    node: CanvasNodeData;
    isConnected: boolean;
    isDark: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
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
        <button
            type="button"
            onClick={onClick}
            className={`group relative flex flex-col justify-between h-28 rounded-2xl p-2.5 text-left border transition-all duration-150 overflow-hidden ${
                isConnected
                    ? "ring-2 ring-blue-500 border-blue-500/60 bg-blue-500/10"
                    : isDark
                    ? "bg-white/[0.06] hover:bg-white/[0.1] border-white/5"
                    : "bg-black/[0.04] hover:bg-black/[0.07] border-stone-200/60"
            }`}
        >
            {/* Top Right Status Badge or Check Indicator */}
            <div className="flex items-center justify-between w-full h-4">
                <div />
                {isConnected ? (
                    <span className="flex items-center justify-center size-4 rounded-full bg-blue-500 text-white shadow">
                        <Check className="size-2.5 stroke-[3]" />
                    </span>
                ) : isPending ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/40 text-stone-300 font-medium">
                        待生成
                    </span>
                ) : null}
            </div>

            {/* Center Visual / Icon / Thumbnail */}
            <div className="flex-1 flex items-center justify-center my-1 overflow-hidden rounded-lg">
                {kind === "image" && thumbnail ? (
                    <img src={thumbnail} alt="" className="size-full object-cover rounded-md" />
                ) : kind === "video" && content ? (
                    <video src={content} className="size-full object-cover rounded-md" muted />
                ) : (
                    <Icon className="size-7 opacity-60 group-hover:opacity-85 transition-opacity" style={{ color: theme.node.text }} />
                )}
            </div>

            {/* Bottom Title */}
            <div className="w-full truncate text-[11px] font-medium leading-tight opacity-90 mt-1" style={{ color: theme.node.text }}>
                {title}
            </div>
        </button>
    );
}
