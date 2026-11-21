import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Popover, Slider, Switch } from "antd";
import { Segmented, Select } from "@/components/themed-controls";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModelIcon } from "@/components/model-icon";
import { AspectIcon } from "@/components/image-settings-panel";
import { videoSecondsLabel, videoSizeLabel } from "@/components/video-settings-panel";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio, parseAspectRatio, videoRatioOptions, VIDEO_SECONDS_MIN, VIDEO_SECONDS_MAX } from "@/lib/media-size";
import { normalizeVideoMode, normalizeVideoOutputSelection, resolutionLabel, resolutionToken, durationStep, videoDurations, videoFeatureModes, videoRatios, videoResolutions } from "@/lib/model-features";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { resolveModelFeatures, boolConfig, useConfigStore, useEffectiveConfig, modelOptionLabel, selectableModelsByCapability } from "@/stores/use-config-store";
import styles from "@/components/layout/workbench.module.css";

/** token 分辨率（`720p` / `720p_upscaled`）转纯数字，供 computeVideoSize 使用。 */
function parseTokenResolution(token: string) {
    return String(token || "").replace(/p.*$/i, "") || "720";
}

export function VideoGenerationSettings() {
    const { t } = useTranslation();
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useThemeStore((state) => state.theme);
    const appearance = useMemo(() => getWorkbenchAppearance(theme === "dark"), [theme]);
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const features = resolveModelFeatures(config, config.videoModel)?.video;
    // 未登录/未获取到 features 数据时默认展示开关，拿到数据后按 supported 声明显隐
    const featuresLoaded = Boolean(features);
    const generateAudioSupported = featuresLoaded ? features!.generate_audio?.supported === true : true;
    const generateAudioDefault = features?.generate_audio?.default ?? true;
    const watermarkSupported = featuresLoaded ? features!.watermark?.supported === true : true;
    const watermarkDefault = features?.watermark?.default ?? false;
    const mode = normalizeVideoMode(features, config.videoMode);
    const modes = videoFeatureModes(features);
    const currentResolution = resolutionToken(config.vquality);
    const currentRatio = inferVideoRatio(config.size || "auto") === "auto" ? features?.output?.defaults?.aspect_ratio || "16:9" : inferVideoRatio(config.size || "auto");
    const resolutions = videoResolutions(features);
    const ratios = videoRatios(features, currentResolution);
    const durations = videoDurations(features, currentResolution);
    const selection = normalizeVideoOutputSelection(
        features,
        { resolution: currentResolution, ratio: currentRatio, durationSeconds: clampVideoSeconds(config.videoSeconds || "6") },
        {
            resolution: "720",
            ratio: currentRatio || "16:9",
            durationSeconds: "6",
            size: (resolution, ratio) => computeVideoSize(parseTokenResolution(resolution), ratio),
        },
    );
    const ratioItems = (ratios.length ? ratios : videoRatioOptions.map((item) => item.value)).map((value) => {
        const preset = videoRatioOptions.find((item) => item.value === value);
        const parsed = parseAspectRatio(value);
        return { value, width: preset?.width || parsed?.width || 16, height: preset?.height || parsed?.height || 9 };
    });
    const summary = `${videoSizeLabel(selection.size)} · ${resolutionLabel(selection.resolution)} · ${videoSecondsLabel(selection.durationSeconds)} · ${t(`settingsPanels.video.modes.${mode}`)}`;
    const close = () => {
        setOpen(false);
        trigger.current?.focus();
    };
    const applySize = (nextResolution: string, nextRatio: string) => {
        const next = normalizeVideoOutputSelection(
            features,
            { resolution: nextResolution, ratio: nextRatio, durationSeconds: selection.durationSeconds },
            {
                resolution: selection.resolution,
                ratio: selection.ratio,
                durationSeconds: selection.durationSeconds,
                size: (resolution, ratio) => computeVideoSize(parseTokenResolution(resolution), ratio),
            },
        );
        updateConfig("vquality", next.resolution);
        updateConfig("size", next.size);
        updateConfig("videoSeconds", next.durationSeconds);
    };

    useEffect(() => {
        if (selection.resolution !== currentResolution) updateConfig("vquality", selection.resolution);
        if (selection.ratio !== currentRatio) updateConfig("size", selection.size);
        if (selection.durationSeconds !== clampVideoSeconds(config.videoSeconds || "6")) updateConfig("videoSeconds", selection.durationSeconds);
        if (mode !== config.videoMode) updateConfig("videoMode", mode);
    }, [config.videoGenerateAudio, config.videoMode, config.videoSeconds, config.videoWatermark, currentRatio, currentResolution, features, mode, selection.durationSeconds, selection.ratio, selection.resolution, selection.size, updateConfig]);

    return (
        <div className={styles.settings}>
            <Select
                aria-label={t("settingsPanels.model.select")}
                className="w-full"
                showSearch={false}
                value={config.videoModel || undefined}
                placeholder={t("settingsPanels.model.select")}
                options={selectableModelsByCapability(config, "video").map((value) => ({ value, label: <span className="flex min-w-0 items-center gap-2"><ModelIcon model={value} /><span className="truncate">{modelOptionLabel(config, value)}</span></span> }))}
                onChange={(value) => updateConfig("videoModel", value)}
                notFoundContent={
                    <Button block type="text" className="!justify-start" onClick={() => openConfigDialog(false)}>
                        {t("imageWorkbench.configureModels")}
                    </Button>
                }
            />
            <Popover
                trigger="click"
                placement="top"
                arrow={false}
                open={open}
                onOpenChange={setOpen}
                content={
                    <div
                        className={styles.settingsPanel}
                        style={appearance.style}
                        role="dialog"
                        aria-label={t("settingsPanels.video.title")}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                event.stopPropagation();
                                close();
                            }
                        }}
                    >
                        <fieldset className={styles.field}>
                            <legend>
                                {t("settingsPanels.video.ratio")}
                                <span className={styles.fieldValue}>{selection.ratio}</span>
                            </legend>
                            <div className={styles.ratios}>
                                {ratioItems.map((item) => (
                                    <Button
                                        key={item.value}
                                        className={styles.ratio}
                                        aria-label={t("imageWorkbench.ratioLabel", { ratio: item.value })}
                                        aria-pressed={selection.ratio === item.value}
                                        onClick={() => applySize(selection.resolution, item.value)}
                                    >
                                        <AspectIcon width={item.width} height={item.height} color="currentColor" size={18} />
                                        {item.value}
                                    </Button>
                                ))}
                            </div>
                        </fieldset>
                        <fieldset className={styles.field}>
                            <legend>{t("settingsPanels.video.resolution")}</legend>
                            <Segmented block aria-label={t("settingsPanels.video.resolution")} options={resolutions.map((value) => ({ value, label: resolutionLabel(value) }))} value={selection.resolution} onChange={(value) => applySize(value, selection.ratio)} />
                        </fieldset>
                        <fieldset className={styles.field}>
                            <legend>
                                {t("settingsPanels.video.duration")}
                                <span className={styles.fieldValue}>{videoSecondsLabel(selection.durationSeconds)}</span>
                            </legend>
                            {(() => {
                                const step = durationStep(durations);
                                if (durations.length > 1 && step > 0) return <Slider min={Math.min(...durations)} max={Math.max(...durations)} step={step} value={Number(selection.durationSeconds)} onChange={(value) => updateConfig("videoSeconds", String(value))} />;
                                if (durations.length > 1) {
                                    return (
                                        <div className={styles.durationOptions}>
                                            {durations.map((value) => (
                                                <Button
                                                    key={value}
                                                    className={styles.durationOption}
                                                    aria-pressed={selection.durationSeconds === String(value)}
                                                    onClick={() => updateConfig("videoSeconds", String(value))}
                                                >
                                                    {value}s
                                                </Button>
                                            ))}
                                        </div>
                                    );
                                }
                                if (durations.length === 1) return <span className={styles.fieldValue}>{videoSecondsLabel(String(durations[0]))}</span>;
                                return <Slider min={VIDEO_SECONDS_MIN} max={VIDEO_SECONDS_MAX} step={1} value={Number(selection.durationSeconds)} onChange={(value) => updateConfig("videoSeconds", String(value))} />;
                            })()}
                        </fieldset>
                        {modes.length > 1 && (
                            <fieldset className={styles.field}>
                                <legend>{t("settingsPanels.video.mode")}</legend>
                                <Segmented
                                    block
                                    aria-label={t("settingsPanels.video.mode")}
                                    value={mode}
                                    options={modes.map((value) => ({ value, label: t(`settingsPanels.video.modes.${value}`) }))}
                                    onChange={(value) => updateConfig("videoMode", value)}
                                />
                            </fieldset>
                        )}
                        {(generateAudioSupported || watermarkSupported) && (
                            <fieldset className={styles.field}>
                                <legend>{t("settingsPanels.video.output")}</legend>
                                {generateAudioSupported && (
                                    <label className={styles.switchRow}>
                                        <span>{t("settingsPanels.video.generateAudio")}</span>
                                        <Switch size="small" checked={boolConfig(config.videoGenerateAudio, generateAudioDefault)} onChange={(checked) => updateConfig("videoGenerateAudio", String(checked))} />
                                    </label>
                                )}
                                {watermarkSupported && (
                                    <label className={styles.switchRow}>
                                        <span>{t("settingsPanels.video.watermark")}</span>
                                        <Switch size="small" checked={boolConfig(config.videoWatermark, watermarkDefault)} onChange={(checked) => updateConfig("videoWatermark", String(checked))} />
                                    </label>
                                )}
                            </fieldset>
                        )}
                    </div>
                }
            >
                <Button
                    ref={trigger}
                    className={styles.settingsTrigger}
                    icon={<SlidersHorizontal size={14} />}
                    aria-label={`${t("settingsPanels.video.title")}：${summary}`}
                    aria-expanded={open}
                    aria-haspopup="dialog"
                    onKeyDown={(event) => {
                        if (event.key === "Escape") close();
                    }}
                >
                    <span className={styles.settingsSummary}>{summary}</span>
                    <ChevronDown size={14} className={styles.settingsChevron} />
                </Button>
            </Popover>
        </div>
    );
}
