import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Brain } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig, ReasoningEffort } from "@/stores/use-config-store";
import { reasoningEffortLabel } from "@/components/text-settings-panel";

type CanvasTextSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: "reasoningEffort", value: ReasoningEffort) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

const reasoningEffortLevels: ReasoningEffort[] = ["low", "medium", "high", "xhigh", "max", "ultra"];

// 星尘粒子位置与大小
const STARDUST_PARTICLES = [
    { left: "8%", top: "42%", size: 2, opacity: 0.8 },
    { left: "14%", top: "68%", size: 1.5, opacity: 0.7 },
    { left: "20%", top: "32%", size: 2.5, opacity: 0.9 },
    { left: "27%", top: "62%", size: 2, opacity: 0.75 },
    { left: "36%", top: "28%", size: 2, opacity: 0.85 },
    { left: "43%", top: "65%", size: 2.5, opacity: 0.9 },
    { left: "52%", top: "45%", size: 3, opacity: 1 },
    { left: "61%", top: "68%", size: 1.8, opacity: 0.7 },
    { left: "70%", top: "35%", size: 2.2, opacity: 0.85 },
    { left: "78%", top: "58%", size: 2, opacity: 0.8 },
    { left: "86%", top: "42%", size: 2.8, opacity: 0.95 },
    { left: "93%", top: "62%", size: 2, opacity: 0.75 },
];

