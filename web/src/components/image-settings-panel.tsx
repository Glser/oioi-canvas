import i18n from "@/i18n";
import { mediaRatioOptions, mediaScaleOptions } from "@/lib/media-size";

export function formatScaleLabel(value: string) {
    if (value === "720p") return "720P";
    if (value === "1080p") return "1080P";
    if (value === "2k") return "2K";
    if (value === "4k") return "4K";
    return value.toUpperCase();
}

export const imageQualityOptions = ["auto", "high", "medium", "low"].map((value) => ({
    value,
    get label() {
        return i18n.t(`settingsPanels.common.${value}`);
    },
}));
export const imageAspectOptions = mediaRatioOptions.map((item) => ({ value: item.value, label: item.value }));
export const imageScaleOptions = mediaScaleOptions.map((value) => ({ value, label: formatScaleLabel(value) }));

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
