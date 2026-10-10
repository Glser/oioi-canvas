export function formatScaleLabel(value: string) {
    if (value === "720p") return "720P";
    if (value === "1080p") return "1080P";
    if (value === "2k") return "2K";
    if (value === "4k") return "4K";
    return value.toUpperCase();
}

import { useEffect, useRef, useState, type RefObject, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { AspectIcon } from "@/components/image-settings-panel";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import {
        inferMediaRatio,
        mediaRatioOptions,
        parseAspectRatio,
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

    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

    const activeSize = config.size || "1:1";
    const selectedRatio = inferMediaRatio(activeSize);

    const handleSelectRatio = (ratio: string) => {
        onConfigChange("size", ratio);
    };

    const toggleOpen = () => {
        if (isOpen) {
            setIsOpen(false);
        } else {
            setAnchorRect(buttonRef.current?.getBoundingClientRect() || null);
            setIsOpen(true);
        }
    };

    useEffect(() => {
        onOpenChange?.(isOpen);
    }, [isOpen, onOpenChange]);

    useEffect(() => {
        if (!isOpen) return;
        const syncPosition = () => {
            setAnchorRect(buttonRef.current?.getBoundingClientRect() || null);
        };
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;
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

    return (
        <div className="relative inline-flex">
            {/* 宽高比与分辨率一体化按钮 */}
            <button
                ref={buttonRef}
                type="button"
                className={`canvas-image-settings-trigger inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                style={{ color: theme.node.text }}
                onClick={toggleOpen}
                title={`${t("settingsPanels.image.aspectRatio")}: ${selectedRatio}`}
            >
                <AspectIcon
                    width={triggerRatioWidth}
                    height={triggerRatioHeight}
                    color="currentColor"
                    size={16}
                />
                <span className="font-medium">{selectedRatio}</span>
            </button>

            {/* 下拉面板 */}
            {isOpen && anchorRect ? (
                <CombinedImageSettingsDropdown
                    menuRef={menuRef}
                    anchorRect={anchorRect}
                    theme={theme}
                    placement={placement}
                    selectedRatio={selectedRatio}
                    onSelectRatio={handleSelectRatio}
                />
            ) : null}
        </div>
    );
}

function CombinedImageSettingsDropdown({
    menuRef,
    anchorRect,
    theme,
    placement,
    selectedRatio,
    onSelectRatio,
}: {
    menuRef: RefObject<HTMLDivElement | null>;
    anchorRect: DOMRect;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    placement: CanvasImageSettingsPopoverProps["placement"];
    selectedRatio: string;
    onSelectRatio: (ratio: string) => void;
}) {
    const { t } = useTranslation();
    const width = 276;
    const gap = 8;
    const margin = 12;

    const isPresetRatio = mediaRatioOptions.some((o) => o.value === selectedRatio);
    const [customInput, setCustomInput] = useState(() => (isPresetRatio ? "" : selectedRatio));

    useEffect(() => {
        if (!isPresetRatio) {
            setCustomInput(selectedRatio);
        }
    }, [selectedRatio, isPresetRatio]);

    const handleCustomInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        // 仅允许数字和英文冒号
        const val = e.target.value.replace(/[^0-9:]/g, "");
        // 限制最多只有一个冒号
        const parts = val.split(":");
        if (parts.length > 2) return;
        setCustomInput(val);

        if (parts.length === 2 && parts[0] && parts[1]) {
            const w = parseInt(parts[0], 10);
            const h = parseInt(parts[1], 10);
            if (w > 0 && h > 0) {
                onSelectRatio(`${w}:${h}`);
            }
        }
    };

    const handleCustomInputBlur = () => {
        if (!customInput) return;
        const match = customInput.match(/^(\d+):(\d+)$/);
        if (match) {
            const w = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            if (w > 0 && h > 0) {
                onSelectRatio(`${w}:${h}`);
                return;
            }
        }
        if (!isPresetRatio) {
            setCustomInput(selectedRatio);
        } else {
            setCustomInput("");
        }
    };

    const alignRight = placement?.includes("Right");
    const topPlacement = placement?.startsWith("top");

    const left = alignRight
        ? Math.max(margin, anchorRect.right - width)
        : anchorRect.left + width > window.innerWidth - margin
        ? window.innerWidth - width - margin
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
        borderRadius: 16,
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.25)",
        border: `1px solid ${theme.node.stroke}`,
        padding: "12px",
        overflow: "hidden",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div
            ref={menuRef}
            className="canvas-image-dropdown-menu text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-3">
                {/* 1. 上面是宽高比选项 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.image.aspectRatio")}</span>
                        <span className="font-mono text-[10px] opacity-80">{selectedRatio}</span>
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
                                    <AspectIcon
                                        width={item.width}
                                        height={item.height}
                                        color="currentColor"
                                        size={16}
                                    />
                                    <span>{item.value}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 自定义比例输入 */}
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/[0.03] px-2.5 py-1.5 dark:bg-white/[0.04]">
                        <span className="shrink-0 text-[11px] font-medium opacity-60">自定义</span>
                        <input
                            type="text"
                            inputMode="text"
                            placeholder="如 16:10、4:5"
                            value={customInput}
                            onChange={handleCustomInputChange}
                            onBlur={handleCustomInputBlur}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleCustomInputBlur();
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            className={`h-6 min-w-0 flex-1 rounded border bg-transparent px-2 font-mono text-xs outline-none transition-all placeholder:text-[11px] placeholder:opacity-40 ${
                                !isPresetRatio && customInput === selectedRatio
                                    ? "border-stone-400/80 text-stone-900 dark:border-white/30 dark:text-white"
                                    : "border-transparent focus:border-stone-300 dark:focus:border-white/20"
                            }`}
                        />
                        {!isPresetRatio && (
                            <span className="shrink-0 rounded-full bg-stone-900/10 px-1.5 py-0.5 text-[10px] font-medium text-stone-700 dark:bg-white/10 dark:text-stone-300">
                                已生效
                            </span>
                        )}
                    </div>
                </div>

            </div>
        </div>,
        document.body,
    );
}