export function CanvasTextSettingsPopover({
    config,
    onConfigChange,
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

    const currentEffort: ReasoningEffort =
        config.reasoningEffort && reasoningEffortLevels.includes(config.reasoningEffort)
            ? config.reasoningEffort
            : "medium";

    return (
        <div className="relative inline-flex min-w-0">
            <button
                ref={buttonRef}
                type="button"
                className={`canvas-text-settings-trigger inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                style={{ color: theme.node.text }}
                onClick={() => setOpen((current) => !current)}
                title={`${t("canvas.controls.reasoning")}: ${reasoningEffortLabel(currentEffort)}`}
            >
                <Brain className="size-3.5 shrink-0" />
                <span className="truncate">
                    {t("canvas.controls.reasoning")} · {reasoningEffortLabel(currentEffort)}
                </span>
            </button>
            {open && buttonRect ? (
                <TextSettingsDropdown
                    buttonRect={buttonRect}
                    panelRef={panelRef}
                    placement={placement}
                    theme={theme}
                    currentEffort={currentEffort}
                    onConfigChange={onConfigChange}
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
    currentEffort,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasTextSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    currentEffort: ReasoningEffort;
    onConfigChange: CanvasTextSettingsPopoverProps["onConfigChange"];
}) {
    const { t } = useTranslation();
    const width = 300;
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
        padding: "14px 16px",
        overflow: "hidden",
        color: theme.node.text,
    } as const;

    const effortIndex = Math.max(0, reasoningEffortLevels.indexOf(currentEffort));
    const totalSteps = reasoningEffortLevels.length - 1;
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // 每一个刻度中心的百分比 (从 0% 到 100%)
    const thumbPercentage = (effortIndex / totalSteps) * 100;

    const updateEffortFromPointer = (clientX: number) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        if (rect.width <= 0) return;
        // 刻度中心均匀分布在轨道左右中心之间
        const relativeX = clientX - rect.left;
        const fraction = Math.max(0, Math.min(1, relativeX / rect.width));
        const index = Math.round(fraction * totalSteps);
        const clampedIndex = Math.max(0, Math.min(totalSteps, index));
        const nextEffort = reasoningEffortLevels[clampedIndex];
        if (nextEffort && nextEffort !== currentEffort) {
            onConfigChange("reasoningEffort", nextEffort);
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        updateEffortFromPointer(e.clientX);

        const handlePointerMove = (moveEvent: PointerEvent) => {
            updateEffortFromPointer(moveEvent.clientX);
        };

        const handlePointerUp = () => {
            setIsDragging(false);
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
    };

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-text-dropdown-menu text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="py-0.5">
                <div>
                    {/* 滑块主轨道：带边距确保两端圆心与文字严格对齐 */}
                    <div className="relative px-2.5">
                        <div
                            ref={trackRef}
                            className="group relative flex h-7 w-full cursor-pointer touch-none items-center rounded-full select-none"
                            onPointerDown={handlePointerDown}
                        >
                            {/* 1. 底层暗色轨道背景 (未覆盖区域) */}
                            <div className="absolute inset-0 rounded-full bg-stone-200/70 dark:bg-stone-800/80 shadow-inner" />

                            {/* 2. 覆盖激活区域 (从滑块左端到滑块当前位置，具备蓝色到紫色的丰富渐变与星尘光晕) */}
                            <div
                                className={`absolute left-0 top-0 bottom-0 rounded-full overflow-hidden shadow-[0_0_10px_rgba(99,102,241,0.3)] ${
                                    isDragging ? "transition-none" : "transition-all duration-200 ease-out"
                                }`}
                                style={{
                                    // 覆盖宽度刚好延伸到滑块圆球右侧边缘，确保完全填充圆球覆盖过的轨迹
                                    width: effortIndex === 0 ? 0 : `calc(${thumbPercentage}% + 10px)`,
                                    opacity: effortIndex === 0 ? 0 : 1,
                                    background: "linear-gradient(90deg, #1d4ed8 0%, #2563eb 20%, #4f46e5 45%, #7c3aed 75%, #9333ea 100%)",
                                }}
                            >
                                {/* 轨道内部璀璨星尘粒子 (精准还原参考图点缀星光) */}
                                <div className="pointer-events-none absolute inset-0 w-[300px]">
                                    {STARDUST_PARTICLES.map((particle, i) => (
                                        <span
                                            key={i}
                                            className="absolute rounded-full bg-white blur-[0.2px]"
                                            style={{
                                                left: particle.left,
                                                top: particle.top,
                                                width: particle.size,
                                                height: particle.size,
                                                opacity: particle.opacity,
                                                boxShadow: `0 0 2.5px rgba(255, 255, 255, ${particle.opacity})`,
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* 3. 纯白质感立体圆形滑块 Thumb (圆心中心严格对应在各刻度点上) */}
                            <div
                                className={`absolute top-1/2 -translate-y-1/2 size-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.3),0_0_2px_rgba(0,0,0,0.15)] ring-2 ring-white/70 ${
                                    isDragging ? "scale-110 transition-none" : "transition-all duration-200 ease-out"
                                }`}
                                style={{
                                    // 确保圆球中心精确停留在 thumbPercentage 处
                                    left: `${thumbPercentage}%`,
                                    marginLeft: "-10px",
                                }}
                            />
                        </div>

                        {/* 4. 底部 6 档刻度文字：每个文字宽度为 0 且 overflow-visible，居中对齐在各自刻度点百分比正下方 */}
                        <div className="relative mt-2.5 h-4 w-full">
                            {reasoningEffortLevels.map((lvl, idx) => {
                                const isSelected = effortIndex === idx;
                                const stepPercent = (idx / totalSteps) * 100;
                                return (
                                    <div
                                        key={lvl}
                                        className="absolute top-0 flex -translate-x-1/2 justify-center"
                                        style={{ left: `${stepPercent}%` }}
                                    >
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onConfigChange("reasoningEffort", lvl);
                                            }}
                                            className={`cursor-pointer whitespace-nowrap text-[10px] transition-all ${
                                                isSelected
                                                    ? "font-bold text-indigo-600 scale-105 dark:text-indigo-400"
                                                    : "font-medium text-stone-400 hover:text-stone-700 dark:text-stone-500 dark:hover:text-stone-300"
                                            }`}
                                        >
                                            {reasoningEffortLabel(lvl)}
                                        </button>
                                    </div>
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