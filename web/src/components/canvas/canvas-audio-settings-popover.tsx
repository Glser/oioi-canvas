import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { AiConfig } from "@/stores/use-config-store";
import {
    audioFormatLabel,
    audioFormatOptions,
    audioSpeedLabel,
    audioVoiceLabel,
    audioVoiceOptions,
    normalizeAudioFormatValue,
    normalizeAudioSpeedValue,
    normalizeAudioVoiceValue,
} from "@/lib/audio-generation";

export type CanvasAudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type CanvasAudioSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
};

const speedOptions = ["0.75", "1", "1.25", "1.5"];

export function CanvasAudioSettingsPopover({
    config,
    onConfigChange,
    buttonClassName,
    placement = "topLeft",
}: CanvasAudioSettingsPopoverProps) {
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

    return (
        <div className="relative inline-flex min-w-0">
            <button
                ref={buttonRef}
                type="button"
                className={`canvas-audio-settings-trigger inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-xs font-normal shadow-xs transition hover:bg-black/5 dark:hover:bg-white/10 ${buttonClassName || ""}`}
                style={{ color: theme.node.text }}
                onClick={() => setOpen((current) => !current)}
                title={`${audioVoiceLabel(config.audioVoice)} · ${audioFormatLabel(config.audioFormat)} · ${audioSpeedLabel(config.audioSpeed)}`}
            >
                <Settings2 className="size-3.5 shrink-0" />
                <span className="truncate">
                    {audioVoiceLabel(config.audioVoice)} · {audioFormatLabel(config.audioFormat)} · {audioSpeedLabel(config.audioSpeed)}
                </span>
            </button>
            {open && buttonRect ? (
                <AudioSettingsDropdown
                    buttonRect={buttonRect}
                    panelRef={panelRef}
                    placement={placement}
                    theme={theme}
                    config={config}
                    onConfigChange={onConfigChange}
                />
            ) : null}
        </div>
    );
}

function AudioSettingsDropdown({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasAudioSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
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

    const voice = normalizeAudioVoiceValue(config.audioVoice);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-audio-dropdown-menu text-xs select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <div className="space-y-3">
                {/* 1. 音色选择 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.audio.voice")}</span>
                        <span className="font-mono text-[10px] opacity-80">{audioVoiceLabel(voice)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {audioVoiceOptions.map((item) => {
                            const isSelected = voice === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => onConfigChange("audioVoice", item.value)}
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

                {/* 2. 格式与语速 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.audio.format")}</span>
                        <span className="font-mono text-[10px] opacity-80">{format.toUpperCase()}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {audioFormatOptions.map((item) => {
                            const isSelected = format === item.value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => onConfigChange("audioFormat", item.value)}
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

                {/* 3. 语速倍率 */}
                <div>
                    <div className="mb-2 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.audio.speed")}</span>
                        <span className="font-mono text-[10px] opacity-80">{speed}x</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-black/[0.04] p-1 dark:bg-white/[0.06]">
                        {speedOptions.map((value) => {
                            const isSelected = speed === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => onConfigChange("audioSpeed", value)}
                                    className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs transition-all ${
                                        isSelected
                                            ? "bg-white font-semibold text-stone-900 shadow-xs dark:bg-stone-800 dark:text-white"
                                            : "font-normal text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
                                    }`}
                                >
                                    {value}x
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* 细分割线 */}
                <div className="h-px w-full bg-stone-200/60 dark:bg-white/10" />

                {/* 4. 音频提示指令 (可选输入) */}
                <div>
                    <div className="mb-1.5 flex items-center justify-between px-0.5 text-[11px] font-medium opacity-50">
                        <span>{t("settingsPanels.audio.instructions")}</span>
                    </div>
                    <textarea
                        value={config.audioInstructions || ""}
                        placeholder={t("settingsPanels.audio.instructionsPlaceholder")}
                        className="thin-scrollbar h-16 w-full resize-none rounded-lg border border-black/10 bg-black/[0.02] p-2 text-xs leading-4 outline-none focus:border-stone-400/80 dark:border-white/10 dark:bg-white/[0.03] dark:focus:border-white/30"
                        onChange={(e) => onConfigChange("audioInstructions", e.target.value)}
                    />
                </div>
            </div>
        </div>,
        document.body,
    );
}
