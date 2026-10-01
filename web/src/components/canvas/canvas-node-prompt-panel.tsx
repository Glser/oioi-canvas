import { useEffect, useMemo, useRef, useState } from "react";
import { AtSign, LoaderCircle, Maximize2, Sparkles, Square, Upload } from "lucide-react";
import { Button, Modal, Popover, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, resolveModelForCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover } from "./canvas-audio-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasTextSettingsPopover } from "./canvas-text-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "@/types/canvas";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";
import { CanvasNodeReferenceBar } from "./canvas-node-reference-bar";
import { CanvasReferencePickerPopover } from "./canvas-reference-picker-popover";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    nodes: CanvasNodeData[];
    connectedNodes?: CanvasNodeData[];
    onConnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onDisconnectReference?: (fromNodeId: string, toNodeId: string) => void;
    onUploadReference?: (file: File) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    modeOverride?: CanvasNodeGenerationMode; // Plugin nodes set their generation type through useBuiltinPanel.mode.
};

export function CanvasNodePromptPanel({
    node,
    nodes,
    isRunning,
    onPromptChange,
    onConfigChange,
    onGenerate,
    onStop,
    mentionReferences = [],
    connectedNodes = [],
    onConnectReference,
    onDisconnectReference,
    onUploadReference,
    onImageSettingsOpenChange,
    modeOverride,
}: CanvasNodePromptPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = modeOverride ?? defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    const [expanded, setExpanded] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    // Connected source node IDs for quick lookup
    const connectedNodeIds = useMemo(() => {
        return new Set(connectedNodes.map((n) => n.id));
    }, [connectedNodes]);

    // Restore prompts only when switching nodes; preserve the current input after generation on the same node.
    useEffect(() => {
        setPrompt(node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (isEditingExistingContent) onConfigChange(node.id, { composerContent: value });
        else onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
    };

    const openExpandedEditor = () => {
        setExpanded(true);
    };

    const handleToggleReference = (sourceNodeId: string) => {
        if (connectedNodeIds.has(sourceNodeId)) {
            onDisconnectReference?.(sourceNodeId, node.id);
        } else {
            onConnectReference?.(sourceNodeId, node.id);
        }
    };

    return (
        <div
            data-canvas-no-zoom
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="flex flex-col gap-1.5 w-full">
                {/* Top Action Row: @ and Upload together, Expand on right */}
                <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-1">
                        <Popover
                            trigger="click"
                            open={pickerOpen}
                            onOpenChange={setPickerOpen}
                            placement="bottomLeft"
                            arrow={false}
                            overlayClassName="canvas-reference-picker-overlay"
                            overlayInnerStyle={{ background: "transparent", padding: 0, boxShadow: "none" }}
                            content={
                                <CanvasReferencePickerPopover
                                    targetNodeId={node.id}
                                    nodes={nodes}
                                    connectedNodeIds={connectedNodeIds}
                                    onToggleReference={handleToggleReference}
                                />
                            }
                        >
                            <Tooltip title={t("canvas.references.select")} open={pickerOpen ? false : undefined}>
                                <Button
                                    type="text"
                                    className={`!h-7 !w-7 !min-w-7 !rounded-lg !p-0 transition-colors ${
                                        pickerOpen ? "!bg-black/10 dark:!bg-white/15 opacity-100" : "opacity-60 hover:opacity-100 hover:!bg-black/5 dark:hover:!bg-white/10 !bg-transparent"
                                    }`}
                                    style={{ color: theme.node.text }}
                                    icon={<AtSign className="size-4" />}
                                    aria-label={t("canvas.references.select")}
                                />
                            </Tooltip>
                        </Popover>
                        <Tooltip title={t("canvas.toolbar.upload")}>
                            <Button
                                type="text"
                                className="!h-7 !w-7 !min-w-7 !rounded-lg !bg-transparent !p-0 opacity-60 hover:opacity-100 hover:!bg-black/5 dark:hover:!bg-white/10 transition-colors"
                                style={{ color: theme.node.text }}
                                icon={<Upload className="size-4" />}
                                onClick={() => fileInputRef.current?.click()}
                                aria-label={t("canvas.toolbar.upload")}
                            />
                        </Tooltip>
                    </div>

                    {/* Top Right Expand Button */}
                    <Tooltip title={t("canvas.promptPanel.expandEditor")}>
                        <Button
                            type="text"
                            className="!h-7 !w-7 !min-w-7 !rounded-lg !bg-transparent !p-0 opacity-60 hover:opacity-100 hover:!bg-black/5 dark:hover:!bg-white/10 transition-colors"
                            style={{ color: theme.node.text }}
                            icon={<Maximize2 className="size-3.5" />}
                            onClick={openExpandedEditor}
                            aria-label={t("canvas.promptPanel.expandEditor")}
                        />
                    </Tooltip>
                </div>

                {/* Prompt Text Input Row */}
                <CanvasPromptChipInput
                    value={prompt}
                    references={mentionReferences}
                    onChange={updatePrompt}
                    onSubmit={submit}
                    className="thin-scrollbar h-20 min-h-[72px] w-full cursor-text resize-none rounded-xl px-2.5 py-1.5 text-sm leading-5 outline-none"
                    style={{ background: "transparent", color: theme.node.text }}
                    placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
                />
            </div>

            {/* Reference Items Bar below input if there are connected nodes */}
            {connectedNodes.length > 0 && (
                <div className="mt-2 pt-2 border-t" style={{ borderColor: theme.toolbar.border }}>
                    <CanvasNodeReferenceBar
                        nodeId={node.id}
                        nodes={nodes}
                        connectedNodes={connectedNodes}
                        onDisconnect={onDisconnectReference}
                        onAddClick={() => setPickerOpen(true)}
                    />
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                        onUploadReference?.(file);
                    }
                    e.target.value = "";
                }}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    {mode === "image" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="image" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="video" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[220px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <>
                            <ModelPicker config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} className="max-w-[190px]" />
                            <CanvasTextSettingsPopover config={config} count={node.metadata?.textCount || 1} onConfigChange={(_, value) => onConfigChange(node.id, { reasoningEffort: value })} onCountChange={(textCount) => onConfigChange(node.id, { textCount })} />
                        </>
                    )}
                </div>
                <Button
                    className="group relative !h-9 !min-w-14 shrink-0 !rounded-full !border-0 !px-3.5 shadow-sm transition hover:opacity-90 active:scale-95 disabled:opacity-40"
                    style={{
                        background: isRunning ? "#ef4444" : "#f5f5f0",
                        color: isRunning ? "#ffffff" : "#1c1917",
                    }}
                    disabled={!isRunning && !prompt.trim()}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={t(isRunning ? "canvas.promptPanel.stopGeneration" : "canvas.promptPanel.generate")}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">{t("canvas.promptPanel.stop")}</span>
                            </>
                        ) : (
                            <>
                                <Sparkles className="size-3.5 transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
                                <span className="text-xs font-semibold">{t("canvas.promptPanel.generate")}</span>
                            </>
                        )}
                    </span>
                </Button>
            </div>
            <Modal title={t("canvas.promptPanel.editorTitle")} open={expanded} centered width={760} footer={null} onCancel={() => setExpanded(false)} destroyOnHidden>
                <div data-canvas-no-zoom className="pt-2" onWheelCapture={(event) => event.stopPropagation()}>
                    {connectedNodes.length > 0 && (
                        <div className="mb-3">
                            <CanvasNodeReferenceBar
                                nodeId={node.id}
                                nodes={nodes}
                                connectedNodes={connectedNodes}
                                onDisconnect={onDisconnectReference}
                            />
                        </div>
                    )}
                    <CanvasPromptChipInput
                        value={prompt}
                        references={mentionReferences}
                        onChange={updatePrompt}
                        className="thin-scrollbar h-[52dvh] min-h-80 w-full cursor-text overflow-y-auto rounded-xl border p-4 text-[15px] leading-6 outline-none"
                        style={{ background: "transparent", borderColor: theme.toolbar.border, color: theme.node.text }}
                        placeholder={t(`canvas.promptPanel.${mode === "image" && hasImageContent ? "editImage" : mode === "text" && hasTextContent ? "editText" : mode}`)}
                    />
                </div>
            </Modal>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    return {
        ...globalConfig,
        model: resolveModelForCapability(globalConfig, node.metadata?.model, mode),
        reasoningEffort: node.metadata?.reasoningEffort || globalConfig.reasoningEffort || defaultConfig.reasoningEffort,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        background: node.metadata?.background ?? globalConfig.background ?? defaultConfig.background,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        videoMode: node.metadata?.videoMode || globalConfig.videoMode || defaultConfig.videoMode,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoMode") return { videoMode: value };
    if (key === "videoGenerateAudio") return { generateAudio: value === "true" };
    if (key === "videoWatermark") return { watermark: value === "true" };
    return { [key]: value };
}

function audioConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    if (key === "audioInstructions") return { audioInstructions: value };
    return { [key]: value };
}
