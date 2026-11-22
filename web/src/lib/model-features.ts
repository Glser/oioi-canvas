import i18n from "@/i18n";

export type VideoInputMode = "text" | "frames" | "reference";
export type VideoMediaType = "image" | "video" | "audio";

export type VideoFeatureMediaLimit = { min?: number; max?: number; roles?: string[] };
export type VideoFeatureInput = {
    modes?: VideoInputMode[];
    frames?: { image?: VideoFeatureMediaLimit };
    reference?: Partial<Record<VideoMediaType, VideoFeatureMediaLimit>>;
};
export type VideoFeatureOutput = {
    resolutions?: string[];
    aspect_ratios?: string[];
    duration_seconds?: number[];
    defaults?: { resolution?: string; aspect_ratio?: string; duration_seconds?: number };
    resolution_constraints?: Record<string, { aspect_ratios?: string[]; duration_seconds?: number[] }>;
    size_overrides?: Record<string, string>;
};
export type VideoFeatureSwitch = { supported?: boolean; default?: boolean };
export type VideoFeatures = {
    version?: number;
    input?: VideoFeatureInput;
    output?: VideoFeatureOutput;
    generate_audio?: VideoFeatureSwitch;
    watermark?: VideoFeatureSwitch;
};
export type ModelFeatures = { version?: number; video?: VideoFeatures };

export type VideoMediaConstraint = { min: number; max: number };

const defaultModes: VideoInputMode[] = ["frames", "reference"];
/** 未在 features 中声明即不限制。 */
export const UNLIMITED_MEDIA = Number.POSITIVE_INFINITY;

/** 规范分辨率取值：保留 `720p_upscaled` 这类带后缀的原始 token，纯数字补 `p`。 */
export function resolutionToken(value: string | undefined): string {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "720p";
    if (raw === "low") return "480p";
    if (raw === "auto" || raw === "high" || raw === "medium") return "720p";
    if (/^\d+$/.test(raw)) return `${raw}p`;
    return raw;
}

export function resolutionNumber(token: string | undefined): number {
    const match = String(token || "").match(/(\d+)/);
    return match && Number(match[1]) > 0 ? Number(match[1]) : 720;
}

/** 展示标签：`720p_upscaled` 显示为「720p-超分」，其余原样。 */
export function resolutionLabel(token: string | undefined): string {
    const value = resolutionToken(token);
    if (/_upscaled$/i.test(value)) return i18n.t("settingsPanels.video.resolutionUpscaled", { resolution: `${resolutionNumber(value)}p` });
    return value;
}

export function videoFeatureModes(video?: VideoFeatures): VideoInputMode[] {
    const modes = video?.input?.modes?.filter((mode) => mode === "text" || mode === "frames" || mode === "reference");
    return modes?.length ? modes : defaultModes;
}

export function normalizeVideoMode(video: VideoFeatures | undefined, value: string | undefined, imageCount = 0): VideoInputMode {
    const modes = videoFeatureModes(video);
    if (value === "text" && modes.includes("text")) return "text";
    if (value === "reference" && modes.includes("reference")) return "reference";
    if (modes.includes("frames")) {
        if (imageCount > videoMediaConstraint(video, "frames", "image").max && modes.includes("reference")) return "reference";
        return "frames";
    }
    return modes[0] || "reference";
}

export function videoMediaConstraint(video: VideoFeatures | undefined, mode: VideoInputMode, media: VideoMediaType): VideoMediaConstraint {
    if (mode === "text") return { min: 0, max: 0 };
    if (mode === "frames" && media !== "image") return { min: 0, max: 0 };
    if (mode === "frames") {
        const limit = video?.input?.frames?.image;
        return { min: limit?.min ?? 1, max: limit?.max ?? 2 };
    }
    const reference = video?.input?.reference;
    if (!video || !reference) return { min: 0, max: UNLIMITED_MEDIA };
    const limit = reference[media];
    if (!limit) return { min: 0, max: 0 };
    return { min: limit.min ?? 0, max: limit.max ?? UNLIMITED_MEDIA };
}

/** 上传/展示用的参考上限：取各输入模式的最大值（如首尾帧 2 张、全能参考 9 张时允许 9 张），仅显式文生视频模式归零。 */
export function videoUploadLimits(video: VideoFeatures | undefined, activeMode?: VideoInputMode): Record<VideoMediaType, number> {
    if (activeMode === "text") return { image: 0, video: 0, audio: 0 };
    const modes = videoFeatureModes(video);
    const framesImage = modes.includes("frames") ? videoMediaConstraint(video, "frames", "image").max : 0;
    const referenceImage = modes.includes("reference") ? videoMediaConstraint(video, "reference", "image").max : 0;
    return {
        image: Math.max(framesImage, referenceImage),
        video: modes.includes("reference") ? videoMediaConstraint(video, "reference", "video").max : 0,
        audio: modes.includes("reference") ? videoMediaConstraint(video, "reference", "audio").max : 0,
    };
}

