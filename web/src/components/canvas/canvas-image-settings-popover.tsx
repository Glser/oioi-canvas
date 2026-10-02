import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AspectIcon } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import {
    computeMediaSize,
    inferMediaRatio,
    inferMediaScale,
    mediaRatioOptions,
    mediaScaleOptions,
} from "@/lib/media-size";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
};

export function CanvasImageSettingsPopover({
    config,
    onConfigChange,
    onOpenChange,
    buttonClassName,
    placement = "topLeft",
}: CanvasImageSettingsPopoverProps) {
    const { t } = useTranslation();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    const scaleButtonRef = useRef<HTMLButtonElement>(null);
    const ratioButtonRef = useRef<HTMLButtonElement>(null);
    const scaleMenuRef = useRef<HTMLDivElement>(null);
    const ratioMenuRef = useRef<HTMLDivElement>(null);

    const [openDropdown, setOpenDropdown] = useState<"scale" | "ratio" | null>(null);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

    const activeSize = config.size || "auto";
    const selectedScale = inferMediaScale(activeSize);
    const selectedRatio = inferMediaRatio(activeSize);

    const applySize = (scale: string, ratio: string) => {
        onConfigChange("size", computeMediaSize(scale, ratio));
    };

    const handleSelectScale = (scale: string) => {
        if (scale === "auto") {
            onConfigChange("size", selectedRatio === "auto" ? "auto" : selectedRatio);
        } else {
            applySize(scale, selectedRatio === "auto" ? "1:1" : selectedRatio);
        }
        setOpenDropdown(null);
    };

    const handleSelectRatio = (ratio: string) => {
        if (ratio === "auto") {
            onConfigChange("size", "auto");
        } else {
            applySize(selectedScale === "auto" ? "1k" : selectedScale, ratio);
        }
        setOpenDropdown(null);
    };

    const toggleScale = () => {
        if (openDropdown === "scale") {
            setOpenDropdown(null);
        } else {
            setAnchorRect(scaleButtonRef.current?.getBoundingClientRect() || null);
            setOpenDropdown("scale");
        }
    };

    const toggleRatio = () => {
        if (openDropdown === "ratio") {
            setOpenDropdown(null);
        } else {
            setAnchorRect(ratioButtonRef.current?.getBoundingClientRect() || null);
            setOpenDropdown("ratio");
        }
    };

    useEffect(() => {
        onOpenChange?.(openDropdown !== null);
    }, [openDropdown, onOpenChange]);

    useEffect(() => {
        if (!openDropdown) return;
        const syncPosition = () => {
            const btn = openDropdown === "scale" ? scaleButtonRef.current : ratioButtonRef.current;
            setAnchorRect(btn?.getBoundingClientRect() || null);
        };
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (scaleButtonRef.current?.contains(target) || ratioButtonRef.current?.contains(target)) return;
            if (scaleMenuRef.current?.contains(target) || ratioMenuRef.current?.contains(target)) return;
            setOpenDropdown(null);
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
    }, [openDropdown]);

    const currentRatioOption = mediaRatioOptions.find((o) => o.value === selectedRatio);

    return (
        <div className="flex items-center gap-1.5">
            {/* 分辨率选择按钮 */}
            <button
                ref={scaleButtonRef}
                type="button"
                className={`inline-flex cursor-pointer items-center justify-between gap-1.5 rounded-lg px-2 text-xs font-medium transition hover:opacity-85 active:scale-95 ${buttonClassName || "!h-8"}`}
                style={{ background: theme.node.fill, color: theme.node.text }}
                onClick={toggleScale}
                title={t("settingsPanels.image.resolution")}
            >
                <Gauge className="size-3.5 opacity-75" />
                <span className="font-medium">
                    {selectedScale === "auto" ? t("settingsPanels.common.auto") : selectedScale.toUpperCase()}
                </span>
                <ChevronDown className={`size-3.5 opacity-60 transition-transform ${openDropdown === "scale" ? "rotate-180" : ""}`} />
            </button>

            {/* 宽高比选择按钮 */}
            <button
                ref={ratioButtonRef}
                type="button"
                className={`inline-flex cursor-pointer items-center justify-between gap-1.5 rounded-lg px-2 text-xs font-medium transition hover:opacity-85 active:scale-95 ${buttonClassName || "!h-8"}`}
                style={{ background: theme.node.fill, color: theme.node.text }}
                onClick={toggleRatio}
                title={t("settingsPanels.image.aspectRatio")}
            >
                {currentRatioOption ? (
                    <AspectIcon width={currentRatioOption.width} height={currentRatioOption.height} color={theme.node.text} size={15} />
                ) : null}
                <span className="font-medium">
                    {selectedRatio === "auto" ? t("settingsPanels.common.auto") : selectedRatio}
                </span>
                <ChevronDown className={`size-3.5 opacity-60 transition-transform ${openDropdown === "ratio" ? "rotate-180" : ""}`} />
            </button>

            {/* 下拉浮层 */}
            {openDropdown && anchorRect ? (
                <DropdownMenuPortal
                    type={openDropdown}
                    anchorRect={anchorRect}
                    menuRef={openDropdown === "scale" ? scaleMenuRef : ratioMenuRef}
                    placement={placement}
                    theme={theme}
                    selectedScale={selectedScale}
                    selectedRatio={selectedRatio}
                    onSelectScale={handleSelectScale}
                    onSelectRatio={handleSelectRatio}
                />
            ) : null}
        </div>
    );
}

