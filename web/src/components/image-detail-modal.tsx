import { useState, useEffect, useRef } from "react";
import { App, Modal, Tooltip } from "antd";
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
import { modelOptionName } from "@/stores/use-config-store";
import { formatBytes, getDataUrlByteSize } from "@/lib/image-utils";
import { imageExtension } from "@/lib/canvas/canvas-generation-helpers";
import { generatedDownloadName } from "@/lib/download-name";
import { useCopyText } from "@/hooks/use-copy-text";
export type ImageDetailImage = {
    url: string;
    title?: string;
    nodeId?: string;
    storageKey?: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
    prompt?: string;
    model?: string;
    quality?: string;
    generationType?: string;
};

interface ImageDetailModalProps {
    image?: ImageDetailImage | null;
    open: boolean;
    onClose: () => void;
    onSaveAsset?: () => void;
}

export function ImageDetailModal({
    image,
    open,
    onClose,
    onSaveAsset,
}: ImageDetailModalProps) {
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

    const activeImageUrl = image?.url;

    useEffect(() => {
        if (open) {
            setScale(1);
            setPanOffset({ x: 0, y: 0 });
            setCopied(false);
        }
    }, [open, activeImageUrl]);

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
        const ext = image?.mimeType?.split("/")[1] || imageExtension(activeImageUrl);
        saveAs(activeImageUrl, generatedDownloadName("image", ext));
        message.success(t("canvas.nodeToolbar.downloadImage"));
    };

    const handleSaveAsset = () => {
        if (!activeImageUrl) return;
        if (onSaveAsset) { onSaveAsset(); return; }
        const dataUrl = image?.storageKey ? "" : activeImageUrl;
        addAsset({
            kind: "image",
            title: image?.prompt?.slice(0, 24) || image?.title || t("canvas.projectPage.canvasImage"),
            coverUrl: activeImageUrl,
            tags: [],
            source: "Canvas",
            data: {
                dataUrl,
                storageKey: image?.storageKey,
                width: image?.width || 0,
                height: image?.height || 0,
                bytes: image?.bytes || (dataUrl ? getDataUrlByteSize(dataUrl) : 0),
                mimeType: image?.mimeType || "image/png",
            },
            metadata: { source: "canvas", nodeId: image?.nodeId, prompt: image?.prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const handleCopyPrompt = () => {
        if (!image?.prompt) return;
        copyText(image.prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!open || !activeImageUrl) return null;

    const width = image?.width || 0;
    const height = image?.height || 0;
    const byteSize = image?.bytes || getDataUrlByteSize(activeImageUrl);
    const modelName = modelOptionName(image?.model || "");

    return (
        <Modal
            open={open}
            onCancel={onClose}
            footer={null}
            closable={false}
            centered
            width="94vw"
            aria-label={image?.title || t("assets.kinds.image")}
            style={{ maxWidth: 1600, paddingBottom: 0 }}
            styles={{
                container: { padding: 0, background: "transparent", border: 0, boxShadow: "none" },
                mask: { background: isDark ? "rgba(10, 10, 12, 0.88)" : "rgba(15, 23, 42, 0.72)", backdropFilter: "blur(16px)" },
            }}
        >
            <div
                className="relative flex flex-col h-[92dvh] rounded-2xl overflow-hidden shadow-2xl border"
                style={{
                    backgroundColor: isDark ? "#18181b" : "#ffffff",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
                    color: isDark ? "#f4f4f5" : "#09090b",
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDownCapture={(event) => {
                    if (event.key === "Escape") {
                        event.stopPropagation();
                        onClose();
                    }
                }}
            >
                {/* Header */}
                <div
                    className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-3.5 border-b z-20 shrink-0 select-none"
                    style={{
                        backgroundColor: isDark ? "rgba(24, 24, 27, 0.8)" : "rgba(255, 255, 255, 0.8)",
                        borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                        <div className="size-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                        <h2 className="text-sm font-semibold truncate max-w-[280px] sm:max-w-md">
                            {image?.title || t("assets.kinds.image")}
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
                                    aria-label={t("canvas.nodeToolbar.zoomOut")}
                                    onClick={handleZoomOut}
                                    className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                >
                                    <Minus className="size-4" />
                                </button>
                            </Tooltip>
                            <Tooltip title={t("canvas.editors.reset")}>
                                <button
                                    type="button"
                                    aria-label={t("canvas.editors.reset")}
                                    onClick={handleResetZoom}
                                    className="px-2 text-xs font-mono font-medium hover:bg-black/10 dark:hover:bg-white/10 rounded py-1 transition text-zinc-600 dark:text-zinc-300"
                                >
                                    {Math.round(scale * 100)}%
                                </button>
                            </Tooltip>
                            <Tooltip title={t("canvas.nodeToolbar.zoomIn")}>
                                <button
                                    type="button"
                                    aria-label={t("canvas.nodeToolbar.zoomIn")}
                                    onClick={handleZoomIn}
                                    className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                                >
                                    <Plus className="size-4" />
                                </button>
                            </Tooltip>
                            <Tooltip title={t("canvas.editors.reset")}>
                                <button
                                    type="button"
                                    aria-label={t("canvas.editors.reset")}
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
                                aria-label={t("canvas.nodeToolbar.saveAsset")}
                                onClick={handleSaveAsset}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                            >
                                <FolderPlus className="size-4" />
                            </button>
                        </Tooltip>

                        <Tooltip title={t("common.download")}>
                            <button
                                type="button"
                                aria-label={t("common.download")}
                                onClick={handleDownload}
                                className="p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white"
                            >
                                <Download className="size-4" />
                            </button>
                        </Tooltip>

                        <Tooltip title={t("canvas.nodeToolbar.info")}>
                            <button
                                type="button"
                                aria-label={t("canvas.nodeToolbar.info")}
                                aria-pressed={showInfo}
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

                        <Tooltip title={t("common.close")}>
                            <button
                                type="button"
                                aria-label={t("common.close")}
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition text-zinc-500 dark:text-zinc-400"
                            >
                                <X className="size-4" />
                            </button>
                        </Tooltip>
                    </div>
                </div>

                {/* Content Body */}
                <div className="relative flex-1 flex flex-col sm:flex-row overflow-hidden min-h-0">
                    {/* Image Viewport */}
                    <div
                        className="relative flex-1 min-w-0 min-h-0 flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
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
                        onMouseLeave={handleMouseUp}
                        onDoubleClick={handleResetZoom}
                    >
                        <div
                            className="flex h-full w-full min-h-0 items-center justify-center p-4 transition-transform duration-75 select-none pointer-events-none"
                            style={{
                                transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale(${scale})`,
                                transformOrigin: "center center",
                            }}
                        >
                            <img
                                src={activeImageUrl}
                                alt={image?.title || t("assets.kinds.image")}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
                                draggable={false}
                            />
                        </div>

                        {/* Floating scale indicator */}
                        <div
                            className="absolute bottom-4 left-4 max-w-[calc(100%-32px)] px-3 py-1 rounded-full text-xs font-mono font-medium backdrop-blur-md pointer-events-none shadow-sm"
                            style={{
                                backgroundColor: isDark ? "rgba(24, 24, 27, 0.75)" : "rgba(255, 255, 255, 0.75)",
                                color: isDark ? "#a1a1aa" : "#71717a",
                                border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
                            }}
                        >
                            {t("canvas.imageDetail.zoomHint", { percent: Math.round(scale * 100) })}
                        </div>
                    </div>

                    {/* Right Panel / Metadata Sidebar */}
                    {showInfo && (
                        <div
                            className="w-full max-h-[30%] sm:max-h-none sm:w-[260px] border-t sm:border-t-0 sm:border-l flex flex-col shrink-0 overflow-y-auto thin-scrollbar z-10 select-text"
                            style={{
                                backgroundColor: isDark ? "#141416" : "#fafafa",
                                borderColor: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
                            }}
                        >
                            {/* Prompt section */}
                            {image?.prompt ? (
                                <div className="p-5 border-b" style={{ borderColor: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)" }}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                            <Sparkles className="size-3.5 text-amber-500" />
                                            <span>{t("canvas.configNode.prompt")}</span>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label={t("common.copy")}
                                            onClick={handleCopyPrompt}
                                            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="size-3 text-emerald-500" />
                                                    <span className="text-emerald-500">{t("canvas.imageDetail.copied")}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="size-3" />
                                                    <span>{t("canvas.imageDetail.copy")}</span>
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
                                        {image.prompt}
                                    </p>
                                </div>
                            ) : null}

                            {/* Details parameters list */}
                            <div className="p-5 space-y-4">
                                <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                    {t("canvas.nodeToolbar.nodeInfo")}
                                </div>

                                <div className="space-y-3 text-xs">
                                    {image?.model ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <Cpu className="size-3.5" /> {t("canvas.imageDetail.model")}
                                            </span>
                                            <Tooltip title={modelName}><span className="font-mono font-medium max-w-[130px] truncate text-right">{modelName}</span></Tooltip>
                                        </div>
                                    ) : null}

                                    {width && height ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <Maximize2 className="size-3.5" /> {t("canvas.imageDetail.resolution")}
                                            </span>
                                            <span className="font-mono font-medium">
                                                {width} × {height}
                                            </span>
                                        </div>
                                    ) : null}

                                    {image?.quality ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <Layers className="size-3.5" /> {t("canvas.imageDetail.quality")}
                                            </span>
                                            <span className="font-mono font-medium capitalize">
                                                {image.quality}
                                            </span>
                                        </div>
                                    ) : null}

                                    {byteSize ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <FileText className="size-3.5" /> {t("canvas.imageDetail.fileSize")}
                                            </span>
                                            <span className="font-mono font-medium">
                                                {formatBytes(byteSize)}
                                            </span>
                                        </div>
                                    ) : null}

                                    {image?.mimeType ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500 flex items-center gap-1.5">
                                                <FileText className="size-3.5" /> {t("canvas.imageDetail.format")}
                                            </span>
                                            <span className="font-mono uppercase">
                                                {image.mimeType.split("/")[1] || "png"}
                                            </span>
                                        </div>
                                    ) : null}

                                    {image?.generationType ? (
                                        <div className="flex items-center justify-between py-1">
                                            <span className="text-zinc-500">{t("canvas.imageDetail.generationMode")}</span>
                                            <span className="font-medium capitalize">
                                                {image.generationType === "图生图" ? t("canvas.imageDetail.modeEdit") : t("canvas.imageDetail.modeGenerate")}
                                            </span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
