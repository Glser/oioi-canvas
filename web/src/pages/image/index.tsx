import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, Download, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Empty, Image, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { CanvasImageSettingsPopover } from "@/components/canvas/canvas-image-settings-popover";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { modelOptionLabel, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";

type GeneratedImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed";
    images: GeneratedImage[];
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "oioi-canvas:image_generation_logs";
const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";
const COMPOSER_TOOL_BTN = "inline-flex size-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100";
const logStore = localforage.createInstance({ name: "oioi-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences]);
    };


    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, snapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
        if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

        try {
            saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "success" : "failed",
                    images: successImages,
                }),
            );
            successCount ? message.success(t("imageWorkbench.generated")) : message.error(failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed"));
        } finally {
            setRunning(false);
        }
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `image-${index + 1}.png`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: `result-${index + 1}.png`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        addAsset({
            kind: "image",
            title: t("imageWorkbench.resultTitle", { count: index + 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = (log: GenerationLog) => {
        void logStore.setItem(log.id, serializeLog(log)).then(refreshLogs);
    };

    const refreshLogs = async () => setLogs(await readStoredLogs());

    const previewGenerationLog = async (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        setResults(log.images.map((image) => ({ id: image.id, status: "success", image })));
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const runGenerationSlot = async (index: number, snapshot: { text: string; config: AiConfig; references: ReferenceImage[] }) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.text, snapshot.references) : await requestGeneration(snapshot.config, snapshot.text);
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl);
            const nextImage: GeneratedImage = { id: image.id, dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: performance.now() - itemStartedAt, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        try {
            const image = await runGenerationSlot(index, snapshot);
            saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [image],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch {
            // runGenerationSlot has already marked the result as failed.
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50/60 text-stone-900 dark:bg-[#121211] dark:text-stone-100 pt-16">
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 gap-3 lg:flex-row lg:overflow-hidden">
                {/* Collapsible History Drawer / Sidebar for Desktop */}
                <aside
                    className={`thin-scrollbar hidden h-full flex-col overflow-y-auto rounded-2xl border border-black/[0.06] bg-white/80 p-4 shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300 ease-in-out dark:border-white/[0.08] dark:bg-stone-900/60 dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] lg:flex ${
                        showHistory ? "w-80 opacity-100" : "w-0 p-0 border-0 opacity-0 overflow-hidden"
                    }`}
                >
                    <div className="flex items-center justify-between pb-2.5 border-b border-stone-100 dark:border-stone-800 mb-3">
                        <div className="flex items-center gap-2">
                            <History className="size-4 text-stone-500" />
                            <span className="font-semibold text-sm">{t("workbench.logs")}</span>
                            <Tag className="m-0 text-xs px-1.5 py-0">{logs.length}</Tag>
                        </div>
                        <Button
                            type="text"
                            size="small"
                            className="!p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                            icon={<X className="size-4" />}
                            onClick={() => setShowHistory(false)}
                        />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <LogPanel
                            hideHeader
                            logs={logs}
                            selectedLogIds={selectedLogIds}
                            activeLogId={previewLog?.id}
                            onSelectedLogIdsChange={setSelectedLogIds}
                            onCreateSession={createSession}
                            onDeleteSelected={() => setDeleteConfirmOpen(true)}
                            onPreviewLog={(log) => void previewGenerationLog(log)}
                        />
                    </div>
                </aside>

                {/* Left Creation Control Panel */}
                <section className="thin-scrollbar flex w-full shrink-0 flex-col rounded-2xl border border-black/[0.06] bg-white/85 p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-md dark:border-white/[0.08] dark:bg-stone-900/70 dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] lg:h-full lg:w-[420px] lg:overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-8 items-center justify-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                                <ImagePlus className="size-4" />
                            </div>
                            <h1 className="text-sm font-semibold leading-none text-stone-950 dark:text-stone-100">{t("imageWorkbench.title")}</h1>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Button
                                size="small"
                                type={showHistory || logsOpen ? "default" : "text"}
                                icon={<History className="size-3.5" />}
                                className="!h-7 rounded-lg text-xs"
                                onClick={() => {
                                    if (window.innerWidth < 1024) {
                                        setLogsOpen(true);
                                    } else {
                                        setShowHistory((v) => !v);
                                    }
                                }}
                            >
                                {t("workbench.logs")}
                                {logs.length > 0 && <span className="opacity-60 text-[10px] ml-0.5">({logs.length})</span>}
                            </Button>
                        </div>
                    </div>

                    <div
                        className={`mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border transition-colors ${
                            isReferenceDragActive
                                ? "border-stone-900/35 bg-stone-100/80 dark:border-stone-100/25 dark:bg-stone-800/50"
                                : "border-stone-200/90 bg-white/70 focus-within:border-stone-400 dark:border-stone-800 dark:bg-stone-950/40 dark:focus-within:border-stone-500"
                        }`}
                        onDragEnter={(event) => {
                            event.preventDefault();
                            dragDepthRef.current += 1;
                            if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                        }}
                        onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                        }}
                        onDragLeave={(event) => {
                            event.preventDefault();
                            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                            if (!dragDepthRef.current) setIsReferenceDragActive(false);
                        }}
                        onDrop={(event) => {
                            event.preventDefault();
                            dragDepthRef.current = 0;
                            setIsReferenceDragActive(false);
                            void addReferences(event.dataTransfer.files);
                        }}
                    >
                        <div className={`flex items-center gap-2 px-2.5 ${references.length ? "pt-2.5" : "pt-2"}`}>
                            <div
                                className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain"
                                onWheel={(event) => {
                                    if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                    event.preventDefault();
                                    event.currentTarget.scrollLeft += event.deltaY;
                                }}
                            >
                                {references.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className="group relative size-12 shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800"
                                    >
                                        <img
                                            src={previewUrlFor(item.storageKey) || item.dataUrl}
                                            alt={item.name}
                                            className="size-full object-cover"
                                        />
                                        <span className="absolute left-1 top-1 rounded bg-black/65 px-1 py-px text-[9px] font-medium leading-none text-white">
                                            {imageReferenceLabel(index)}
                                        </span>
                                        
                                        <button
                                            type="button"
                                            className="absolute right-1 top-1 hidden size-4 items-center justify-center rounded bg-black/65 text-white group-hover:flex"
                                            onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                            aria-label={t("imageWorkbench.removeReference")}
                                        >
                                            <Trash2 className="size-2.5" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`flex shrink-0 items-center justify-center gap-1 transition-colors ${
                                        references.length
                                            ? `size-12 rounded-xl border border-dashed text-stone-400 hover:border-stone-400 hover:text-stone-700 dark:hover:border-stone-500 dark:hover:text-stone-200 ${isReferenceDragActive ? "border-stone-900 bg-stone-200/70 dark:border-stone-100 dark:bg-stone-700/70" : "border-stone-300 dark:border-stone-700"}`
                                            : `h-7 rounded-lg px-2 text-xs ${isReferenceDragActive ? "bg-stone-200/80 text-stone-800 dark:bg-white/10 dark:text-stone-100" : "text-stone-500 hover:bg-black/5 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"}`
                                    }`}
                                    title={t("workbench.upload")}
                                >
                                    {references.length ? (
                                        <Plus className="size-4" />
                                    ) : (
                                        <>
                                            <ImagePlus className="size-3.5" />
                                            <span className="whitespace-nowrap text-xs">
                                                {isReferenceDragActive ? t("imageWorkbench.dropReferences") : t("imageWorkbench.addReference")}
                                            </span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                                <Tooltip title={t("workbench.viewPrompts")}>
                                    <button type="button" className={COMPOSER_TOOL_BTN} onClick={() => setPromptDialogOpen(true)} aria-label={t("workbench.viewPrompts")}>
                                        <BookOpen className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip title={t("workbench.viewAssets")}>
                                    <button type="button" className={COMPOSER_TOOL_BTN} onClick={() => setAssetPickerOpen(true)} aria-label={t("workbench.viewAssets")}>
                                        <FolderPlus className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </div>
                        </div>

                        <div className="relative min-h-[132px] flex-1 px-1 pb-1 pt-1.5">
                            <Input.TextArea
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                rows={5}
                                variant="borderless"
                                placeholder={t("imageWorkbench.promptPlaceholder")}
                                className="!h-full !min-h-[132px] !resize-none !bg-transparent !px-2.5 !pt-1.5 !pb-8 text-sm !text-stone-800 placeholder:!text-stone-400 dark:!text-stone-100"
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                                        e.preventDefault();
                                        if (canGenerate && !running) void generate();
                                    }
                                }}
                            />
                            <div className="pointer-events-none absolute right-3 bottom-2.5 flex select-none items-center gap-1 text-[11px] text-stone-400">
                                <kbd className="inline-flex items-center rounded-md border border-stone-200/80 px-1 py-px font-mono text-[9px] dark:border-stone-700">Ctrl</kbd>
                                <span>+</span>
                                <kbd className="inline-flex items-center rounded-md border border-stone-200/80 px-1 py-px font-mono text-[9px] dark:border-stone-700">Enter</kbd>
                            </div>
                        </div>

                        <div className="border-t border-stone-200/70 px-2 pb-2 pt-2 dark:border-stone-800">
                            <GenerationSettings
                                config={effectiveConfig}
                                model={model}
                                updateConfig={updateConfig}
                                openConfigDialog={openConfigDialog}
                                running={running}
                                canGenerate={canGenerate}
                                onGenerate={() => void generate()}
                            />
                        </div>
                    </div>
                </section>

                {/* Right Stage: Immersive Results Gallery */}
                <section className="thin-scrollbar flex min-h-[420px] flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white/80 p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-md dark:border-white/[0.08] dark:bg-stone-900/60 dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] lg:min-h-0 lg:h-full overflow-y-auto">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold">{t("workbench.results")}</h2>
                            {results.length > 0 && (
                                <Tag className="m-0 rounded-full px-2 text-xs">
                                    {results.filter((r) => r.status === "success").length} / {results.length}
                                </Tag>
                            )}
                        </div>
                        {running ? <Tag color="blue" className="m-0 px-2.5 py-0.5 rounded-full text-xs animate-pulse">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                    </div>

                    {results.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
                            {results.map((result, index) =>
                                result.status === "success" && result.image ? (
                                    <ResultImageCard key={result.id} image={result.image} index={index} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} />
                                ) : result.status === "failed" ? (
                                    <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={() => retryResult(index)} />
                                ) : (
                                    <PendingImageCard key={result.id} />
                                ),
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-1 min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/40 text-center dark:border-stone-800 dark:bg-stone-900/30">
                            <div className="flex size-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400 dark:bg-stone-800/80 dark:text-stone-500 mb-3 shadow-inner">
                                <ImagePlus className="size-7" />
                            </div>
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("imageWorkbench.empty")} />
                            <p className="mt-1 text-xs text-stone-400 max-w-xs">{t("imageWorkbench.promptPlaceholder")}</p>
                        </div>
                    )}
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                />
            </Drawer>
            
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function GenerationSettings({
    config,
    model,
    updateConfig,
    openConfigDialog,
    running,
    canGenerate,
    onGenerate,
}: {
    config: AiConfig;
    model: string;
    updateConfig: UpdateAiConfig;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    running?: boolean;
    canGenerate?: boolean;
    onGenerate?: () => void;
}) {
    const { t } = useTranslation();
    const count = Math.max(1, Math.min(4, Math.floor(Math.abs(Number(config.count)) || 1)));

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex h-9 min-w-0 items-center rounded-full bg-stone-100/90 p-0.5 dark:bg-white/[0.07]">
                <div className="min-w-0 flex-1">
                    <ModelPicker
                        config={config}
                        value={model}
                        onChange={(value) => updateConfig("imageModel", value)}
                        capability="image"
                        fullWidth
                        className="!h-8 !min-w-0 !w-full !rounded-full !border-0 !bg-transparent !px-2.5 !text-xs !shadow-none hover:!bg-black/5 dark:!border-0 dark:hover:!bg-white/10"
                        onMissingConfig={() => openConfigDialog(false)}
                    />
                </div>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-stone-300/80 dark:bg-white/10" />
                <CanvasImageSettingsPopover
                    config={config}
                    buttonClassName="!h-8 !rounded-full !border-0 !bg-transparent !px-2.5 !shadow-none hover:!bg-black/5 dark:!border-0 dark:hover:!bg-white/10"
                    onConfigChange={(key, value) => updateConfig(key, value)}
                />
                <span className="mx-0.5 h-4 w-px shrink-0 bg-stone-300/80 dark:bg-white/10" />
                <div className="inline-flex h-8 shrink-0 items-center px-0.5" title={t("settingsPanels.image.count")}>
                    {[1, 2, 4].map((num) => (
                        <button
                            key={num}
                            type="button"
                            onClick={() => updateConfig("count", String(num))}
                            className={`flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-full px-1.5 text-xs tabular-nums transition-colors ${
                                count === num
                                    ? "bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100"
                                    : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                            }`}
                        >
                            {num}
                        </button>
                    ))}
                </div>
            </div>
            {onGenerate ? (
                <button
                    type="button"
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-stone-900 text-sm font-medium text-white shadow-[0_6px_16px_rgba(28,25,23,0.18)] transition hover:bg-stone-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none dark:bg-stone-100 dark:text-stone-950 dark:shadow-[0_6px_16px_rgba(0,0,0,0.28)] dark:hover:bg-white"
                    disabled={!canGenerate || running}
                    onClick={onGenerate}
                >
                    {running ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {t("workbench.generate")}
                    {count > 1 ? <span className="text-xs font-normal tabular-nums opacity-80">×{count}</span> : null}
                </button>
            ) : null}
        </div>
    );
}

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
}) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    return (
        <div className="group relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white/90 shadow-sm transition-all duration-300 hover:shadow-xl dark:border-white/[0.08] dark:bg-stone-900/80">
            {/* Image display */}
            <div className="relative aspect-square w-full overflow-hidden bg-stone-100 dark:bg-stone-950">
                <Image
                    src={previewUrlFor(image.storageKey) || image.dataUrl}
                    preview={{ src: image.dataUrl }}
                    alt={t("imageWorkbench.resultAlt", { count: index + 1 })}
                    className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                />

                {/* Top overlay badge: specs */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2.5 bg-gradient-to-b from-black/50 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-mono text-white/90 backdrop-blur-md">
                        {image.width}×{image.height}
                    </span>
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-mono text-white/90 backdrop-blur-md">
                        {formatDuration(image.durationMs)}
                    </span>
                </div>

                {/* Quick actions hover pill overlay */}
                <div className="absolute inset-x-2 bottom-2.5 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1">
                    <div className="flex items-center gap-1 rounded-full border border-white/20 bg-stone-950/75 p-1 text-white shadow-lg backdrop-blur-md">
                        <Tooltip title={t("imageWorkbench.addReference")}>
                            <button
                                type="button"
                                className="flex size-7.5 items-center justify-center rounded-full text-stone-300 transition-colors hover:bg-white/20 hover:text-white"
                                onClick={() => void onEdit(image, index)}
                            >
                                <PenLine className="size-3.5" />
                            </button>
                        </Tooltip>
                        <Tooltip title={t("common.addToAssets")}>
                            <button
                                type="button"
                                className="flex size-7.5 items-center justify-center rounded-full text-stone-300 transition-colors hover:bg-white/20 hover:text-white"
                                onClick={() => void onSaveAsset(image, index)}
                            >
                                <FolderPlus className="size-3.5" />
                            </button>
                        </Tooltip>
                        <div className="h-3.5 w-px bg-white/20 my-auto" />
                        <Tooltip title={t("common.download")}>
                            <button
                                type="button"
                                className="flex size-7.5 items-center justify-center rounded-full text-stone-300 transition-colors hover:bg-white/20 hover:text-white"
                                onClick={() => onDownload(image, index)}
                            >
                                <Download className="size-3.5" />
                            </button>
                        </Tooltip>
                    </div>
                </div>
            </div>

            {/* Subtle bottom info bar */}
            <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400 dark:border-stone-800/80 dark:text-stone-500">
                <span className="font-mono">{formatBytes(image.bytes)}</span>
                <div className="flex items-center gap-1">
                    <Tooltip title={t("imageWorkbench.addReference")}>
                        <Button
                            type="text"
                            size="small"
                            className="!h-6 !px-2 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 !text-xs !rounded-md"
                            icon={<PenLine className="size-3" />}
                            onClick={() => void onEdit(image, index)}
                        >
                            {t("imageWorkbench.addReference")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <Button
                            type="text"
                            size="small"
                            className="!h-6 !px-2 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 !text-xs !rounded-md"
                            icon={<Download className="size-3" />}
                            onClick={() => onDownload(image, index)}
                        >
                            {t("common.download")}
                        </Button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-square overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-square flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    hideHeader,
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    hideHeader?: boolean;
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            {!hideHeader && (
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                    </div>
                    <Tag className="m-0">{logs.length}</Tag>
                </div>
            )}
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const thumbnails = log.images.filter((image) => image.dataUrl).slice(0, 4);

    return (
        <button
            type="button"
            className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}
            onClick={onClick}
        >
            <div className="grid grid-cols-[minmax(128px,1fr)_auto] gap-2">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                    <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold leading-5">{log.title}</div>
                        {thumbnails.length ? (
                            <div className="mt-2 flex gap-1 overflow-hidden">
                                {thumbnails.map((image) => (
                                    <img key={image.id} src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <div className="flex gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="blue">
                            {t("workbench.successCount", { count: log.successCount ?? log.imageCount })}
                        </Tag>
                        {log.failCount ? (
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="red">
                                {t("workbench.failCount", { count: log.failCount })}
                            </Tag>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{t("workbench.itemCount", { count: log.imageCount })}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                    </div>
                    <div className="flex justify-end">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.time}</Tag>
                    </div>
                </div>
            </div>
        </button>
    );
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const values: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            values.push(value);
        });
        const logs = await Promise.all(values.map(normalizeLog));
        return logs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "success",
        images,
    };
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        images: log.images.map((image) => ({ ...image, dataUrl: image.storageKey ? "" : image.dataUrl })),
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
    };
}



function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: prompt.slice(0, 12) || i18n.t("workbench.untitled"),
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
    };
}