function DropdownMenuPortal({
    type,
    anchorRect,
    menuRef,
    placement,
    theme,
    selectedScale,
    selectedRatio,
    onSelectScale,
    onSelectRatio,
}: {
    type: "scale" | "ratio";
    anchorRect: DOMRect;
    menuRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    selectedScale: string;
    selectedRatio: string;
    onSelectScale: (scale: string) => void;
    onSelectRatio: (ratio: string) => void;
}) {
    const { t } = useTranslation();
    const isRatio = type === "ratio";
    const width = isRatio ? 248 : 136;
    const gap = 6;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const topPlacement = placement?.startsWith("top");

    const left = alignRight
        ? anchorRect.right - width
        : Math.max(margin, Math.min(window.innerWidth - width - margin, anchorRect.left));

    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left,
        ...(topPlacement
            ? { bottom: window.innerHeight - anchorRect.top + gap }
            : { top: anchorRect.bottom + gap }),
        background: theme.toolbar.panel,
        borderRadius: 14,
        boxShadow: "0 14px 40px rgba(0, 0, 0, 0.22)",
        border: `1px solid ${theme.node.stroke}`,
        padding: "8px",
        overflow: "hidden",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={menuRef}
            className="canvas-image-dropdown-menu text-xs select-none"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {type === "scale" ? (
                <div className="space-y-0.5">
                    <div className="px-2 py-1 text-[11px] font-medium opacity-45">
                        {t("settingsPanels.image.resolution")}
                    </div>
                    {mediaScaleOptions.map((value) => {
                        const isSelected = selectedScale === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                className="flex h-7.5 w-full cursor-pointer items-center justify-between rounded-md px-2 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                style={{
                                    color: isSelected ? theme.node.text : theme.node.muted,
                                    fontWeight: isSelected ? 600 : 400,
                                }}
                                onClick={() => onSelectScale(value)}
                            >
                                <span className="flex items-center gap-1.5">
                                    <Gauge className="size-3 opacity-60" />
                                    <span>{value === "auto" ? t("settingsPanels.common.auto") : value.toUpperCase()}</span>
                                </span>
                                {isSelected ? <Check className="size-3.5 text-indigo-500" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="space-y-1.5">
                    <div className="px-1 text-[11px] font-medium opacity-45">
                        {t("settingsPanels.image.aspectRatio")}
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                        {mediaRatioOptions.map((item) => {
                            const isSelected = selectedRatio === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    className="flex h-8 w-full cursor-pointer items-center justify-between rounded-lg border px-2 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                    style={{
                                        borderColor: isSelected ? theme.node.text : "transparent",
                                        background: isSelected ? "rgba(125, 125, 125, 0.08)" : "transparent",
                                        color: isSelected ? theme.node.text : theme.node.muted,
                                        fontWeight: isSelected ? 600 : 400,
                                    }}
                                    onClick={() => onSelectRatio(item.value)}
                                >
                                    <div className="flex items-center gap-2">
                                        <AspectIcon
                                            width={item.width}
                                            height={item.height}
                                            color={isSelected ? theme.node.text : theme.node.muted}
                                            size={14}
                                        />
                                        <span>{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                                    </div>
                                    {isSelected ? <Check className="size-3 text-indigo-500 shrink-0" /> : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}
