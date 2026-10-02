import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig, ReasoningEffort } from "@/stores/use-config-store";
import { reasoningEffortLabel } from "@/components/text-settings-panel";

type CanvasTextSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: "reasoningEffort", value: ReasoningEffort) => void;
    count?: number;
    onCountChange?: (count: number) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

const reasoningEffortOptions: ReasoningEffort[] = ["auto", "low", "medium", "high", "xhigh"];
const countPresets = [1, 2, 3, 4];

export function CanvasTextSettingsPopover({
    config,
    onConfigChange,
    count,
    onCountChange,
    buttonClassName,
    placement = "topLeft",
}: CanvasTextSettingsPopoverProps) {
    const { t } = useTranslation();
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
            if (!(target instanceof Node) || buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
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

    return (
        <div className="relative inline-flex min-w-0">
            <button
                ref={buttonRef}
                type="button"
                className={`canvas-text-settings-trigger inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                style={{ color: theme.node.text }}
                onClick={() => setOpen((current) => !current)}
                title={`${t("canvas.controls.reasoning")}: ${reasoningEffortLabel(config.reasoningEffort)}${onCountChange ? ` · ${t("canvas.controls.generations", { count })}` : ""}`}
            >
                <Settings2 className="size-3.5 shrink-0" />
                <span className="truncate">
                    {t("canvas.controls.reasoning")} · {reasoningEffortLabel(config.reasoningEffort)}{onCountChange ? ` · ${t("canvas.controls.generations", { count })}` : ""}
                </span>
            </button>
            {open && buttonRect ? (
                <TextSettingsDropdown
                    buttonRect={buttonRect}
                    panelRef={panelRef}
                    placement={placement}
                    theme={theme}
                    config={config}
                    count={count}
                    onConfigChange={onConfigChange}
                    onCountChange={onCountChange}
                />
            ) : null}
        </div>
    );
}

function TextSettingsDropdown({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    count,
    onConfigChange,
    onCountChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasTextSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    count?: number;
    onConfigChange: CanvasTextSettingsPopoverProps["onConfigChange"];
    onCountChange?: (count: number) => void;
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

    const currentEffort = config.reasoningEffort || "auto";

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-text-dropdown-menu text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-3">
                {/* 1. 思考强度 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.text.reasoning")}</span>
                        <span className="font-mono text-[10px] opacity-80">{reasoningEffortLabel(currentEffort)}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {reasoningEffortOptions.map((value) => {
                            const isSelected = currentEffort === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onConfigChange("reasoningEffort", value)}
                                    className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
                                        isSelected
                                            ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white"
                                            : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    }`}
                                >
                                    {t(`settingsPanels.common.${value}`)}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 2. 生成次数 (如果提供) */}
                {onCountChange && (
                    <>
                        <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />
                        <div>
                            <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                                <span>{t("settingsPanels.text.count")}</span>
                                <span className="font-mono text-[10px] opacity-80">{count || 1}</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                                {countPresets.map((val) => {
                                    const isSelected = (count || 1) === val;
                                    return (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => onCountChange(val)}
                                            className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
                                                isSelected
                                                    ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white"
                                                    : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                            }`}
                                        >
                                            {val}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}
