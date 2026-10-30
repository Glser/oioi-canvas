import i18n from "@/i18n";
import type { ReasoningEffort } from "@/stores/use-config-store";

const reasoningEffortOptions: ReasoningEffort[] = ["auto", "low", "medium", "high", "xhigh", "max", "ultra"];

export function reasoningEffortLabel(value: ReasoningEffort) {
    return reasoningEffortOptions.includes(value) ? i18n.t(`settingsPanels.common.${value}`) : value;
}
