import {
    ArrowLeft,
    ArrowRight,
    BookOpen,
    CheckSquare,
    Download,
    FolderPlus,
    History,
    LoaderCircle,
    Plus,
    Trash2,
    VideoIcon,
    Wand2,
    X,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import { App, Button, Checkbox, Drawer, Empty, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { CanvasVideoSettingsPopover } from "@/components/canvas/canvas-video-settings-popover";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { normalizeVideoResolutionValue, normalizeVideoSizeValue } from "@/components/video-settings-panel";
import { clampVideoSeconds } from "@/lib/media-size";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { deleteStoredMedia, resolveMediaUrl } from "@/services/file-storage";
import { resolveImageUrl, ensureImagePreview, getImagePreviewRevision, previewUrlFor, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { boolConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";

type GeneratedVideo = {
    id: string;
    url: string;
    storageKey: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    video?: GeneratedVideo;
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
    size: string;
    resolution: string;
    seconds: string;
    status: "pending" | "success" | "failed";
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
};

type GenerationLogConfig = Pick<AiConfig, "model" | "videoModel" | "size" | "vquality" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoMode">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;

const LOG_STORE_KEY = "oioi-canvas:video_generation_logs";
const COMPOSER_TOOL_BTN = "inline-flex size-7 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-black/5 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100";
const logStore = localforage.createInstance({ name: "oioi-canvas", storeName: "video_generation_logs" });

export default function VideoPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
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
    const videoCommand = useWorkbenchAgentStore((state) => state.videoCommand);
    const clearVideoCommand = useWorkbenchAgentStore((state) => state.clearVideoCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.videoModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const selectedFiles = Array.from(files || []);
        const unsupported = selectedFiles.filter((file) => !file.type.startsWith("image/"));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        const imageFiles = selectedFiles.filter((file) => file.type.startsWith("image/")).slice(0, 7 - references.length);
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, 7));
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults([{ id: nanoid(), status: "pending" }]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        try {
            const task = await createVideoGenerationTask(snapshot.config, snapshot.text, snapshot.references);
            const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, durationMs: 0, status: "pending", task });
            await saveLog(log, false);
            void pollGenerationLog(log, snapshot.config, agentTaskId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: nanoid(), status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog(buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, durationMs: performance.now() - batchStartedAt, status: "failed", error: errorMessage }));
            message.error(errorMessage);
            setRunning(false);
        }
    };

    // Handle video-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!videoCommand || videoCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = videoCommand.nonce;
        clearVideoCommand();
        if (typeof videoCommand.prompt === "string") setPrompt(videoCommand.prompt);
        if (videoCommand.run && running) {
            if (videoCommand.taskId) updateAgentTask(videoCommand.taskId, { status: "failed", error: t("videoWorkbench.busy") });
            return;
        }
        if (videoCommand.run) {
            agentTaskIdRef.current = videoCommand.taskId;
            setAutoRunToken((value) => value + 1);
        }
    }, [videoCommand, clearVideoCommand, running, updateAgentTask, t]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("videoWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: [...references] };
    };

    const retryResult = () => {
        void generate();
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, "video.mp4");
    };

    const saveResultToAssets = (video: GeneratedVideo) => {
        addAsset({
            kind: "video",
            title: t("videoWorkbench.resultTitle"),
            coverUrl: "",
            tags: [],
            source: t("videoWorkbench.source"),
            data: { url: video.url, storageKey: video.storageKey, width: video.width, height: video.height, bytes: video.bytes, mimeType: video.mimeType },
            metadata: { source: "video-page", prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, 7));
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
        const mediaKeys = logs
            .filter((log) => selectedLogIds.includes(log.id))
            .map((log) => log.video?.storageKey)
            .filter((key): key is string => Boolean(key));
        void Promise.all([deleteStoredMedia(mediaKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(() => refreshLogs());
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
            setResults([]);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const saveLog = async (log: GenerationLog, resumePending = true) => {
        await logStore.setItem(log.id, serializeLog(log));
        await refreshLogs(resumePending);
    };

    const refreshLogs = async (resumePending = true) => {
        const nextLogs = await readStoredLogs();
        setLogs(nextLogs);
        if (resumePending) resumePendingLogs(nextLogs);
        return nextLogs;
    };

    const resumePendingLogs = (items: GenerationLog[]) => {
        for (const log of items) {
            if (log.status === "pending" && log.task) void pollGenerationLog(log);
        }
    };

    const pollGenerationLog = async (log: GenerationLog, configOverride?: AiConfig, agentTaskId?: string) => {
        if (!log.task || activeLogIdsRef.current.has(log.id)) return;
        activeLogIdsRef.current.add(log.id);
        setRunning(true);
        setStartedAt((value) => value || performance.now());
        setResults((value) => (value.length ? value : [{ id: log.id, status: "pending" }]));
        const taskConfig = buildVideoConfig({ ...effectiveConfig, ...log.config }, log.task.model || log.model);
        try {
            for (let attempt = 0; attempt < 120; attempt += 1) {
                const state = await pollVideoGenerationTask(configOverride || taskConfig, log.task);
                if (state.status === "completed") {
                    const stored = await storeGeneratedVideo(state.result);
                    const nextVideo: GeneratedVideo = {
                        id: nanoid(),
                        url: stored.url,
                        storageKey: stored.storageKey,
                        durationMs: Date.now() - log.createdAt,
                        width: stored.width || 1280,
                        height: stored.height || 720,
                        bytes: stored.bytes,
                        mimeType: stored.mimeType,
                    };
                    setResults([{ id: nextVideo.id, status: "success", video: nextVideo }]);
                    if (agentTaskId) updateAgentTask(agentTaskId, { status: "succeeded", successCount: 1, failCount: 0, error: undefined });
                    await saveLog({ ...log, status: "success", durationMs: nextVideo.durationMs, video: nextVideo, error: undefined });
                    message.success(t("videoWorkbench.generated"));
                    return;
                }
                if (state.status === "failed") throw new Error(state.error);
                if (attempt === 119) throw new Error(t("videoWorkbench.timeout"));
                await delay(2500);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: log.id, status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog({ ...log, status: "failed", durationMs: Date.now() - log.createdAt, error: errorMessage });
            message.error(errorMessage);
        } finally {
            activeLogIdsRef.current.delete(log.id);
            if (!activeLogIdsRef.current.size) {
                setRunning(false);
                setStartedAt(0);
            }
        }
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        if (log.config.videoModel || log.model) updateConfig("videoModel", log.config.videoModel || log.model);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.vquality) updateConfig("vquality", log.config.vquality);
        if (log.config.videoSeconds) updateConfig("videoSeconds", log.config.videoSeconds);
        if (log.config.videoGenerateAudio) updateConfig("videoGenerateAudio", log.config.videoGenerateAudio);
        if (log.config.videoWatermark) updateConfig("videoWatermark", log.config.videoWatermark);
        if (log.config.videoMode) updateConfig("videoMode", log.config.videoMode);
        setResults(log.status === "pending" ? [{ id: log.id, status: "pending" }] : log.video ? [{ id: log.video.id, status: "success", video: log.video }] : [{ id: log.id, status: "failed", error: log.error || t("workbench.generationFailed") }]);
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
                        <div className="flex items-center gap-2">
                            <VideoIcon className="size-4 shrink-0 text-stone-700 dark:text-stone-300" />
                            <h1 className="text-sm font-semibold leading-none text-stone-950 dark:text-stone-100 translate-y-1">{t("videoWorkbench.title")}</h1>
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
                        <div className="flex items-center gap-2 px-2.5 pt-2.5">
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
                                        <ReferenceOrderButtons
                                            index={index}
                                            total={references.length}
                                            onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-1 top-1 hidden size-4 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition-transform hover:scale-110 group-hover:flex"
                                            onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                            aria-label={t("videoWorkbench.removeImage")}
                                        >
                                            <X className="size-2.5 stroke-[3] text-white" />
                                        </button>
                                    </div>
                                ))}
                                {references.length < 7 && (
                                    <Tooltip title={t("videoWorkbench.references")}>
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-700 dark:hover:border-stone-500 dark:hover:text-stone-200 ${
                                                isReferenceDragActive
                                                    ? "border-stone-900 bg-stone-200/70 dark:border-stone-100 dark:bg-stone-700/70"
                                                    : "border-stone-300 dark:border-stone-700"
                                            }`}
                                            aria-label={t("videoWorkbench.references")}
                                        >
                                            <Plus className="size-4 stroke-[2.5]" />
                                        </button>
                                    </Tooltip>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                                <Tooltip title={t("workbench.viewPrompts")}>
                                    <button
                                        type="button"
                                        className={COMPOSER_TOOL_BTN}
                                        onClick={() => setPromptDialogOpen(true)}
                                        aria-label={t("workbench.viewPrompts")}
                                    >
                                        <BookOpen className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip title={t("workbench.viewAssets")}>
                                    <button
                                        type="button"
                                        className={COMPOSER_TOOL_BTN}
                                        onClick={() => setAssetPickerOpen(true)}
                                        aria-label={t("workbench.viewAssets")}
                                    >
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
                                placeholder={t("videoWorkbench.promptPlaceholder")}
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
                        {running ? (
                            <Tag color="blue" className="m-0 px-2.5 py-0.5 rounded-full text-xs animate-pulse">
                                {t("workbench.waiting", { time: formatDuration(elapsedMs) })}
                            </Tag>
                        ) : null}
                    </div>

                    {results.length ? (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {results.map((result) =>
                                result.status === "success" && result.video ? (
                                    <ResultVideoCard key={result.id} video={result.video} onDownload={downloadVideo} onSaveAsset={saveResultToAssets} />
                                ) : result.status === "failed" ? (
                                    <FailedVideoCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={retryResult} />
                                ) : (
                                    <PendingVideoCard key={result.id} />
                                ),
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-1 min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/40 text-center dark:border-stone-800 dark:bg-stone-900/30">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("videoWorkbench.empty")} />
                            <p className="mt-1 text-xs text-stone-400 max-w-xs">{t("videoWorkbench.promptPlaceholder")}</p>
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

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex h-9 min-w-0 items-center rounded-full bg-stone-100/90 p-0.5 dark:bg-white/[0.07]">
                <div className="min-w-0 flex-1">
                    <ModelPicker
                        config={config}
                        value={model}
                        onChange={(value) => updateConfig("videoModel", value)}
                        capability="video"
                        fullWidth
                        hideChevron
                        side="top"
                        contentClassName="w-60"
                        className="!h-8 !min-w-0 !w-full !rounded-full !border-0 !bg-transparent !px-2.5 !text-[11px] [&_.canvas-model-picker-text]:!text-[11px] !shadow-none hover:!bg-black/5 dark:!border-0 dark:hover:!bg-white/10"
                        onMissingConfig={() => openConfigDialog(false)}
                    />
                </div>
                <span className="mx-0.5 h-4 w-px shrink-0 bg-stone-300/80 dark:bg-white/10" />
                <div className="min-w-0 shrink-0 max-w-[55%]">
                    <CanvasVideoSettingsPopover
                        config={config}
                        buttonClassName="!h-8 !rounded-full !border-0 !bg-transparent !px-2.5 !text-[11px] [&_span]:!text-[11px] !shadow-none hover:!bg-black/5 dark:!border-0 dark:hover:!bg-white/10"
                        onConfigChange={(key, value) => updateConfig(key, value)}
                        placement="top"
                    />
                </div>
            </div>
            {onGenerate ? (
                <button
                    type="button"
                    className="group relative inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-black/10 bg-black/5 px-4 text-sm font-semibold text-black transition-all duration-150 hover:bg-black/10 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                    disabled={!canGenerate || running}
                    onClick={onGenerate}
                >
                    {running ? (
                        <LoaderCircle className="size-4 animate-spin text-black dark:text-white" />
                    ) : (
                        <Wand2 className="size-4 stroke-2 text-black transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-110 dark:text-white" />
                    )}
                    <span className="text-black dark:text-white font-semibold">
                        {t("workbench.generate")}
                    </span>
                </button>
            ) : null}
        </div>
    );
}

function ResultVideoCard({
    video,
    onDownload,
    onSaveAsset,
}: {
    video: GeneratedVideo;
    onDownload: (video: GeneratedVideo) => void;
    onSaveAsset: (video: GeneratedVideo) => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="group relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white/90 shadow-sm transition-all duration-300 hover:shadow-xl dark:border-white/[0.08] dark:bg-stone-900/80">
            {/* Video container */}
            <div className="relative aspect-video w-full overflow-hidden bg-black">
                <video
                    src={video.url}
                    controls
                    className="size-full object-contain"
                />

                {/* Top overlay badge: specs */}
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-2.5 bg-gradient-to-b from-black/50 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-mono text-white/90 backdrop-blur-md">
                        {video.width}×{video.height}
                    </span>
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-mono text-white/90 backdrop-blur-md">
                        {formatDuration(video.durationMs)}
                    </span>
                </div>
            </div>

            {/* Subtle bottom info bar */}
            <div className="flex items-center justify-between border-t border-stone-100 px-3 py-2 text-[11px] text-stone-400 dark:border-stone-800/80 dark:text-stone-500">
                <span className="font-mono">{formatBytes(video.bytes)}</span>
                <div className="flex items-center gap-1">
                    <Tooltip title={t("common.addToAssets")}>
                        <Button
                            type="text"
                            size="small"
                            className="!h-6 !px-2 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 !text-xs !rounded-md"
                            icon={<FolderPlus className="size-3" />}
                            onClick={() => onSaveAsset(video)}
                        >
                            {t("common.addToAssets")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <Button
                            type="text"
                            size="small"
                            className="!h-6 !px-2 text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 !text-xs !rounded-md"
                            icon={<Download className="size-3" />}
                            onClick={() => onDownload(video)}
                        >
                            {t("common.download")}
                        </Button>
                    </Tooltip>
                </div>
            </div>
        </div>
    );
}

function PendingVideoCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
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

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-video flex-col items-center justify-center gap-3 p-5 text-center">
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
    const thumbnails = (log.references || []).filter((item) => item.dataUrl || item.storageKey).slice(0, 3);

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
                    <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color={log.status === "success" ? "blue" : log.status === "pending" ? "processing" : "red"}>
                        {t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`)}
                    </Tag>
                    <div className="flex flex-wrap justify-end gap-1">
                        {log.size ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.size}</Tag> : null}
                        {log.resolution ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.resolution}p</Tag> : null}
                        {log.seconds ? <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.seconds}s</Tag> : null}
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

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        video: log.video?.storageKey ? { ...log.video, url: "" } : log.video,
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="absolute inset-x-1 bottom-1 flex justify-between">
            <Button size="small" className="!h-5 !w-5 !min-w-5 !rounded-full !bg-white/85 !p-0 !shadow-sm dark:!bg-stone-900/85" icon={<ArrowLeft className="size-2.5" />} disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button size="small" className="!h-5 !w-5 !min-w-5 !rounded-full !bg-white/85 !p-0 !shadow-sm dark:!bg-stone-900/85" icon={<ArrowRight className="size-2.5" />} disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        videoModel: log.config?.videoModel || log.model || "",
        size: log.config?.size || log.size || "",
        vquality: normalizeResolution(log.config?.vquality || log.resolution || ""),
        videoSeconds: log.config?.videoSeconds || log.seconds || "",
        videoGenerateAudio: log.config?.videoGenerateAudio || "true",
        videoWatermark: log.config?.videoWatermark || "false",
        videoMode: log.config?.videoMode === "reference" ? "reference" : "frames",
    };
}

