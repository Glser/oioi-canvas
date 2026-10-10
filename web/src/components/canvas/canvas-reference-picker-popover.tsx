import { createPortal } from "react-dom";
import React, { useEffect, useMemo, useState } from "react";
import { Check, Eye, FileText, Image as ImageIcon, LayoutGrid, Link2, Music2, Search, Video, X } from "lucide-react";
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
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    // Escape key listener for the preview lightbox
    useEffect(() => {
        if (!previewImageUrl) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setPreviewImageUrl(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [previewImageUrl]);

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
            className="flex flex-col select-none rounded-2xl border shadow-2xl backdrop-blur-xl transition-all overflow-hidden"
            style={{
                width: 460,
                background: isDark ? "rgba(24, 24, 27, 0.96)" : theme.toolbar.panel,
                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : theme.toolbar.border,
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
                        background: isDark ? "rgba(255, 255, 255, 0.06)" : theme.toolbar.itemHover,
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
                                        onPreviewImage={(url) => setPreviewImageUrl(url)}
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
            {previewImageUrl && typeof document !== "undefined"
                ? createPortal(
                      <div
                          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-md p-6 select-none animate-in fade-in duration-150"
                          onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPreviewImageUrl(null);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                      >
                          <div
                              className="relative max-w-[90vw] max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl bg-stone-950/80 border border-white/20 animate-in zoom-in-95 duration-150 flex items-center justify-center"
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                          >
                              <img
                                  src={previewImageUrl}
                                  alt=""
                                  className="max-w-[90vw] max-h-[90vh] object-contain block select-none"
                              />
                              {/* Close button located tightly on the top-right corner of the image card */}
                              <button
                                  type="button"
                                  title="关闭预览"
                                  onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setPreviewImageUrl(null);
                                  }}
                                  className="absolute top-3 right-3 flex items-center justify-center size-8 rounded-full bg-stone-900/80 hover:bg-stone-900 text-white backdrop-blur-md border border-white/30 transition-all cursor-pointer shadow-xl hover:scale-110 active:scale-95 z-20"
                              >
                                  <X className="size-4 stroke-[2.5]" />
                              </button>
                          </div>
                      </div>,
                      document.body
                  )
                : null}
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
    onPreviewImage,
    onClick,
}: {
    node: CanvasNodeData;
    isConnected: boolean;
    isDirectRef: boolean;
    isDark: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onConnectToggle: () => void;
    onPreviewImage: (url: string) => void;
    onClick: () => void;
}) {
    const resource = getNodeDefinition(node.type)?.resource?.(node);
    const content = node.metadata?.content || resource?.url;
    const thumbnail = previewUrlFor(node.metadata?.storageKey) || content;
    const originalImage = content || thumbnail;
    const kind = resource?.kind || (node.type === CanvasNodeType.Image ? "image" : node.type === CanvasNodeType.Video ? "video" : node.type === CanvasNodeType.Audio ? "audio" : node.type === CanvasNodeType.Text ? "text" : "other");

    const Icon = kind === "image" ? ImageIcon : kind === "video" ? Video : kind === "audio" ? Music2 : FileText;

    const isPending = !node.metadata?.content && !node.metadata?.storageKey;
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
            className={`group relative flex flex-col justify-between h-24 rounded-xl text-left cursor-pointer select-none transition-all duration-150 overflow-hidden ${
                isDirectRef
                    ? "ring-2 ring-blue-500 shadow-sm"
                    : isConnected
                    ? "ring-1.5 ring-blue-400/70"
                    : "ring-1 ring-black/5 dark:ring-white/10 hover:ring-black/15 dark:hover:ring-white/20"
            }`}
            style={{
                background: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
            }}
        >
            {/* Visual Media Background / Content */}
            <div className="absolute inset-0 size-full overflow-hidden flex items-center justify-center pointer-events-none">
                {kind === "image" && thumbnail ? (
                    <img src={thumbnail} alt="" className="size-full object-cover transition-transform duration-200 group-hover:scale-105" />
                ) : kind === "video" && content ? (
                    <video src={content} className="size-full object-cover" muted />
                ) : (
                    <div className="flex flex-col items-center justify-center gap-1 opacity-60 group-hover:opacity-85 transition-opacity">
                        <Icon className="size-6" style={{ color: theme.node.text }} />
                    </div>
                )}
                {/* Subtle gradient overlay at bottom for title readability */}
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
            </div>

            {/* Top Overlay: Pending status & Eye Preview button floating directly on image */}
            <div className="relative z-10 flex items-center justify-between p-1.5 w-full pointer-events-none">
                <div>
                    {isPending ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-black/60 text-white/90 font-normal backdrop-blur-sm">
                            待生成
                        </span>
                    ) : <span />}
                </div>

                {/* Eye Zoom Button floating directly on the top-right of the image */}
                {kind === "image" && originalImage ? (
                    <button
                        type="button"
                        title="放大查看"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onPreviewImage(originalImage);
                        }}
                        className="pointer-events-auto flex items-center justify-center size-6 bg-transparent text-white opacity-0 group-hover:opacity-100 transition-all duration-150 hover:scale-125 active:scale-95 cursor-pointer"
                        style={{
                            filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 1px 3px rgba(0,0,0,0.95))",
                        }}
                    >
                        <Eye className="size-3.5 stroke-[2.6] text-white" />
                    </button>
                ) : null}
            </div>

            {/* Bottom Overlay: Title & Direct Check on Left, Connect Link button floating on Right */}
            <div className="relative z-10 flex items-center justify-between px-1.5 pb-1.5 w-full">
                <div className="flex items-center gap-1 min-w-0 mr-1.5 pointer-events-none">
                    <span className="truncate text-[10px] font-semibold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                        {title}
                    </span>
                    {isDirectRef ? (
                        <span className="shrink-0 flex items-center justify-center size-3.5 rounded-full bg-blue-500 text-white shadow-sm ring-1 ring-white/50">
                            <Check className="size-2 stroke-[3]" />
                        </span>
                    ) : null}
                </div>

                {/* Connect Link Button floating directly on the card at bottom-right */}
                <button
                    type="button"
                    title={isConnected ? "断开连线" : "连线到当前卡片"}
                    onClick={(e) => {
                        e.stopPropagation();
                        onConnectToggle();
                    }}
                    className={`flex items-center justify-center size-6 shrink-0 bg-transparent text-white cursor-pointer transition-all duration-150 hover:scale-125 active:scale-95 ${
                        isConnected
                            ? "scale-110"
                            : "opacity-90 hover:opacity-100"
                    }`}
                    style={{
                        filter: "drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 1px 3px rgba(0,0,0,0.95))",
                    }}
                >
                    <Link2 className={`size-3.5 stroke-[2.6] text-white ${isConnected ? "stroke-[3]" : ""}`} />
                </button>
            </div>
        </div>
    );
}
