import { type ReactNode, useState } from "react";
import { ConfigProvider, Switch } from "antd";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { computeMediaSize, inferMediaRatio, inferMediaScale, mediaRatioOptions, mediaScaleOptions, readMediaDimensions } from "@/lib/media-size";
import { formatScaleLabel } from "@/components/canvas/canvas-image-settings-popover";
import type { AiConfig } from "@/stores/use-config-store";

const qualityOptions = [
    { value: "auto", labelKey: "auto" },
    { value: "high", labelKey: "high" },
    { value: "medium", labelKey: "medium" },
    { value: "low", labelKey: "low" },
];
const DIMENSION_STEP = 16;

export const imageQualityOptions = qualityOptions.map((item) => ({ value: item.value, get label() { return i18n.t(`settingsPanels.common.${item.labelKey}`); } }));
export const imageAspectOptions = mediaRatioOptions.map((item) => ({ value: item.value, label: item.value === "auto" ? i18n.t("settingsPanels.common.auto") : item.value }));
export const imageScaleOptions = mediaScaleOptions.map((value) => ({ value, label: formatScaleLabel(value) }));

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "size" | "count" | "background", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    showQuality?: boolean;
    showSizeDimensions?: boolean;
    showCount?: boolean;
    dropdownMode?: boolean;
    className?: string;
    maxCount?: number;
    quickCount?: number;
};

