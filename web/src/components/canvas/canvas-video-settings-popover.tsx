import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Slider } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import {
    clampVideoSeconds,
    computeVideoSize,
    inferVideoRatio,
    parseVideoResolution,
    videoRatioOptions,
    VIDEO_SECONDS_MAX,
    VIDEO_SECONDS_MIN,
} from "@/lib/media-size";
import {
    videoModeLabel,
    videoResolutionLabel,
    videoSecondsLabel,
    videoSizeLabel,
    normalizeVideoModeValue,
} from "@/components/video-settings-panel";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

const resolutionOptions = [
    { value: "480", label: "480P" },
    { value: "720", label: "720P" },
    { value: "1080", label: "1080P" },
];

const videoModeOptions = [
    { value: "frames", labelKey: "frames" },
    { value: "reference", labelKey: "reference" },
];

export function CanvasVideoSettingsPopover({
    config,
    onConfigChange,
    buttonClassName,
    placement = "topLeft",
}: CanvasVideoSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const resolution = parseVideoResolution(config.vquality);
    const selectedRatio = inferVideoRatio(config.size || "auto");

    return (
        <div className="relative inline-flex min-w-0">
            <button
                ref={buttonRef}
                type="button"
                className={`canvas-video-settings-trigger inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                style={{ color: theme.node.text }}
                onClick={() => setOpen((current) => !current)}
                title={`${videoResolutionLabel(config.vquality)} · ${videoSizeLabel(config.size)} · ${videoSecondsLabel(config.videoSeconds)} · ${videoModeLabel(config.videoMode)}`}
            >
                <Settings2 className="size-3.5 shrink-0" />
                <span className="truncate inline-flex items-center gap-1">
                    <span className="font-medium">{videoResolutionLabel(config.vquality)}</span>
                    <span className="opacity-35">·</span>
                    <span className="font-medium opacity-90">{videoSizeLabel(config.size)}</span>
                    <span className="opacity-35">·</span>
                    <span className="opacity-90">{videoSecondsLabel(config.videoSeconds)}</span>
                    <span className="opacity-35">·</span>
                    <span className="text-[11px] opacity-75">{videoModeLabel(config.videoMode)}</span>
                </span>
            </button>
            {open && buttonRect ? (
                <VideoSettingsDropdown
                    buttonRect={buttonRect}
                    panelRef={panelRef}
                    placement={placement}
                    theme={theme}
                    config={config}
                    resolution={resolution}
                    selectedRatio={selectedRatio}
                    onConfigChange={onConfigChange}
                />
            ) : null}
        </div>
    );
}

function VideoSettingsDropdown({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    resolution,
    selectedRatio,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    resolution: string;
    selectedRatio: string;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
}) {
    const { t } = useTranslation();
    const width = 276;
    const gap = 8;
    const margin = 12;

    const alignRight = placement?.includes("Right");
    const topPlacement = placement?.startsWith("top");

    const left = alignRight
        ? Math.max(margin, buttonRect.right - width)
        : buttonRect.left + width > window.innerWidth - margin
        ? window.innerWidth - width - margin
        : Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left));

    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(topPlacement
            ? { bottom: window.innerHeight - buttonRect.top + gap }
            : { top: buttonRect.bottom + gap }),
        background: theme.toolbar.panel,
        borderRadius: 16,
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.25)",
        border: `1px solid ${theme.node.stroke}`,
        padding: "12px",
        overflow: "hidden",
        color: theme.node.text,
    } as const;

    const seconds = Number(clampVideoSeconds(config.videoSeconds || "6"));
    const videoMode = normalizeVideoModeValue(config.videoMode);

    const applySize = (nextResolution: string, ratio: string) => {
        onConfigChange("vquality", nextResolution);
        onConfigChange("size", computeVideoSize(nextResolution, ratio));
    };

    const selectResolution = (nextResolution: string) => {
        if (selectedRatio === "auto") onConfigChange("vquality", nextResolution);
        else applySize(nextResolution, selectedRatio);
    };

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-video-dropdown-menu text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-3">
                {/* 1. 宽高比选项 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.video.ratio")}</span>
                        <span className="font-mono text-[10px] opacity-80">{selectedRatio === "auto" ? t("settingsPanels.common.auto") : selectedRatio}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {videoRatioOptions.map((item) => {
                            const isSelected = selectedRatio === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={`group flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-all ${
                                        isSelected
                                            ? "border-stone-400/80 bg-black/5 text-stone-900 shadow-xs dark:border-white/30 dark:bg-white/10 dark:text-white"
                                            : "border-transparent bg-black/[0.02] text-stone-600 hover:bg-black/5 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:bg-white/8"
                                    }`}
                                    onClick={() => applySize(resolution, item.value)}
                                >
                                    <VideoAspectIcon width={item.width} height={item.height} color="currentColor" />
                                    <span>{item.value}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 细分割线 */}
                <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />

                {/* 2. 分辨率选择 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.video.quality")}</span>
                        <span className="font-mono text-[10px] opacity-80">{resolution}P</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {resolutionOptions.map((item) => {
                            const isSelected = resolution === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => selectResolution(item.value)}
                                    className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
                                        isSelected
                                            ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white"
                                            : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 细分割线 */}
                <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />

                {/* 3. 时长与模式 */}
                <div className="space-y-2.5">
                    <div>
                        <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                            <span>{t("settingsPanels.video.seconds")}</span>
                            <span className="font-mono text-[10px] opacity-80">{seconds}s</span>
                        </div>
                        <div className="flex items-center gap-2 px-0.5" onMouseDown={(e) => e.stopPropagation()}>
                            <Slider
                                className="min-w-0 flex-1 my-1"
                                min={VIDEO_SECONDS_MIN}
                                max={VIDEO_SECONDS_MAX}
                                step={1}
                                value={seconds}
                                onChange={(value) => onConfigChange("videoSeconds", String(Array.isArray(value) ? value[0] : value))}
                            />
                            <span className="w-8 shrink-0 text-right font-mono text-xs opacity-75">{seconds}s</span>
                        </div>
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                            <span>{t("settingsPanels.video.mode")}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                            {videoModeOptions.map((item) => {
                                const isSelected = videoMode === item.value;
                                return (
                                    <button
                                        key={item.value}
                                        type="button"
                                        onClick={() => onConfigChange("videoMode", item.value)}
                                        className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
                                            isSelected
                                                ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white"
                                                : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                        }`}
                                    >
                                        {t(`settingsPanels.video.modes.${item.labelKey}`)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function VideoAspectIcon({ width, height, color = "currentColor" }: { width: number; height: number; color?: string }) {
    const size = 16;
    const maxDimension = Math.max(width, height);
    const rectWidth = Math.max(5, Math.round((width / maxDimension) * (size - 3)));
    const rectHeight = Math.max(5, Math.round((height / maxDimension) * (size - 3)));
    const x = Math.round((size - rectWidth) / 2);
    const y = Math.round((size - rectHeight) / 2);

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" className="shrink-0">
            <rect
                x={x}
                y={y}
                width={rectWidth}
                height={rectHeight}
                rx={2.5}
                stroke={color}
                strokeWidth={1.5}
                fill="none"
            />
        </svg>
    );
}
