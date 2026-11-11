import i18n from "@/i18n";
import { imageSizePresets, inferMediaScale, parseAspectRatio, parsePixelSize, mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";

export function formatScaleLabel(value: string) {
    if (value === "720p") return "720P";
    if (value === "1080p") return "1080P";
    if (value === "1k") return "1K";
    if (value === "2k") return "2K";
    if (value === "4k") return "4K";
    return value.toUpperCase();
}

export const imageQualityOptions = ["auto", "low", "medium", "high"].map((value) => ({
    value,
    get label() {
        return i18n.t(`settingsPanels.common.${value}`);
    },
}));
export const imageAspectOptions = mediaRatioOptions.map((item) => ({ value: item.value, label: item.value }));
export const imageScaleOptions = mediaScaleOptions.map((value) => ({ value, label: formatScaleLabel(value) }));
export const imageResolutionOptions = ["auto", "1k", "2k", "4k"].map((value) => ({
    value,
    get label() {
        return value === "auto" ? i18n.t("settingsPanels.common.auto") : formatScaleLabel(value);
    },
}));
export const imageCountOptions = ["1", "2", "3", "4"];

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

export function normalizeImageQuality(value: string | undefined) {
    const quality = (value || "auto").trim().toLowerCase();
    return imageQualityOptions.some((item) => item.value === quality) ? quality : "auto";
}

export function normalizeImageResolution(size: string | undefined) {
    const value = (size || "").trim();
    if (!value || value.toLowerCase() === "auto" || parseAspectRatio(value) || !parsePixelSize(value)) return "auto";
    const scale = inferMediaScale(value);
    return imageResolutionOptions.some((item) => item.value === scale) ? scale : "auto";
}

export function resolveImageSize(resolution: string, ratio: string) {
    if (!ratio || resolution === "auto") return ratio || "1:1";
    return imageSizePresets[resolution]?.[ratio] || ratio;
}