const MEDIA_TYPE_LABEL_KEYS: Record<VideoMediaType, string> = { image: "videoWorkbench.references", video: "videoWorkbench.videoReferences", audio: "videoWorkbench.audioReferences" };

/** 画布发起视频生成前检查参考数量是否超出模型约束，超出时返回提示文案。 */
export function checkVideoReferenceOverflow(video: VideoFeatures, imageCount: number, videoCount: number, audioCount: number) {
    const mode = normalizeVideoMode(video, undefined, imageCount);
    const effectiveMode = mode === "frames" && (videoCount > 0 || audioCount > 0) && videoFeatureModes(video).includes("reference") ? "reference" : mode;
    const media: Array<[VideoMediaType, number]> = [
        ["image", imageCount],
        ["video", videoCount],
        ["audio", audioCount],
    ];
    for (const [type, count] of media) {
        const constraint = videoMediaConstraint(video, effectiveMode, type);
        if (count > constraint.max) return i18n.t("settingsPanels.video.referenceLimit", { count: constraint.max, type: i18n.t(MEDIA_TYPE_LABEL_KEYS[type]) });
    }
    return "";
}

export function videoResolutions(video?: VideoFeatures, fallback: string[] = ["480p", "720p", "1080p"]): string[] {
    const values = video?.output?.resolutions?.map((value) => resolutionToken(value));
    return values?.length ? Array.from(new Set(values)) : fallback;
}

export function videoRatios(video: VideoFeatures | undefined, resolution: string): string[] {
    const global = video?.output?.aspect_ratios;
    const constrained = video?.output?.resolution_constraints?.[resolutionToken(resolution)]?.aspect_ratios;
    const values = constrained?.length ? constrained : global;
    return values?.length ? values : [];
}

export function videoDurations(video: VideoFeatures | undefined, resolution: string): number[] {
    const global = video?.output?.duration_seconds;
    const constrained = video?.output?.resolution_constraints?.[resolutionToken(resolution)]?.duration_seconds;
    const values = constrained?.length ? constrained : global;
    return values?.length ? values.filter((value) => Number.isFinite(value)) : [];
}

/** 连续等差时长（如 5..30 逐秒）渲染为滑杆；稀疏枚举（如 5/10/15）保留按钮。 */
export function durationStep(values: number[]): number {
    if (values.length < 3) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const step = sorted[1] - sorted[0];
    if (step <= 0) return 0;
    return sorted.every((value, index) => index === 0 || value - sorted[index - 1] === step) ? step : 0;
}

export function normalizeVideoOutputSelection(
    video: VideoFeatures | undefined,
    current: { resolution: string; ratio: string; durationSeconds: string },
    fallback: { resolution: string; ratio: string; durationSeconds: string; size?: (resolution: string, ratio: string) => string },
): { resolution: string; ratio: string; durationSeconds: string; size: string } {
    // 未声明分辨率的模型用标准档位 + 传入兜底档，不把 current 并入列表——否则换模型后残留的非常规格（如 2k）会被永久保留，按钮列表里也点不掉。
    const resolutions = videoResolutions(video, Array.from(new Set([resolutionToken(fallback.resolution), "480p", "720p", "1080p"])));
    const currentResolution = resolutionToken(current.resolution);
    const defaultResolution = video?.output?.defaults?.resolution ? resolutionToken(video.output.defaults.resolution) : "";
    const resolution = resolutions.includes(currentResolution) ? currentResolution : defaultResolution && resolutions.includes(defaultResolution) ? defaultResolution : resolutions[0];
    const ratios = videoRatios(video, resolution);
    const ratio = ratios.length ? (ratios.includes(current.ratio) ? current.ratio : video?.output?.defaults?.aspect_ratio || ratios[0]) : current.ratio || fallback.ratio;
    const durations = videoDurations(video, resolution);
    const currentDuration = Number(current.durationSeconds);
    const fallbackDuration = Number(video?.output?.defaults?.duration_seconds ?? fallback.durationSeconds);
    const duration = durations.length
        ? durations.includes(currentDuration)
            ? currentDuration
            : durations.includes(fallbackDuration)
              ? fallbackDuration
              : durations[0]
        : Math.floor(Number.isFinite(currentDuration) && currentDuration > 0 ? currentDuration : fallbackDuration);
    const computedSize = video?.output?.size_overrides?.[`${resolution}|${ratio}`] || fallback.size?.(resolution, ratio) || `${resolution}p`;
    return { resolution, ratio, durationSeconds: String(duration), size: computedSize };
}