function buildLog({ prompt, model, config, references, durationMs, status, task, video, error }: { prompt: string; model: string; config: AiConfig; references: ReferenceImage[]; durationMs: number; status: GenerationLog["status"]; task?: VideoGenerationTask; video?: GeneratedVideo; error?: string }): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
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
        size: logConfig.size,
        resolution: logConfig.vquality,
        seconds: logConfig.videoSeconds,
        status,
        task,
        video,
        error,
    };
}

function buildVideoConfig(config: AiConfig, model: string): AiConfig {
    return {
        ...config,
        model,
        videoModel: model,
        size: normalizeVideoSize(config.size),
        videoSeconds: normalizeVideoSeconds(config.videoSeconds),
        vquality: normalizeResolution(config.vquality),
        videoGenerateAudio: String(boolConfig(config.videoGenerateAudio, true)),
        videoWatermark: String(boolConfig(config.videoWatermark, false)),
        videoMode: config.videoMode === "reference" ? "reference" : "frames",
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    return clampVideoSeconds(value);
}

function normalizeVideoSize(value: string) {
    return normalizeVideoSizeValue(value);
}

function normalizeResolution(value: string) {
    return normalizeVideoResolutionValue(value);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStoredLogs() {
    if (typeof window === "undefined") return [];
    try {
        const logs: GenerationLog[] = [];
        await logStore.iterate<GenerationLog, void>((value) => {
            logs.push(value);
        });
        return (await Promise.all(logs.map(normalizeLog))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch {
        return [];
    }
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const video = log.video?.storageKey ? { ...log.video, url: await resolveMediaUrl(log.video.storageKey, log.video.url) } : log.video;
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || "",
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.videoModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        size: log.size || config.size || "",
        resolution: normalizeResolution(log.resolution || config.vquality || ""),
        seconds: log.seconds || config.videoSeconds || "",
        status: log.status || "success",
        task: log.task,
        video,
        error: log.error,
    };
}
