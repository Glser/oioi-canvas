import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Slider, Switch, Tooltip } from "antd";

import { AspectIcon } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import { boolConfig, resolveModelFeatures } from "@/stores/use-config-store";
import type { VideoFeatures } from "@/lib/model-features";
import { normalizeVideoMode, normalizeVideoOutputSelection, resolutionLabel, resolutionToken, videoDurations, videoFeatureModes, videoRatios, videoResolutions } from "@/lib/model-features";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio, parseAspectRatio, videoRatioOptions, VIDEO_SECONDS_MAX, VIDEO_SECONDS_MIN } from "@/lib/media-size";
import { videoModeLabel, videoResolutionLabel, videoSecondsLabel, videoSizeLabel } from "@/components/video-settings-panel";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

export function CanvasVideoSettingsPopover({ config, onConfigChange, buttonClassName, placement = "topLeft" }: CanvasVideoSettingsPopoverProps) {
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

    const features = resolveModelFeatures(config, config.videoModel)?.video;
    const normalizedMode = normalizeVideoMode(features, config.videoMode);
    const currentResolution = resolutionToken(config.vquality);
    const normalizedSelection = normalizeVideoOutputSelection(
        features,
        {
            resolution: currentResolution,
            ratio: inferVideoRatio(config.size || "auto") === "auto" ? features?.output?.defaults?.aspect_ratio || "16:9" : inferVideoRatio(config.size || "auto"),
            durationSeconds: clampVideoSeconds(config.videoSeconds || "6"),
        },
        { resolution: "720", ratio: "16:9", durationSeconds: "6", size: (resolution, ratio) => computeVideoSize(resolution.replace(/p.*$/i, "") || "720", ratio) },
    );

    useEffect(() => {
        if (normalizedMode !== config.videoMode) onConfigChange("videoMode", normalizedMode);
        if (normalizedSelection.resolution !== currentResolution) onConfigChange("vquality", normalizedSelection.resolution);
        if (normalizedSelection.size !== config.size) onConfigChange("size", normalizedSelection.size);
        if (normalizedSelection.durationSeconds !== clampVideoSeconds(config.videoSeconds || "6")) onConfigChange("videoSeconds", normalizedSelection.durationSeconds);
    }, [config.size, config.videoMode, config.videoSeconds, config.vquality, currentResolution, normalizedMode, normalizedSelection.durationSeconds, normalizedSelection.resolution, normalizedSelection.size, onConfigChange]);

    const selectedRatio = inferVideoRatio(config.size || "auto");
    const parsedRatio = parseAspectRatio(selectedRatio);
    const ratioOption = videoRatioOptions.find((item) => item.value === selectedRatio);
    const triggerRatioWidth = ratioOption?.width || parsedRatio?.width || 16;
    const triggerRatioHeight = ratioOption?.height || parsedRatio?.height || 9;

    return (
        <>
            <Tooltip title={`${videoSizeLabel(config.size)} · ${videoResolutionLabel(config.vquality)} · ${videoSecondsLabel(config.videoSeconds)} · ${videoModeLabel(normalizedMode, normalizedMode === "text")}`} open={open ? false : undefined}>
                <button
                    ref={buttonRef}
                    type="button"
                    className={`canvas-video-settings-trigger inline-flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                    style={{ color: theme.node.text }}
                    onClick={() => setOpen((current) => !current)}
                    aria-label={`${videoSizeLabel(config.size)} · ${videoResolutionLabel(config.vquality)} · ${videoSecondsLabel(config.videoSeconds)} · ${videoModeLabel(normalizedMode, normalizedMode === "text")}`}
                >
                    <AspectIcon width={triggerRatioWidth} height={triggerRatioHeight} color="currentColor" size={16} />
                    <span className="truncate inline-flex items-center gap-1">
                        <span className="font-medium">{videoSizeLabel(normalizedSelection.size)}</span>
                        <span className="opacity-35">·</span>
                        <span className="font-medium opacity-90">{resolutionLabel(normalizedSelection.resolution)}</span>
                        <span className="opacity-35">·</span>
                        <span className="opacity-90">{videoSecondsLabel(normalizedSelection.durationSeconds)}</span>
                        <span className="opacity-35">·</span>
                        <span className="text-[11px] opacity-75">{videoModeLabel(normalizedMode, normalizedMode === "text")}</span>
                    </span>
                </button>
            </Tooltip>
            {open && buttonRect ? (
                <VideoSettingsDropdown buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} features={features} resolution={currentResolution} selectedRatio={selectedRatio} onConfigChange={onConfigChange} />
            ) : null}
        </>
    );
}

function VideoSettingsDropdown({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    features,
    resolution,
    selectedRatio,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    features?: VideoFeatures;
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

    const left = alignRight ? Math.max(margin, buttonRect.right - width) : buttonRect.left + width > window.innerWidth - margin ? window.innerWidth - width - margin : Math.max(margin, Math.min(window.innerWidth - width - margin, buttonRect.left));

    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap } : { top: buttonRect.bottom + gap }),
        background: theme.toolbar.panel,
        borderRadius: 16,
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.25)",
        border: `1px solid ${theme.node.stroke}`,
        padding: "12px",
        overflow: "hidden",
        color: theme.node.text,
    } as const;

    const resolutions = videoResolutions(features);
    const ratios = videoRatios(features, resolution);
    const durations = videoDurations(features, resolution);
    const ratioItems = (ratios.length ? ratios : videoRatioOptions.map((item) => item.value)).map((value) => {
        const preset = videoRatioOptions.find((item) => item.value === value);
        const parsed = parseAspectRatio(value);
        return { value, width: preset?.width || parsed?.width || 16, height: preset?.height || parsed?.height || 9 };
    });
    const selection = normalizeVideoOutputSelection(
        features,
        { resolution, ratio: selectedRatio === "auto" ? features?.output?.defaults?.aspect_ratio || "16:9" : selectedRatio, durationSeconds: clampVideoSeconds(config.videoSeconds || "6") },
        {
            resolution: "720",
            ratio: selectedRatio === "auto" ? "16:9" : selectedRatio,
            durationSeconds: "6",
            size: (nextResolution, ratio) => computeVideoSize(nextResolution.replace(/p.*$/i, "") || "720", ratio),
        },
    );
    const seconds = Number(selection.durationSeconds);
    const videoMode = normalizeVideoMode(features, config.videoMode);
    const modes = videoFeatureModes(features);
    // 未登录/未获取到 features 数据时默认展示开关，拿到数据后按 supported 声明显隐
    const featuresLoaded = Boolean(features);
    const generateAudioSupported = featuresLoaded ? features!.generate_audio?.supported === true : true;
    const generateAudioDefault = features?.generate_audio?.default ?? true;
    const watermarkSupported = featuresLoaded ? features!.watermark?.supported === true : true;
    const watermarkDefault = features?.watermark?.default ?? false;

    const applySize = (nextResolution: string, ratio: string) => {
        const next = normalizeVideoOutputSelection(
            features,
            { resolution: nextResolution, ratio, durationSeconds: selection.durationSeconds },
            {
                resolution: selection.resolution,
                ratio: selection.ratio,
                durationSeconds: selection.durationSeconds,
                size: (resolutionValue, ratioValue) => computeVideoSize(resolutionValue.replace(/p.*$/i, "") || "720", ratioValue),
            },
        );
        onConfigChange("vquality", next.resolution);
        onConfigChange("size", next.size);
        onConfigChange("videoSeconds", next.durationSeconds);
    };

    const selectResolution = (nextResolution: string) => applySize(nextResolution, selection.ratio);

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
                        <span className="font-mono text-[10px] opacity-80">{selection.ratio}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {ratioItems.map((item) => {
                            const isSelected = selection.ratio === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    className={`group flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition-all ${
                                        isSelected
                                            ? "border-stone-400/80 bg-black/5 text-stone-900 shadow-xs dark:border-white/30 dark:bg-white/10 dark:text-white"
                                            : "border-transparent bg-black/[0.02] text-stone-600 hover:bg-black/5 dark:bg-white/[0.04] dark:text-stone-300 dark:hover:bg-white/8"
                                    }`}
                                    onClick={() => applySize(selection.resolution, item.value)}
                                >
                                    <AspectIcon width={item.width} height={item.height} color="currentColor" size={16} />
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
                        <span className="font-mono text-[10px] opacity-80">{resolutionLabel(selection.resolution)}</span>
                    </div>
                    <div className={`grid gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]`} style={{ gridTemplateColumns: `repeat(${Math.min(resolutions.length, 3)}, minmax(0, 1fr))` }}>
                        {resolutions.map((value) => {
                            const isSelected = selection.resolution === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => selectResolution(value)}
                                    className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
                                        isSelected ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white" : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    }`}
                                >
                                    {resolutionLabel(value)}
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
                            {durations.length > 1 ? (
                                <div className="flex min-w-0 flex-1 gap-1">
                                    {durations.map((value) => {
                                        const isSelected = seconds === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => onConfigChange("videoSeconds", String(value))}
                                                className={`min-w-0 flex-1 cursor-pointer rounded-lg px-1 py-1.5 text-xs transition-all ${
                                                    isSelected ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white" : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                                }`}
                                            >
                                                {value}s
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <Slider className="min-w-0 flex-1 my-1 mx-2.5" min={VIDEO_SECONDS_MIN} max={VIDEO_SECONDS_MAX} step={1} value={seconds} onChange={(value) => onConfigChange("videoSeconds", String(Array.isArray(value) ? value[0] : value))} />
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                            <span>{t("settingsPanels.video.mode")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                            {modes.map((value) => {
                                const isSelected = videoMode === value;
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => onConfigChange("videoMode", value)}
                                        className={`flex h-7 min-w-0 grow basis-24 cursor-pointer items-center justify-center rounded-lg px-1 text-xs transition-all ${
                                            isSelected ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white" : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                        }`}
                                    >
                                        {t(`settingsPanels.video.modes.${value}`)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {(generateAudioSupported || watermarkSupported) && (
                        <div>
                            <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                                <span>{t("settingsPanels.video.output")}</span>
                            </div>
                            <div className="space-y-1.5 px-0.5" onMouseDown={(e) => e.stopPropagation()}>
                                {generateAudioSupported && (
                                    <label className="flex cursor-pointer items-center justify-between text-xs">
                                        <span>{t("settingsPanels.video.generateAudio")}</span>
                                        <Switch
                                            size="small"
                                            checked={boolConfig(config.videoGenerateAudio, generateAudioDefault)}
                                            onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))}
                                        />
                                    </label>
                                )}
                                {watermarkSupported && (
                                    <label className="flex cursor-pointer items-center justify-between text-xs">
                                        <span>{t("settingsPanels.video.watermark")}</span>
                                        <Switch
                                            size="small"
                                            checked={boolConfig(config.videoWatermark, watermarkDefault)}
                                            onChange={(checked) => onConfigChange("videoWatermark", String(checked))}
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
