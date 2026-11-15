import { theme as antdTheme, Tooltip } from "antd";
import { ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { ModelIcon } from "@/components/model-icon";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    hideChevron?: boolean;
    side?: "top" | "bottom";
    contentClassName?: string;
};

/** 同家族多上游模型收拢：仅当最后一段是短上游代号（1-3 个字母可选带 1-2 位数字，如 oa/cl2/oao/qt/a）才视为变体后缀；
 *  版本号（2.5 含点）、fast、t2v、720p 等正常词段不剥离，避免 seedance-2.5 与 seedance-2.0 错误合并。 */
function modelFamily(name: string) {
    const index = name.lastIndexOf("-");
    if (index <= 0) return name;
    const suffix = name.slice(index + 1);
    // t2v/i2v 等文生/图生视频功能段保留在家族名里
    if (/^t2v$|^i2v$/i.test(suffix)) return name;
    return /^[a-z]{1,3}\d{0,2}$/i.test(suffix) ? name.slice(0, index) : name;
}

type ModelGroup = { family: string; members: string[] };

function groupVideoModels(models: string[]): ModelGroup[] {
    const families = new Map<string, string[]>();
    for (const model of models) {
        const name = modelOptionName(model);
        const family = modelFamily(name);
        const list = families.get(family);
        if (list) list.push(model);
        else families.set(family, [model]);
    }
    return [...families.entries()].map(([family, members]) => ({ family, members }));
}

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig, hideChevron, side = "bottom", contentClassName }: ModelPickerProps) {
    const { t } = useTranslation();
    const { token } = antdTheme.useToken();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
    const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");
    // 视频模型同家族多上游收拢展示：单成员家族保持平铺，多成员家族折叠为家族行 + 展开子列表。
    const groups = useMemo(() => (capability === "video" ? groupVideoModels(options) : null), [capability, options]);
    const grouped = groups?.some((group) => group.members.length > 1) ?? false;
    // 打开时自动展开当前选中模型所在家族。
    useEffect(() => {
        if (open && capability === "video" && value) setExpandedFamily(modelFamily(modelOptionName(value)));
    }, [open]);

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length) onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={onChange}
        >
            <Tooltip title={current ? modelOptionLabel(config, current) : pickerPlaceholder} open={open ? false : undefined}>
                <SelectTrigger
                    hideChevron={hideChevron}
                    className={cn(
                        "canvas-composer-model-picker flex h-8 w-fit max-w-full items-center gap-2 rounded-full border border-input bg-transparent px-3 py-0 text-sm font-normal shadow-sm transition-colors",
                        fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                        "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                        className,
                    )}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={current ? modelOptionLabel(config, current) : pickerPlaceholder}
                >
                    <ModelIcon model={current} />
                    <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left leading-normal">{current ? modelOptionLabel(config, current) : pickerPlaceholder}</span>
                </SelectTrigger>
            </Tooltip>
            <SelectContent
                data-canvas-no-zoom
                style={{ "--popover": token.colorBgElevated, "--popover-foreground": token.colorText, "--foreground": token.colorText, "--border": token.colorBorder, "--accent": token.controlItemBgActive, "--accent-foreground": token.colorText, "--muted-foreground": token.colorTextSecondary } as CSSProperties}
                className={cn("z-[1200] w-64 max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl", contentClassName)}
                position="popper"
                align="start"
                side={side}
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {grouped && groups ? (
                    <div className="p-1" onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
                        {groups.map((group) =>
                            group.members.length > 1 ? (
                                <div key={group.family} className="mb-0.5">
                                    <button
                                        type="button"
                                        className="group/family flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden transition-colors hover:bg-accent"
                                        onClick={() => setExpandedFamily((currentFamily) => (currentFamily === group.family ? null : group.family))}
                                        aria-expanded={expandedFamily === group.family}
                                    >
                                        <ModelIcon model={group.members[0]} />
                                        <span className="min-w-0 flex-1 truncate text-left">{group.family}</span>
                                        <span className="shrink-0 rounded-full bg-border px-1.5 text-[10px] leading-4 text-muted-foreground">{group.members.length}</span>
                                        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expandedFamily === group.family && "rotate-90")} />
                                    </button>
                                    {expandedFamily === group.family ? (
                                        <div className="mt-0.5">
                                            {group.members.map((model) => (
                                                <SelectItem key={model} value={model} textValue={modelOptionLabel(config, model)} className="pl-3">
                                                    <ModelLabel config={config} model={model} />
                                                </SelectItem>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <SelectItem key={group.members[0]} value={group.members[0]} textValue={modelOptionLabel(config, group.members[0])}>
                                    <ModelLabel config={config} model={group.members[0]} />
                                </SelectItem>
                            ),
                        )}
                    </div>
                ) : options.length ? (
                    options.map((model) => (
                        <SelectItem key={model} value={model} textValue={modelOptionLabel(config, model)}>
                            <ModelLabel config={config} model={model} />
                        </SelectItem>
                    ))
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {emptyModelLabel(config, capability)}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    if (config.channelMode === "remote") return config.newApiUserId ? i18n.t("settingsPanels.model.remoteNoModel") : i18n.t("settingsPanels.model.remoteSignIn");
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