export function ImageSettingsPanel({
    config,
    onConfigChange,
    theme,
    showTitle = true,
    showQuality = true,
    showSizeDimensions = true,
    showCount = true,
    dropdownMode = false,
    className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5",
    maxCount = 15,
    quickCount = 10,
}: ImageSettingsPanelProps) {
    const { t } = useTranslation();
    const [snapDimensionToStep, setSnapDimensionToStep] = useState(true);
    const [openSelect, setOpenSelect] = useState<"scale" | "ratio" | null>(null);
    const quality = config.quality || "auto";
    const count = Math.max(1, Math.min(maxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const transparentBackground = config.background === "transparent";
    const selectedScale = inferMediaScale(activeSize);
    const selectedRatio = inferMediaRatio(activeSize);
    const dimensions = readMediaDimensions(activeSize, selectedScale, selectedRatio);
    const applySize = (scale: string, ratio: string) => onConfigChange("size", computeMediaSize(scale, ratio));
    const selectScale = (scale: string) => {
        if (scale === "auto") {
            onConfigChange("size", selectedRatio === "auto" ? "auto" : selectedRatio);
            return;
        }
        applySize(scale, selectedRatio === "auto" ? "1:1" : selectedRatio);
    };
    const selectRatio = (ratio: string) => {
        if (ratio === "auto") {
            onConfigChange("size", "auto");
            return;
        }
        applySize(selectedScale === "auto" ? "1080p" : selectedScale, ratio);
    };
    const updateDimension = (key: "width" | "height", value: number | null) => {
        const next = Math.max(1, Math.floor(value || dimensions[key] || 1024));
        const width = key === "width" ? next : dimensions.width;
        const height = key === "height" ? next : dimensions.height;
        onConfigChange("size", `${alignDimension(width, snapDimensionToStep)}x${alignDimension(height, snapDimensionToStep)}`);
    };

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => {
                    event.stopPropagation();
                    if (event.target instanceof HTMLInputElement) return;
                    if (document.activeElement instanceof HTMLInputElement && event.currentTarget.contains(document.activeElement)) document.activeElement.blur();
                }}
            >
                {showTitle ? <div className="text-lg font-semibold">{t("settingsPanels.image.title")}</div> : null}
                {showQuality ? (
                    <div className="space-y-2">
                        <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.quality")}</SettingTitle>
                        <div className="grid grid-cols-4 gap-2">
                            {qualityOptions.map((item) => (
                                <OptionPill key={item.value} selected={quality === item.value} theme={theme} onClick={() => onConfigChange("quality", item.value)}>
                                    {t(`settingsPanels.common.${item.labelKey}`)}
                                </OptionPill>
                            ))}
                        </div>
                    </div>
                ) : null}
                {showSizeDimensions ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                            <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.size")}</SettingTitle>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium" style={{ color: theme.node.muted }}>
                                    {t("settingsPanels.image.align16")}
                                </span>
                                <span title={t("settingsPanels.image.align16Hint")} onMouseDown={(event) => event.stopPropagation()}>
                                    <Switch size="small" checked={snapDimensionToStep} onChange={setSnapDimensionToStep} />
                                </span>
                            </div>
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
                            <DimensionInput prefix="W" value={dimensions.width} disabled={selectedRatio === "auto"} theme={theme} alignToStep={snapDimensionToStep} onChange={(value) => updateDimension("width", value)} />
                            <span className="text-lg opacity-45">↔</span>
                            <DimensionInput prefix="H" value={dimensions.height} disabled={selectedRatio === "auto"} theme={theme} alignToStep={snapDimensionToStep} onChange={(value) => updateDimension("height", value)} />
                        </div>
                    </div>
                ) : null}
                {dropdownMode ? (
                    <div className="space-y-3">
                        {/* 分辨率下拉选择 */}
                        <div className="space-y-1.5">
                            <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.resolution")}</SettingTitle>
                            <div className="relative">
                                <button
                                    type="button"
                                    className="flex h-8 w-full cursor-pointer items-center justify-between rounded-lg border px-2.5 text-xs transition hover:opacity-80"
                                    style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                                    onClick={() => setOpenSelect(openSelect === "scale" ? null : "scale")}
                                >
                                    <span className="font-medium">{formatScaleLabel(selectedScale)}</span>
                                    <ChevronDown className={`size-3.5 opacity-60 transition-transform ${openSelect === "scale" ? "rotate-180" : ""}`} />
                                </button>
                                {openSelect === "scale" ? (
                                    <div
                                        className="mt-1 overflow-hidden rounded-lg border p-1 shadow-md"
                                        style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                                    >
                                        {mediaScaleOptions.map((value) => {
                                            const isSelected = selectedScale === value;
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    className="flex h-7.5 w-full cursor-pointer items-center justify-between rounded-md px-2 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                                    style={{ color: isSelected ? theme.node.text : theme.node.muted, fontWeight: isSelected ? 600 : 400 }}
                                                    onClick={() => {
                                                        selectScale(value);
                                                        setOpenSelect(null);
                                                    }}
                                                >
                                                    <span>{formatScaleLabel(value)}</span>
                                                    {isSelected ? <Check className="size-3.5 text-indigo-500" /> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* 宽高比下拉选择 */}
                        <div className="space-y-1.5">
                            <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.aspectRatio")}</SettingTitle>
                            <div className="relative">
                                <button
                                    type="button"
                                    className="flex h-8 w-full cursor-pointer items-center justify-between rounded-lg border px-2.5 text-xs transition hover:opacity-80"
                                    style={{ borderColor: theme.node.stroke, background: theme.node.fill, color: theme.node.text }}
                                    onClick={() => setOpenSelect(openSelect === "ratio" ? null : "ratio")}
                                >
                                    <div className="flex items-center gap-2">
                                        {(() => {
                                            const current = mediaRatioOptions.find((o) => o.value === selectedRatio);
                                            return current ? <AspectIcon width={current.width} height={current.height} color={theme.node.text} size={15} /> : null;
                                        })()}
                                        <span className="font-medium">{selectedRatio === "auto" ? t("settingsPanels.common.auto") : selectedRatio}</span>
                                    </div>
                                    <ChevronDown className={`size-3.5 opacity-60 transition-transform ${openSelect === "ratio" ? "rotate-180" : ""}`} />
                                </button>
                                {openSelect === "ratio" ? (
                                    <div
                                        className="mt-1 max-h-48 overflow-y-auto rounded-lg border p-1 shadow-md"
                                        style={{ borderColor: theme.node.stroke, background: theme.node.fill }}
                                    >
                                        {mediaRatioOptions.map((item) => {
                                            const isSelected = selectedRatio === item.value;
                                            return (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    className="flex h-7.5 w-full cursor-pointer items-center justify-between rounded-md px-2 text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                                    style={{ color: isSelected ? theme.node.text : theme.node.muted, fontWeight: isSelected ? 600 : 400 }}
                                                    onClick={() => {
                                                        selectRatio(item.value);
                                                        setOpenSelect(null);
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <AspectIcon width={item.width} height={item.height} color={isSelected ? theme.node.text : theme.node.muted} size={15} />
                                                        <span>{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                                                    </div>
                                                    {isSelected ? <Check className="size-3.5 text-indigo-500" /> : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.resolution")}</SettingTitle>
                            <div className="grid grid-cols-4 gap-2">
                                {mediaScaleOptions.map((value) => (
                                    <OptionPill key={value} selected={selectedScale === value} theme={theme} onClick={() => selectScale(value)}>
                                        {formatScaleLabel(value)}
                                    </OptionPill>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.aspectRatio")}</SettingTitle>
                            <div className="grid grid-cols-4 gap-2">
                                {mediaRatioOptions.map((item) => {
                                    const isSelected = selectedRatio === item.value;
                                    return (
                                        <button
                                            key={item.value}
                                            type="button"
                                            className="flex h-15 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border bg-transparent text-xs transition hover:opacity-80"
                                            style={{
                                                borderColor: isSelected ? theme.node.text : theme.node.stroke,
                                                background: isSelected ? "rgba(125, 125, 125, 0.08)" : "transparent",
                                                color: isSelected ? theme.node.text : theme.node.muted,
                                            }}
                                            onMouseDown={(event) => event.stopPropagation()}
                                            onClick={() => selectRatio(item.value)}
                                        >
                                            <span className="font-medium">{item.value === "auto" ? t("settingsPanels.common.auto") : item.value}</span>
                                            <AspectIcon width={item.width} height={item.height} color={isSelected ? theme.node.text : theme.node.muted} />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
                <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                        <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.transparent")}</SettingTitle>
                        <div className="text-xs" style={{ color: theme.node.muted, opacity: 0.75 }}>
                            {t("settingsPanels.image.transparentHint")}
                        </div>
                    </div>
                    <span onMouseDown={(event) => event.stopPropagation()}>
                        <Switch size="small" checked={transparentBackground} onChange={(checked) => onConfigChange("background", checked ? "transparent" : "")} />
                    </span>
                </div>
                {showCount ? (
                    <div className="space-y-2">
                        <SettingTitle color={theme.node.muted}>{t("settingsPanels.image.count")}</SettingTitle>
                        <div className="grid grid-cols-4 gap-2">
                            {Array.from({ length: quickCount }, (_, index) => index + 1).map((value) => (
                                <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))}>
                                    {t("settingsPanels.image.images", { count: value })}
                                </OptionPill>
                            ))}
                            <CountInput value={count} max={maxCount} theme={theme} onChange={(value) => onConfigChange("count", String(value || 1))} />
                        </div>
                    </div>
                ) : null}
            </div>
        </ImageSettingsTheme>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: {
                    Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text },
                    Slider: { railBg: theme.node.stroke, railHoverBg: theme.node.stroke, trackBg: theme.node.activeStroke, handleColor: theme.node.text, handleActiveColor: theme.node.text },
                },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return (["auto", "high", "medium", "low"].includes(value) ? i18n.t(`settingsPanels.common.${value}`) : value);
}

export function imageSizeLabel(size: string) {
    const scale = inferMediaScale(size);
    const ratio = inferMediaRatio(size);
    if (ratio === "auto" || size === "auto") return i18n.t("settingsPanels.common.auto");
    if (scale === "auto") return ratio;
    return `${scale} · ${ratio}`;
}

function OptionPill({ selected, theme, onClick, children }: { selected: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="h-7 cursor-pointer rounded-full border px-2 text-xs transition hover:opacity-80"
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: selected ? theme.node.text : theme.node.muted }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function DimensionInput({ prefix, value, disabled, theme, alignToStep, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; alignToStep: boolean; onChange: (value: number | null) => void }) {
    const commit = (input: HTMLInputElement) => {
        const next = alignDimension(Math.max(1, Math.floor(Number(input.value) || value || 1024)), alignToStep);
        input.value = String(next);
        onChange(next);
    };

    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input
                type="number"
                min={1}
                disabled={disabled}
                className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                defaultValue={value || ""}
                key={`${prefix}-${value}`}
                onBlur={(event) => commit(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                }}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function CountInput({ value, max, theme, onChange }: { value: number; max: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="col-span-2 flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={1}
                max={max}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

export function AspectIcon({ width, height, color, size = 22, className }: { width: number; height: number; color: string; size?: number; className?: string }) {
    if (!width || !height) {
        return (
            <span className={className || "flex h-6 w-8 items-center justify-center"}>
                <span className="text-[10px] opacity-60">AUTO</span>
            </span>
        );
    }
    const maxBound = size;
    const minBound = 7;
    const ratio = width / height;
    let boxWidth = maxBound;
    let boxHeight = maxBound;

    if (ratio > 1) {
        boxWidth = maxBound;
        boxHeight = Math.max(minBound, Math.round(maxBound / ratio));
    } else if (ratio < 1) {
        boxHeight = maxBound;
        boxWidth = Math.max(minBound, Math.round(maxBound * ratio));
    }

    return (
        <span className={className || "flex h-6 w-8 items-center justify-center"}>
            <span
                className="rounded-[3px] border-2 transition-all"
                style={{
                    width: boxWidth,
                    height: boxHeight,
                    borderColor: color,
                    backgroundColor: "transparent",
                }}
            />
        </span>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return (
        <div className="text-xs font-medium" style={{ color }}>
            {children}
        </div>
    );
}

function alignDimension(value: number, enabled: boolean) {
    return enabled ? Math.ceil(value / DIMENSION_STEP) * DIMENSION_STEP : value;
}
