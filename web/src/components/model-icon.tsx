import { Cpu } from "lucide-react";

import { modelOptionName } from "@/stores/use-config-store";

// Brand SVGs from LobeHub Icons; only monochrome marks invert in dark mode.
const MODEL_ICONS = [
    { pattern: /claude|anthropic/, file: "claude" },
    { pattern: /gemini|google|nano-banana/, file: "gemini" },
    { pattern: /gpt|openai/, file: "openai", monochrome: true },
    { pattern: /grok/, file: "grok", monochrome: true },
    { pattern: /deepseek/, file: "deepseek" },
    { pattern: /glm/, file: "glm" },
    { pattern: /minimax/, file: "minimax-color" },
    { pattern: /kimi|moonshot/, file: "kimi-color" },
    { pattern: /seedance/, file: "bytedance-color" },
];

export function ModelIcon({ model }: { model: string }) {
    const name = modelOptionName(model).toLowerCase();
    const icon = MODEL_ICONS.find((item) => item.pattern.test(name));
    return (
        <span aria-hidden="true" className="inline-flex size-4 shrink-0 items-center justify-center">
            {icon ? <img src={`/icons/${icon.file}.svg`} alt="" className={`block size-4 object-contain${icon.monochrome ? " dark:invert" : ""}`} /> : <Cpu className="size-4 opacity-70" />}
        </span>
    );
}
