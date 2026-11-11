import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Popover, Segmented, Select, Tooltip } from "antd";
import { ChevronDown, Info, SlidersHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AspectIcon, imageCountOptions, imageQualityOptions, imageResolutionOptions, normalizeImageQuality, normalizeImageResolution, resolveImageSize } from "@/components/image-settings-panel";
import { getGenerationCount } from "@/lib/canvas/canvas-generation-helpers";
import { imageModelSettings } from "@/lib/image-model-settings";
import { inferMediaRatio, mediaRatioOptions, parseAspectRatio } from "@/lib/media-size";
import { modelOptionLabel, selectableModelsByCapability, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import styles from "@/components/layout/workbench.module.css";

export function GenerationSettings() {
    const { t } = useTranslation();
    const config = useEffectiveConfig();
    const theme = useThemeStore((state) => state.theme);
    const appearance = useMemo(() => getWorkbenchAppearance(theme === "dark"), [theme]);
    const [open, setOpen] = useState(false);
    const [modelOpen, setModelOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const model = config.imageModel || config.model;
    const supported = imageModelSettings(config, model);
    const models = selectableModelsByCapability(config, "image");
    const ratio = inferMediaRatio(config.size || "1:1");
    const resolution = normalizeImageResolution(config.size);
    const preset = mediaRatioOptions.some((option) => option.value === ratio);
    const [customRatio, setCustomRatio] = useState(preset ? "" : ratio);
    useEffect(() => setCustomRatio(preset ? "" : ratio), [preset, ratio]);
    const invalidRatio = Boolean(customRatio && !/^\d+:\d+$/.test(customRatio)) || Boolean(customRatio && !parseAspectRatio(customRatio));
    const applyCustomRatio = () => {
        if (customRatio && !invalidRatio) updateConfig("size", resolveImageSize(resolution, customRatio));
        else setCustomRatio(preset ? "" : ratio);
    };

    const count = getGenerationCount(config.count);
    const summary = [ratio, supported.resolution && imageResolutionOptions.find((item) => item.value === resolution)?.label, supported.quality && t(`settingsPanels.common.${normalizeImageQuality(config.quality)}`), t("settingsPanels.image.images", { count })].filter(Boolean).join(" · ");
    const close = () => { setOpen(false); triggerRef.current?.focus(); };

    return (
        <div className={styles.settings}>
            <div className={styles.field}>
                <label htmlFor="image-model" className="sr-only">{t("settingsPanels.model.select")}</label>
                <Select
                    id="image-model"
                    open={modelOpen}
                    onOpenChange={setModelOpen}
                    className="w-full"
                    showSearch={{ optionFilterProp: "label" }}
                    value={model || undefined}
                    placeholder={t("settingsPanels.model.select")}
                    options={Array.from(new Set(models)).map((value) => ({ value, label: modelOptionLabel(config, value) }))}
                    onChange={(value) => updateConfig("imageModel", value)}
                    notFoundContent={<Button type="text" block className="!justify-start" onClick={() => { setModelOpen(false); openConfigDialog(false); }}>{config.newApiUserId ? "暂无可选生图模型，查看账户连接" : t("imageWorkbench.configureModels")}</Button>}
                />
            </div>
            <Popover
                open={open}
                onOpenChange={setOpen}
                trigger="click"
                placement="top"
                arrow={false}
                content={
                    <div className={styles.settingsPanel} style={appearance.style} role="dialog" aria-label={t("settingsPanels.image.title")} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
                        <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                            <span className="text-sm font-medium">{t("settingsPanels.image.title")}</span>
                            <Button type="text" size="small" icon={<X size={14} />} aria-label={t("common.close")} onClick={close} />
                        </div>
                        <fieldset className={styles.field}>
                            <legend>{t("settingsPanels.image.aspectRatio")}<span className={styles.fieldValue}>{ratio}</span></legend>
                            <div className={styles.ratios}>
                                {mediaRatioOptions.map((option) => (
                                    <Button
                                        key={option.value}
                                        className={styles.ratio}
                                        aria-label={t("imageWorkbench.ratioLabel", { ratio: option.value })}
                                        aria-pressed={ratio === option.value}
                                        onClick={() => updateConfig("size", resolveImageSize(resolution, option.value))}
                                    >
                                        <AspectIcon width={option.width} height={option.height} color="currentColor" size={18} />
                                        <span>{option.value}</span>
                                    </Button>
                                ))}
                            </div>
                            <Input
                                aria-label={t("settingsPanels.image.customRatio")}
                                prefix={<span className={styles.muted}>{t("settingsPanels.image.customRatio")}</span>}
                                placeholder={t("settingsPanels.image.customRatioPlaceholder")}
                                value={customRatio}
                                status={invalidRatio ? "error" : undefined}
                                onChange={(event) => setCustomRatio(event.target.value)}
                                onBlur={applyCustomRatio}
                                onPressEnter={applyCustomRatio}
                            />
                        </fieldset>
                        {supported.resolution && <fieldset className={styles.field}>
                            <legend>
                                {t("settingsPanels.image.resolution")}
                                <Tooltip title={t("imageWorkbench.modelSupportHint")}>
                                    <Button type="text" size="small" icon={<Info size={14} />} aria-label={t("imageWorkbench.modelSupportHint")} />
                                </Tooltip>
                            </legend>
                            <Segmented block aria-label={t("settingsPanels.image.resolution")} options={imageResolutionOptions} value={resolution} onChange={(value) => updateConfig("size", resolveImageSize(value, ratio))} />
                        </fieldset>}
                        {supported.quality && <fieldset className={styles.field}>
                            <legend>{t("settingsPanels.image.quality")}</legend>
                            <Segmented block aria-label={t("settingsPanels.image.quality")} options={imageQualityOptions} value={normalizeImageQuality(config.quality)} onChange={(value) => updateConfig("quality", value)} />
                        </fieldset>}
                        <fieldset className={styles.field}>
                            <legend>{t("imageWorkbench.countLabel")}</legend>
                            <Segmented block aria-label={t("imageWorkbench.countLabel")} options={imageCountOptions.map((value) => ({ value, label: t("settingsPanels.image.images", { count: Number(value) }) }))} value={String(getGenerationCount(config.count))} onChange={(value) => updateConfig("count", value)} />
                        </fieldset>
                    </div>
                }
            >
                <Button ref={triggerRef} className={styles.settingsTrigger} icon={<SlidersHorizontal size={14} />} aria-label={`${t("settingsPanels.image.title")}：${summary}`} aria-expanded={open} aria-haspopup="dialog" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
                    <span className={styles.settingsSummary}>{summary}</span><ChevronDown size={14} className={styles.settingsChevron} />
                </Button>
            </Popover>
        </div>
    );
}
