import { modelApiFormatOf, modelOptionName, type AiConfig } from "@/stores/use-config-store";

export function supportsGeminiImageSize(model: string) {
    const name = modelOptionName(model).toLowerCase();
    // 网关别名由用户确认：nano-banana-2 → gemini-3.1-flash-image。
    return name === "nano-banana-2" || /^gemini-3(?:\.\d+)?-(?:flash|pro)-image(?:-|$)/.test(name);
}

export function imageModelSettings(config: AiConfig, model: string) {
    const gemini = modelApiFormatOf(config, model) === "gemini";
    return { quality: !gemini, resolution: !gemini || supportsGeminiImageSize(model) };
}
