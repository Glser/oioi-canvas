import { useState, useMemo, useEffect, useRef } from "react";
import { App, Tooltip } from "antd";
import {
    Download,
    FolderPlus,
    Info,
    Minus,
    Plus,
    RotateCcw,
    X,
    Copy,
    Check,
    Maximize2,
    Cpu,
    Layers,
    FileText,
    Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveAs } from "file-saver";

import { useThemeStore } from "@/stores/use-theme-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { imageExtension } from "@/lib/canvas/canvas-generation-helpers";
import { useCopyText } from "@/hooks/use-copy-text";
import type { CanvasNodeData } from "@/types/canvas";

interface CanvasImageDetailModalProps {
    node: CanvasNodeData | null;
    imageId?: string | null;
    imageUrl?: string | null;
    imageTitle?: string | null;
    open: boolean;
    onClose: () => void;
}

export function CanvasImageDetailModal({
    node,
    imageId,
    imageUrl,
    imageTitle,
    open,
    onClose,
}: CanvasImageDetailModalProps) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const themeMode = useThemeStore((state) => state.theme);
    const isDark = themeMode === "dark";

    const [scale, setScale] = useState(1);
    const [showInfo, setShowInfo] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const dragStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);

    const imageItem = useMemo(() => {
        if (!node?.metadata) return null;
        if (imageId && node.metadata.images) {
            return node.metadata.images.find((img) => img.id === imageId) || null;
        }
        return null;
    }, [node, imageId]);

    const activeImageUrl = imageUrl || (imageItem ? imageItem.content : node?.metadata?.content) || null;

    useEffect(() => {
        if (open) {
            setScale(1);
            setPanOffset({ x: 0, y: 0 });
            setCopied(false);
        }
    }, [open, node?.id, imageId]);

    const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 4));
    const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.25));
    const handleResetZoom = () => {
        setScale(1);
        setPanOffset({ x: 0, y: 0 });
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        if (e.deltaY < 0) {
            setScale((prev) => Math.min(prev + 0.15, 4));
        } else {
            setScale((prev) => Math.max(prev - 0.15, 0.25));
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        setIsPanning(true);
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            startPanX: panOffset.x,
            startPanY: panOffset.y,
        };
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning || !dragStartRef.current) return;
        setPanOffset({
            x: dragStartRef.current.startPanX + (e.clientX - dragStartRef.current.x),
            y: dragStartRef.current.startPanY + (e.clientY - dragStartRef.current.y),
        });
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        dragStartRef.current = null;
    };

    const handleDownload = () => {
        if (!activeImageUrl) return;
        const ext = imageExtension(activeImageUrl);
        const rawTitle = node?.title || imageTitle || "image";
        const fileName = rawTitle.trim().replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]+/g, "_");
        saveAs(activeImageUrl, `${fileName}.${ext}`);
        message.success(t("canvas.nodeToolbar.downloadImage"));
    };

    const handleSaveAsset = () => {
        if (!activeImageUrl) return;
        const dataUrl = node?.metadata?.storageKey ? "" : activeImageUrl;
        addAsset({
            kind: "image",
            title: node?.metadata?.prompt?.slice(0, 24) || imageTitle || node?.title || t("canvas.projectPage.canvasImage"),
            coverUrl: activeImageUrl,
            tags: [],
            source: "Canvas",
            data: {
                dataUrl,
                storageKey: node?.metadata?.storageKey,
                width: node?.metadata?.naturalWidth || node?.width || 0,
                height: node?.metadata?.naturalHeight || node?.height || 0,
                bytes: node?.metadata?.bytes || (dataUrl ? getDataUrlByteSize(dataUrl) : 0),
                mimeType: node?.metadata?.mimeType || "image/png",
            },
            metadata: { source: "canvas", nodeId: node?.id, prompt: node?.metadata?.prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const handleCopyPrompt = () => {
        if (!node?.metadata?.prompt) return;
        copyText(node.metadata.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!open || !activeImageUrl) return null;

    const width = node?.metadata?.naturalWidth || Math.round(node?.width || 0);
    const height = node?.metadata?.naturalHeight || Math.round(node?.height || 0);
    const byteSize = node?.metadata?.bytes || (activeImageUrl ? getDataUrlByteSize(activeImageUrl) : 0);

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center animate-in fade-in duration-200 select-none"
            style={{
                backgroundColor: isDark ? "rgba(10, 10, 12, 0.88)" : "rgba(15, 23, 42, 0.72)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
            }}
            onClick={onClose}
        >
            <div
                className="relative flex flex-col w-[94vw] h-[92vh] max-w-[1600px] rounded-2xl overflow-hidden shadow-2xl transition-all border"
                style={{
                    backgroundColor: isDark ? "#18181b" : "#ffffff",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                    color: isDark ? "#f4f4f5" : "#09090b",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-3.5 border-b z-20 shrink-0 select-none"
                    style={{
                        backgroundColor: isDark ? "rgba(24, 24, 27, 0.8)" : "rgba(255, 255, 255, 0.8)",
                        borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="size-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                        <h2 className="text-sm font-semibold truncate max-w-[280px] sm:max-w-md">
                            {imageTitle || node?.title || t("assets.kinds.image")}
                        </h2>
                        {width && height ? (
                            <span
                                className="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-mono rounded-md font-medium"
                                style={{
                                    backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
                                    color: isDark ? "#a1a1aa" : "#71717a",
                                }}
                            >
                                {width} × {height}
                            </span>
                        ) : null}
                    </div>

                    {/* Toolbar Controls */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {/* Zoom Bar */}
                        <div
                            className="flex items-center rounded-lg p-1 mr-2"
                            style={{
                                backgroundColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)",
                            }}
                        >
                            <Tooltip title={t("canvas.nodeToolbar.zoomOut")}>
                                <button
                                    type="button"
                                    onClick={handleZoomOut}
                                    className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                >
                                    <Minus className="size-4" />
                                </button>
                            </Tooltip>
                            <button
                                type="button"
                                onClick={handleResetZoom}
                                className="px-2 text-xs font-mono font-medium hover:bg-black/10 dark:hover:bg-white/10 rounded py-1 transition text-zinc-600 dark:text-zinc-300"
                            >
                                {Math.round(scale * 100)}%
                            </button>
                            <Tooltip title={t("canvas.nodeToolbar.zoomIn")}>
                                <button
                                    type="button"
                                    onClick={handleZoomIn}
                                    className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                >
                                    <Plus className="size-4" />
                                </button>
                            </Tooltip>
                            <Tooltip title={t("canvas.zoomControls.reset") || "重置"}>
                                <button
                                    type="button"
                                    onClick={handleResetZoom}
                                    className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 ml-0.5"
                                >
                                    <RotateCcw className="size-3.5" />
                                </button>
                            </Tooltip>
                        </div>

                        {/* Action buttons */}
                        <Tooltip title={t("canvas.nodeToolbar.saveAsset")}>
                            <button
                                type="button"
                                onClick={handleSaveAsset}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                            >
                                <FolderPlus className="size-4" />
                            </button>
                        </Tooltip>

                        <Tooltip title={t("common.download")}>
                            <button
                                type="button"
                                onClick={handleDownload}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                            >
                                <Download className="size-4" />
                            </button>
                        </Tooltip>

                        <Tooltip title={t("canvas.nodeToolbar.info")}>
                            <button
                                type="button"
                                onClick={() => setShowInfo((v) => !v)}
                                className={`p-2 rounded-lg transition ${
                                    showInfo
                                        ? "bg-blue-500/15 text-blue-500"
                                        : "text-zinc-600 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/10"
                                }`}
                            >
                                <Info className="size-4" />
                            </button>
                        </Tooltip>

                        <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-700 mx-1" />

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition text-zinc-500 dark:text-zinc-400"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                </div>

                {/* Content Body */}
                <div className="relative flex-1 flex overflow-hidden min-h-0">
                    {/* Image Viewport */}
                    <div
                        className="relative flex-1 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
                        style={{
                            backgroundColor: isDark ? "#0f0f11" : "#f4f4f5",
                            backgroundImage: isDark
                                ? "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)"
                                : "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
                            backgroundSize: "24px 24px",
                        }}
                        onWheel={handleWheel}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onDoubleClick={handleResetZoom}
                    >
                        <div
                            className="transition-transform duration-75 select-none pointer-events-none"
                            style={{
                                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale(${scale})`,
                                transformOrigin: "center center",
                            }}
                        >
                            <img
                                src={activeImageUrl}
                                alt={node?.title || "preview"}
                                className="max-w-[85vw] max-h-[75vh] object-contain rounded-lg shadow-xl"
                                draggable={false}
                            />
                        </div>

                        {/* Floating scale indicator */}
                        <div
                            className="absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs font-mono font-medium backdrop-blur-md pointer-events-none shadow-sm"
                            style={{
                                backgroundColor: isDark ? "rgba(24, 24, 27, 0.75)" : "rgba(255, 255, 255, 0.75)",
                                color: isDark ? "#a1a1aa" : "#71717a",
                                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                            }}
                        >
                            {Math.round(scale * 100)}% · 滚轮缩放 · 拖拽平移 · 双击重置
                        </div>
                    </div>

                    {/* Right Panel / Metadata Sidebar */}
                    {showInfo && (
                        <div
                            className="w-[260px] border-l flex flex-col shrink-0 overflow-y-auto thin-scrollbar z-10 transition-all select-text"
                            style={{
                                backgroundColor: isDark ? "#141416" : "#fafafa",
                                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                            }}
                        >
                            {/* Prompt section */}
                            {node?.metadata?.prompt ? (
                                <div className="p-5 border-b" style={{ borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)" }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            <Sparkles className="size-3.5 text-amber-500" />
                                            <span>{t("canvas.configNode.prompt")}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCopyPrompt}
                                            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="size-3 text-emerald-500" />
                                                    <span className="text-emerald-500">已复制</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="size-3" />
                                                    <span>复制</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p
                                        className="text-xs leading-relaxed break-words rounded-xl p-3.5 border font-normal select-all"
                                        style={{
                                            backgroundColor: isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.02)",
                                            borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
                                            color: isDark ? "#e4e4e7" : "#27272a",
                                        }}
                                    >
                                        {node.metadata.prompt}
                                    </p>
                                </div>
                            ) : null}

                            {/* Details parameters list */}
                            <div className="p-5 space-y-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                    {t("canvas.nodeToolbar.nodeInfo")}
                                </div>

                                <div className="space-y-3 text-xs">
                                    {node?.metadata?.model ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <Cpu className="size-3.5" /> 模型
                                            </span>
                                            <span className="font-mono font-medium max-w-[130px] truncate text-right" title={node.metadata.model}>
                                                {node.metadata.model}
                                            </span>
                                        </div>
                                    ) : null}

                                    {width && height ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <Maximize2 className="size-3.5" /> 分辨率
                                            </span>
                                            <span className="font-mono font-medium">
                                                {width} × {height}
                                            </span>
                                        </div>
                                    ) : null}

                                    {node?.metadata?.quality ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <Layers className="size-3.5" /> 画质
                                            </span>
                                            <span className="font-mono font-medium capitalize">
                                                {node.metadata.quality}
                                            </span>
                                        </div>
                                    ) : null}

                                    {byteSize ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <FileText className="size-3.5" /> 大小
                                            </span>
                                            <span className="font-mono font-medium">
                                                {formatBytes(byteSize)}
                                            </span>
                                        </div>
                                    ) : null}

                                    {node?.metadata?.mimeType ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <FileText className="size-3.5" /> 格式
                                            </span>
                                            <span className="font-mono uppercase">
                                                {node.metadata.mimeType.split("/")[1] || "png"}
                                            </span>
                                        </div>
                                    ) : null}

                                    {node?.metadata?.generationType ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500">生成模式</span>
                                            <span className="font-medium capitalize">
                                                {node.metadata.generationType}
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
