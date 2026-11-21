import { useState } from "react";
import { Check } from "lucide-react";

import { ModelIcon } from "@/components/model-icon";
import { cn } from "@/lib/utils";
import { modelPriceSummary, resolveModelPricing } from "@/lib/model-pricing";
import { modelOptionLabel, modelOptionName, type AiConfig } from "@/stores/use-config-store";

/** 视频模型家族收拢：命名规律「名称-版本-具体型号」，三段及以上取前两段为家族（minimax-h3-2k-channel-l、minimax-h3-max、minimax-h3 都归入 minimax-h3）；两段以内家族即自身。 */
export function modelFamilyOf(name: string) {
    const segments = name.split("-");
    return segments.length > 2 ? `${segments[0]}-${segments[1]}` : name;
}

export type ModelFamilyGroup = { family: string; members: string[] };

/** 按家族收拢模型选项；members 保留原始选项值（含渠道编码）。 */
export function groupModelsByFamily(options: string[]): ModelFamilyGroup[] {
    const families = new Map<string, string[]>();
    for (const option of options) {
        const family = modelFamilyOf(modelOptionName(option));
        const list = families.get(family);
        if (list) list.push(option);
        else families.set(family, [option]);
    }
    return [...families.entries()].map(([family, members]) => ({ family, members }));
}

/** 型号明细行的价格摘要：视频模型取各档每秒价（480p: ¥0.29/s；720p: ¥0.44/s），按次/按 token 模型退回标签。 */
function memberPriceDetail(config: AiConfig, model: string) {
    const summary = modelPriceSummary(resolveModelPricing(config, model));
    return summary?.detail && summary.detail !== summary.label ? summary.detail.split("\n")[0] : "";
}

/** 左侧家族列表 + 右侧型号明细的两栏选择面板（视频模型收拢展示，画布与视频工作台共用）。
 *  单成员家族在左侧直接点击选择；多成员家族切换右侧明细，明细行点击选择具体型号。 */
export function ModelFamilyPanel({ config, groups, value, onSelect, className }: {
    config: AiConfig;
    groups: ModelFamilyGroup[];
    value: string;
    onSelect: (model: string) => void;
    className?: string;
}) {
    const [activeFamily, setActiveFamily] = useState(() => {
        const currentFamily = modelFamilyOf(modelOptionName(value));
        if (groups.some((group) => group.family === currentFamily && group.members.length > 1)) return currentFamily;
        return groups.find((group) => group.members.length > 1)?.family ?? "";
    });
    const active = groups.find((group) => group.family === activeFamily && group.members.length > 1);
    return (
        <div className={cn("flex min-h-40 w-full max-w-full overflow-hidden rounded-lg", className)}>
            <div className="max-h-72 w-44 shrink-0 overflow-y-auto border-r border-border/60 p-1">
                {groups.map((group) => {
                    const single = group.members.length === 1;
                    const isActive = active?.family === group.family;
                    return (
                        <button
                            key={group.family}
                            type="button"
                            className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden transition-colors", isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
                            onClick={() => (single ? onSelect(group.members[0]) : setActiveFamily(group.family))}
                        >
                            <ModelIcon model={group.members[0]} />
                            <span className="min-w-0 flex-1 truncate">{single ? modelOptionName(group.members[0]) : group.family}</span>
                            {!single ? <span className="shrink-0 rounded-full bg-border px-1.5 text-[10px] leading-4 text-muted-foreground">{group.members.length}</span> : null}
                        </button>
                    );
                })}
            </div>
            {active ? (
                <div className="max-h-72 min-w-40 flex-1 overflow-y-auto p-1">
                    <div className="px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground">{active.family} · {active.members.length}</div>
                    {active.members.map((model) => {
                        const selected = modelOptionName(model) === modelOptionName(value);
                        const price = memberPriceDetail(config, model);
                        return (
                            <button
                                key={model}
                                type="button"
                                aria-pressed={selected}
                                className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-hidden transition-colors", selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
                                onClick={() => onSelect(model)}
                            >
                                <ModelIcon model={model} />
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <span className="truncate">{modelOptionLabel(config, model)}</span>
                                    {price ? <span className="truncate font-mono text-[10px] leading-3 text-muted-foreground">{price}</span> : null}
                                </span>
                                {selected ? <Check className="size-3.5 shrink-0" /> : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}
