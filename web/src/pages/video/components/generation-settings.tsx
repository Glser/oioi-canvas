import { useMemo, useRef, useState } from "react";
import { Button, Popover, Slider } from "antd";
import { Segmented, Select } from "@/components/themed-controls";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AspectIcon } from "@/components/image-settings-panel";
import { normalizeVideoModeValue, videoResolutionOptions, videoSecondsLabel, videoSizeLabel, videoModeLabel } from "@/components/video-settings-panel";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio, parseVideoResolution, videoRatioOptions, VIDEO_SECONDS_MIN, VIDEO_SECONDS_MAX } from "@/lib/media-size";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useConfigStore, useEffectiveConfig, modelOptionLabel, selectableModelsByCapability } from "@/stores/use-config-store";
import styles from "@/components/layout/workbench.module.css";

export function VideoGenerationSettings() {
    const { t } = useTranslation();
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = useThemeStore((state) => state.theme);
    const appearance = useMemo(() => getWorkbenchAppearance(theme === "dark"), [theme]);
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const ratio = inferVideoRatio(config.size || "auto");
    const resolution = parseVideoResolution(config.vquality);
    const summary = `${videoSizeLabel(config.size)} · ${resolution}p · ${videoSecondsLabel(config.videoSeconds)} · ${videoModeLabel(config.videoMode)}`;
    const close = () => { setOpen(false); trigger.current?.focus(); };
    const applySize = (nextResolution: string, nextRatio: string) => {
        updateConfig("vquality", nextResolution);
        if (nextRatio !== "auto") updateConfig("size", computeVideoSize(nextResolution, nextRatio));
    };
    return (
        <div className={styles.settings}>
            <Select aria-label={t("settingsPanels.model.select")} className="w-full" showSearch={false} value={config.videoModel || undefined} placeholder={t("settingsPanels.model.select")} options={selectableModelsByCapability(config, "video").map((value) => ({ value, label: modelOptionLabel(config, value) }))} onChange={(value) => updateConfig("videoModel", value)} notFoundContent={<Button block type="text" className="!justify-start" onClick={() => openConfigDialog(false)}>{t("imageWorkbench.configureModels")}</Button>} />
            <Popover trigger="click" placement="top" arrow={false} open={open} onOpenChange={setOpen} content={
                <div className={styles.settingsPanel} style={appearance.style} role="dialog" aria-label={t("settingsPanels.video.title")} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
                    <div className={styles.sectionHeader} style={{ marginBottom: 0 }}><span className="text-sm font-medium">{t("settingsPanels.video.title")}</span><Button type="text" size="small" icon={<X size={14} />} aria-label={t("common.close")} onClick={close} /></div>
                    <fieldset className={styles.field}>
                        <legend>{t("settingsPanels.video.ratio")}<span className={styles.fieldValue}>{videoSizeLabel(config.size)}</span></legend>
                        <div className={styles.ratios}>{videoRatioOptions.map((item) => <Button key={item.value} className={styles.ratio} aria-label={t("imageWorkbench.ratioLabel", { ratio: item.value })} aria-pressed={ratio === item.value} onClick={() => applySize(resolution, item.value)}><AspectIcon width={item.width} height={item.height} color="currentColor" size={18} />{item.value}</Button>)}</div>
                    </fieldset>
                    <fieldset className={styles.field}><legend>{t("settingsPanels.video.resolution")}</legend><Segmented block aria-label={t("settingsPanels.video.resolution")} options={videoResolutionOptions} value={resolution} onChange={(value) => applySize(value, ratio)} /></fieldset>
                    <fieldset className={styles.field}><legend>{t("settingsPanels.video.duration")}<span className={styles.fieldValue}>{videoSecondsLabel(config.videoSeconds)}</span></legend><Slider min={VIDEO_SECONDS_MIN} max={VIDEO_SECONDS_MAX} step={1} value={Number(clampVideoSeconds(config.videoSeconds || "6"))} onChange={(value) => updateConfig("videoSeconds", String(value))} /></fieldset>
                    <fieldset className={styles.field}><legend>{t("settingsPanels.video.mode")}</legend><Segmented block aria-label={t("settingsPanels.video.mode")} value={normalizeVideoModeValue(config.videoMode)} options={["frames", "reference"].map((value) => ({ value, label: t(`settingsPanels.video.modes.${value}`) }))} onChange={(value) => updateConfig("videoMode", value)} /></fieldset>
                </div>
            }>
                <Button ref={trigger} className={styles.settingsTrigger} icon={<SlidersHorizontal size={14} />} aria-label={`${t("settingsPanels.video.title")}：${summary}`} aria-expanded={open} aria-haspopup="dialog" onKeyDown={(event) => { if (event.key === "Escape") close(); }}><span className={styles.settingsSummary}>{summary}</span><ChevronDown size={14} className={styles.settingsChevron} /></Button>
            </Popover>
        </div>
    );
}
