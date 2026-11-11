import { Tooltip } from "antd";
import { useEffect, useRef, useState, type RefObject, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { AspectIcon, normalizeImageQuality, normalizeImageResolution, resolveImageSize, formatScaleLabel, imageCountOptions, imageQualityOptions, imageResolutionOptions } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { getGenerationCount } from "@/lib/canvas/canvas-generation-helpers";
import { imageModelSettings } from "@/lib/image-model-settings";
import { inferMediaRatio, mediaRatioOptions, parseAspectRatio } from "@/lib/media-size";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

const segmentedButtonClass = (selected: boolean) =>
    `flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
        selected
            ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white"
            : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
    }`;

export function CanvasImageSettingsPopover({
    config,
    onConfigChange,
    onOpenChange,
    buttonClassName,
    placement = "topLeft",
}: CanvasImageSettingsPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
    const selectedRatio = inferMediaRatio(config.size || "1:1");
    const selectedQuality = normalizeImageQuality(config.quality);
    const selectedResolution = normalizeImageResolution(config.size);
    const selectedCount = String(getGenerationCount(config.count));
    const supported = imageModelSettings(config, config.model || config.imageModel);

    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        if (!isOpen) return;
        const syncPosition = () => setAnchorRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            setIsOpen(false);
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
    }, [isOpen]);

    const parsedCurrentRatio = parseAspectRatio(selectedRatio);
    const triggerRatioWidth = parsedCurrentRatio?.width || 1;
    const triggerRatioHeight = parsedCurrentRatio?.height || 1;
    const resolutionLabel = selectedResolution === "auto" ? t("settingsPanels.common.auto") : formatScaleLabel(selectedResolution);
    const qualityLabel = t(`settingsPanels.common.${selectedQuality}`);
    const countLabel = t("settingsPanels.image.images", { count: Number(selectedCount) });
    const summary = [selectedRatio, supported.resolution && resolutionLabel, countLabel, supported.quality && qualityLabel].filter(Boolean).join(" · ");

    return (
        <>
            <Tooltip title={summary} open={isOpen ? false : undefined}>
                <button
                    ref={buttonRef}
                    type="button"
                    className={`canvas-image-settings-trigger inline-flex h-8 min-w-0 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                    style={{ color: theme.node.text }}
                    onClick={() => {
                        if (isOpen) setIsOpen(false);
                        else {
                            setAnchorRect(buttonRef.current?.getBoundingClientRect() || null);
                            setIsOpen(true);
                        }
                    }}
                    aria-label={summary}
                >
                    <AspectIcon width={triggerRatioWidth} height={triggerRatioHeight} color="currentColor" size={16} />
                    <span className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-medium">
                        {summary}
                    </span>
                </button>
            </Tooltip>
            {isOpen && anchorRect ? (
                <CombinedImageSettingsDropdown
                    menuRef={menuRef}
                    anchorRect={anchorRect}
                    theme={theme}
                    placement={placement}
                    selectedRatio={selectedRatio}
                    selectedResolution={selectedResolution}
                    selectedQuality={selectedQuality}
                    selectedCount={selectedCount}
                    supported={supported}
                    onSelectRatio={(ratio) => onConfigChange("size", resolveImageSize(selectedResolution, ratio))}
                    onSelectResolution={(resolution) => onConfigChange("size", resolveImageSize(resolution, selectedRatio))}
                    onSelectQuality={(quality) => onConfigChange("quality", quality)}
                    onSelectCount={(count) => onConfigChange("count", count)}
                />
            ) : null}
        </>
    );
}

function CombinedImageSettingsDropdown({
    menuRef,
    anchorRect,
    theme,
    placement,
    selectedRatio,
    selectedResolution,
    selectedQuality,
    selectedCount,
    supported,
    onSelectRatio,
    onSelectResolution,
    onSelectQuality,
    onSelectCount,
}: {
    menuRef: RefObject<HTMLDivElement | null>;
    anchorRect: DOMRect;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    placement: CanvasImageSettingsPopoverProps["placement"];
    selectedRatio: string;
    selectedResolution: string;
    selectedQuality: string;
    selectedCount: string;
    supported: ReturnType<typeof imageModelSettings>;
    onSelectRatio: (ratio: string) => void;
    onSelectResolution: (resolution: string) => void;
    onSelectQuality: (quality: string) => void;
    onSelectCount: (count: string) => void;
}) {
    const { t } = useTranslation();
    const width = 276;
    const gap = 8;
    const margin = 12;
    const isPresetRatio = mediaRatioOptions.some((item) => item.value === selectedRatio);
    const [customInput, setCustomInput] = useState(() => (isPresetRatio ? "" : selectedRatio));

    useEffect(() => {
        if (!isPresetRatio) setCustomInput(selectedRatio);
    }, [selectedRatio, isPresetRatio]);

    const handleCustomInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const val = event.target.value.replace(/[^0-9:]/g, "");
        const parts = val.split(":");
        if (parts.length > 2) return;
        setCustomInput(val);
        if (parts.length === 2 && parts[0] && parts[1]) {
            const nextWidth = parseInt(parts[0], 10);
            const nextHeight = parseInt(parts[1], 10);
            if (nextWidth > 0 && nextHeight > 0) onSelectRatio(`${nextWidth}:${nextHeight}`);
        }
    };

    const handleCustomInputBlur = () => {
        if (!customInput) return;
        const match = customInput.match(/^(\d+):(\d+)$/);
        if (match) {
            const nextWidth = parseInt(match[1], 10);
            const nextHeight = parseInt(match[2], 10);
            if (nextWidth > 0 && nextHeight > 0) {
                onSelectRatio(`${nextWidth}:${nextHeight}`);
                return;
            }
        }
        setCustomInput(isPresetRatio ? "" : selectedRatio);
    };

    const alignRight = placement?.includes("Right");
    const topPlacement = placement?.startsWith("top");
    const left = alignRight
        ? Math.max(margin, anchorRect.right - width)
        : anchorRect.left + width > window.innerWidth - margin
          ? window.innerWidth - width - margin
          : Math.max(margin, Math.min(window.innerWidth - width - margin, anchorRect.left));
    const resolutionLabel = selectedResolution === "auto" ? t("settingsPanels.common.auto") : formatScaleLabel(selectedResolution);

    return createPortal(
        <div
            ref={menuRef}
            className="canvas-image-dropdown-menu text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            style={{
                position: "fixed",
                zIndex: 1200,
                width,
                left,
                ...(topPlacement ? { bottom: window.innerHeight - anchorRect.top + gap } : { top: anchorRect.bottom + gap }),
                background: theme.toolbar.panel,
                borderRadius: 16,
                boxShadow: "0 16px 40px rgba(0, 0, 0, 0.25)",
                border: `1px solid ${theme.node.stroke}`,
                padding: "12px",
                overflow: "hidden",
                color: theme.node.text,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-3">
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-medium opacity-50">
                        <span>{t("settingsPanels.image.aspectRatio")}</span>
                        <span className="text-xs font-medium opacity-70">{selectedRatio}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {mediaRatioOptions.map((item) => {
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
                                    onClick={() => onSelectRatio(item.value)}
                                >
                                    <AspectIcon width={item.width} height={item.height} color="currentColor" size={16} />
                                    <span>{item.value}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5 dark:bg-white/[0.04]">
                        <span className="shrink-0 text-xs font-medium opacity-50">{t("settingsPanels.image.customRatio")}</span>
                        <input
                            type="text"
                            inputMode="text"
                            placeholder={t("settingsPanels.image.customRatioPlaceholder")}
                            value={customInput}
                            onChange={handleCustomInputChange}
                            onBlur={handleCustomInputBlur}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    handleCustomInputBlur();
                                    (event.target as HTMLInputElement).blur();
                                }
                            }}
                            className={`h-6 min-w-0 flex-1 rounded border bg-transparent px-2 font-mono text-xs outline-none transition-all placeholder:text-xs placeholder:opacity-40 ${
                                !isPresetRatio && customInput === selectedRatio
                                    ? "border-stone-400/80 text-stone-900 dark:border-white/30 dark:text-white"
                                    : "border-transparent focus:border-stone-300 dark:focus:border-white/20"
                            }`}
                        />
                        {!isPresetRatio ? (
                            <span className="shrink-0 rounded-full bg-stone-900/10 px-1.5 py-0.5 text-xs font-medium text-stone-700 dark:bg-white/10 dark:text-stone-300">{t("settingsPanels.image.customRatioApplied")}</span>
                        ) : null}
                    </div>
                </div>

                <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />

                {supported.resolution && <>
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-medium opacity-50">
                        <span>{t("settingsPanels.image.resolution")}</span>
                        <span className="text-xs font-medium opacity-70">{resolutionLabel}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {imageResolutionOptions.map((item) => (
                            <button key={item.value} type="button" onClick={() => onSelectResolution(item.value)} className={segmentedButtonClass(selectedResolution === item.value)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />
                </>}

                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-medium opacity-50">
                        <span>{t("settingsPanels.image.count")}</span>
                        <span className="text-xs font-medium opacity-70">{t("settingsPanels.image.images", { count: Number(selectedCount) })}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {imageCountOptions.map((value) => (
                            <button key={value} type="button" onClick={() => onSelectCount(value)} className={segmentedButtonClass(selectedCount === value)}>
                                {value}
                            </button>
                        ))}
                    </div>
                </div>

                {supported.quality && <>
                <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />

                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-xs font-medium opacity-50">
                        <span>{t("settingsPanels.image.quality")}</span>
                        <span className="text-xs font-medium opacity-70">{t(`settingsPanels.common.${selectedQuality}`)}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {imageQualityOptions.map((item) => (
                            <button key={item.value} type="button" onClick={() => onSelectQuality(item.value)} className={segmentedButtonClass(selectedQuality === item.value)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
                </>}
            </div>
        </div>,
        document.body,
    );
}
