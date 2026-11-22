import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, Download, FolderPlus, History, ImagePlus, LoaderCircle, Music2, Plus, Trash2, VideoIcon, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { nanoid } from "nanoid";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { VideoGenerationSettings } from "./components/generation-settings";
import styles from "@/components/layout/workbench.module.css";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { clampVideoSeconds, computeVideoSize, inferVideoRatio } from "@/lib/media-size";
import { normalizeVideoMode, resolutionLabel, resolutionToken, videoFeatureModes, videoUploadLimits, type VideoMediaType } from "@/lib/model-features";
import { estimateGenerationPrice, formatEstimatedPrice, resolveModelPricing } from "@/lib/model-pricing";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { generatedDownloadName } from "@/lib/download-name";
import { deleteStoredMedia, resolveMediaUrl, uploadMediaFile } from "@/services/file-storage";
import { resolveImageUrl, ensureImagePreview, getImagePreviewRevision, previewUrlFor, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { createVideoGenerationTask, pollVideoGenerationTask, storeGeneratedVideo, type VideoGenerationTask } from "@/services/api/video";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { boolConfig, modelApiFormatOf, resolveModelFeatures, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";
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
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
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

const LOG_STORE_KEY = "oioi-canvas:video_generation_logs";
const logStore = localforage.createInstance({ name: "oioi-canvas", storeName: "video_generation_logs" });

const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"];

export default function VideoPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const activeLogIdsRef = useRef<Set<string>>(new Set());
    // 提示词在开始生成后清空，失败重试从这里取回当时的请求快照
    const lastSnapshotRef = useRef<{ text: string; config: AiConfig; references: ReferenceImage[]; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[] } | null>(null);
    const theme = useThemeStore((state) => state.theme);
    const appearance = useMemo(() => getWorkbenchAppearance(theme === "dark"), [theme]);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [videoReferences, setVideoReferences] = useState<ReferenceVideo[]>([]);
    const [audioReferences, setAudioReferences] = useState<ReferenceAudio[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
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

    const model = effectiveConfig.videoModel;
    const videoFeature = resolveModelFeatures(effectiveConfig, model)?.video;
    const videoMode = (() => {
        const normalized = normalizeVideoMode(videoFeature, effectiveConfig.videoMode, references.length);
        if (normalized === "frames" && (videoReferences.length > 0 || audioReferences.length > 0) && videoFeatureModes(videoFeature).includes("reference")) return "reference";
        if (!videoFeature && (videoReferences.length > 0 || audioReferences.length > 0)) return "reference";
        return normalized;
    })();
    const selectedApiFormat = modelApiFormatOf(effectiveConfig, model);
    // 按当前模型计费声明估算本次生成价格（分辨率每秒价 × 时长），算不出不显示
    const estimatedPrice = useMemo(() => estimateGenerationPrice(resolveModelPricing(effectiveConfig, model), { kind: "video", seconds: Number(clampVideoSeconds(effectiveConfig.videoSeconds || "6")), resolution: resolutionToken(effectiveConfig.vquality) }), [effectiveConfig, model]);
    const estimatedPriceLabel = estimatedPrice != null ? i18n.t("workbench.generatePrice", { price: formatEstimatedPrice(estimatedPrice) }) : "";
    // 上传上限按各输入模式的最大值，请求前再按实际模式校验；Gemini 渠道参考视频/音频最多 1 个
    const uploadLimits = videoUploadLimits(videoFeature, videoMode);
    const mediaLimits = {
        image: { max: uploadLimits.image },
        video: { max: selectedApiFormat === "gemini" ? Math.min(uploadLimits.video, 1) : uploadLimits.video },
        audio: { max: selectedApiFormat === "gemini" ? Math.min(uploadLimits.audio, 1) : uploadLimits.audio },
    } satisfies Record<VideoMediaType, { max: number }>;
    const acceptedMediaTypes = [
        ...(mediaLimits.image.max > 0 ? ["image/*"] : []),
        ...(mediaLimits.video.max > 0 ? ["video/mp4", "video/quicktime", ".mp4", ".mov"] : []),
        ...(mediaLimits.audio.max > 0 ? ["audio/mpeg", "audio/wav", "audio/x-wav", ".mp3", ".wav"] : []),
    ].join(",");

    useEffect(() => {
        if (videoMode !== effectiveConfig.videoMode) updateConfig("videoMode", videoMode);
    }, [effectiveConfig.videoMode, updateConfig, videoMode]);

    useEffect(() => {
        setReferences((value) => value.slice(0, mediaLimits.image.max));
        setVideoReferences((value) => value.slice(0, mediaLimits.video.max));
        setAudioReferences((value) => value.slice(0, mediaLimits.audio.max));
    }, [mediaLimits.audio.max, mediaLimits.image.max, mediaLimits.video.max]);

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
        const isImage = (file: File) => file.type.startsWith("image/");
        const isVideo = (file: File) => VIDEO_MIME_TYPES.includes(file.type) || /\.(mp4|mov)$/i.test(file.name);
        const isAudio = (file: File) => file.type === "audio/mpeg" || file.type === "audio/mp3" || file.type === "audio/wav" || file.type === "audio/x-wav" || /\.(mp3|wav)$/i.test(file.name);
        const typeAllowed = (file: File) => (isImage(file) && mediaLimits.image.max > 0) || (isVideo(file) && mediaLimits.video.max > 0) || (isAudio(file) && mediaLimits.audio.max > 0);
        const unsupported = selectedFiles.filter((file) => !typeAllowed(file));
        if (unsupported.length) message.warning(t("videoWorkbench.unsupportedFiles"));
        // 数量上限只来自 New API 的 features 声明，未声明即不限制
        const imageFiles = selectedFiles.filter(isImage).slice(0, Math.max(0, mediaLimits.image.max - references.length));
        const videoFiles = selectedFiles.filter(isVideo).slice(0, Math.max(0, mediaLimits.video.max - videoReferences.length));
        const audioFiles = selectedFiles.filter(isAudio).slice(0, Math.max(0, mediaLimits.audio.max - audioReferences.length));
        if (imageFiles.length < selectedFiles.filter(isImage).length) message.warning(t("settingsPanels.video.referenceLimit", { count: mediaLimits.image.max, type: t("videoWorkbench.references") }));
        if (videoFiles.length < selectedFiles.filter(isVideo).length) message.warning(t("settingsPanels.video.referenceLimit", { count: mediaLimits.video.max, type: t("videoWorkbench.videoReferences") }));
        if (audioFiles.length < selectedFiles.filter(isAudio).length) message.warning(t("settingsPanels.video.referenceLimit", { count: mediaLimits.audio.max, type: t("videoWorkbench.audioReferences") }));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        const nextVideoReferences = await Promise.all(
            videoFiles.map(async (file) => {
                const video = await uploadMediaFile(file, "video-reference");
                return { id: nanoid(), name: file.name, type: video.mimeType, url: video.url, storageKey: video.storageKey, bytes: video.bytes, width: video.width, height: video.height, durationMs: video.durationMs };
            }),
        );
        const nextAudioReferences = await Promise.all(
            audioFiles.map(async (file) => {
                const audio = await uploadMediaFile(file, "audio-reference");
                return { id: nanoid(), name: file.name, type: audio.mimeType, url: audio.url, storageKey: audio.storageKey, durationMs: audio.durationMs };
            }),
        );
        setReferences((value) => [...value, ...nextReferences].slice(0, mediaLimits.image.max));
        setVideoReferences((value) => [...value, ...nextVideoReferences].slice(0, mediaLimits.video.max));
        setAudioReferences((value) => [...value, ...nextAudioReferences].slice(0, mediaLimits.audio.max));
    };

    const generate = async (retrySnapshot?: { text: string; config: AiConfig; references: ReferenceImage[]; videoReferences: ReferenceVideo[]; audioReferences: ReferenceAudio[] }) => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const snapshot = retrySnapshot || buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("videoWorkbench.invalidParams") });
            return;
        }
        // 提示词随生成一起"提交"：开始后清空输入框，快照留给失败重试
        if (!retrySnapshot) setPrompt("");
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults([{ id: nanoid(), status: "pending" }]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);
        lastSnapshotRef.current = snapshot;
        try {
            const task = await createVideoGenerationTask(snapshot.config, snapshot.text, snapshot.references, { videos: snapshot.videoReferences, audios: snapshot.audioReferences });
            const log = buildLog({ prompt: snapshot.text, model, config: snapshot.config, references: snapshot.references, videoReferences: snapshot.videoReferences, audioReferences: snapshot.audioReferences, durationMs: 0, status: "pending", task });
            await saveLog(log, false);
            void pollGenerationLog(log, snapshot.config, agentTaskId);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t("workbench.generationFailed");
            setResults([{ id: nanoid(), status: "failed", error: errorMessage }]);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", successCount: 0, failCount: 1, error: errorMessage });
            await saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: snapshot.config,
                    references: snapshot.references,
                    videoReferences: snapshot.videoReferences,
                    audioReferences: snapshot.audioReferences,
                    durationMs: performance.now() - batchStartedAt,
                    status: "failed",
                    error: errorMessage,
                }),
            );
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
        if (!isAiConfigReady(effectiveConfig, model, "video")) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        if (
            references.length > mediaLimits.image.max ||
            videoReferences.length > mediaLimits.video.max ||
            audioReferences.length > mediaLimits.audio.max
        ) {
            message.warning(t("videoWorkbench.invalidParams"));
            return null;
        }
        return { text, config: buildVideoConfig(effectiveConfig, model), references: [...references], videoReferences: [...videoReferences], audioReferences: [...audioReferences] };
    };

    const retryResult = () => {
        // 提示词已随生成清空，失败重试沿用保存的请求快照
        void generate(lastSnapshotRef.current || undefined);
    };

    const downloadVideo = (video: GeneratedVideo) => {
        saveAs(video.url, generatedDownloadName("video", "mp4"));
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
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }].slice(0, mediaLimits.image.max));
        } else if (payload.kind === "video") {
            setVideoReferences((value) => [...value, { id: nanoid(), name: payload.title, type: "video/mp4", url: payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height }].slice(0, mediaLimits.video.max));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        if (running) return;
        setLogsOpen(false);
        setPrompt("");
        setReferences([]);
        setVideoReferences([]);
        setAudioReferences([]);
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
                // 与网关任务轮询周期（15s）对齐，避免高频轮询只打到本地缓存状态。
                await delay(15000);
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
        setVideoReferences(log.videoReferences || []);
        setAudioReferences(log.audioReferences || []);
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
        <div className={styles.workbench} style={appearance.style}>
            <main className={styles.layout}>
                <section
                    className={`${styles.composer} ${isReferenceDragActive ? styles.dragging : ""}`}
                    aria-label={t("imageWorkbench.creationPanel")}
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
                    <header className={styles.composerHeader}>
                        <h1>{t("videoWorkbench.title")}</h1>
                        <Tooltip title={t("imageWorkbench.newSessionHint")}>
                            <Button type="text" size="small" icon={<Plus size={15} />} disabled={running} onClick={createSession}>
                                {t("workbench.new")}
                            </Button>
                        </Tooltip>
                    </header>
                    <div className={`${styles.editor} thin-scrollbar`}>
                        <div className={`${styles.field} ${styles.references}`} style={{ display: mediaLimits.image.max === 0 ? "none" : undefined }}>
                            <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                                <label>
                                    {t("videoWorkbench.references")}{" "}
                                    <span className={styles.muted}>
                                        {mediaCountLabel(references.length, mediaLimits.image.max)}
                                    </span>
                                </label>
                                <Tooltip title={t("workbench.viewAssets")}>
                                    <Button type="text" size="small" icon={<FolderPlus size={14} />} onClick={() => setAssetPickerOpen(true)}>
                                        {t("imageWorkbench.fromAssets")}
                                    </Button>
                                </Tooltip>
                            </div>
                            <div className={styles.referenceList}>
                                {references.map((item, index) => (
                                    <div key={item.id} className={styles.reference}>
                                        <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} />
                                        <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                        <Tooltip title={t("videoWorkbench.removeImage")}>
                                            <Button size="small" icon={<X size={12} />} aria-label={`${t("videoWorkbench.removeImage")} ${item.name}`} onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))} />
                                        </Tooltip>
                                    </div>
                                ))}
                                <Button
                                    disabled={references.length >= mediaLimits.image.max}
                                    className={references.length ? styles.upload : styles.dropzone}
                                    icon={<ImagePlus size={18} />}
                                    aria-label={t("imageWorkbench.addReference")}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {!references.length && t(isReferenceDragActive ? "videoWorkbench.dropReferences" : "videoWorkbench.noImages")}
                                </Button>
                            </div>
                        </div>
                        <div className={`${styles.field} ${styles.references}`} style={{ display: mediaLimits.video.max === 0 ? "none" : undefined }}>
                            <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                                <label>
                                    {t("videoWorkbench.videoReferences")}{" "}
                                    <span className={styles.muted}>
                                        {mediaCountLabel(videoReferences.length, mediaLimits.video.max)}
                                    </span>
                                </label>
                            </div>
                            <div className={styles.referenceList}>
                                {videoReferences.map((item, index) => (
                                    <div key={item.id} className={`${styles.reference} ${styles.videoReference}`}>
                                        <video src={item.url} muted preload="metadata" />
                                        <ReferenceOrderButtons index={index} total={videoReferences.length} onMove={(offset) => setVideoReferences((value) => moveListItem(value, index, offset))} />
                                        <Tooltip title={t("videoWorkbench.removeVideo")}>
                                            <Button size="small" icon={<X size={12} />} aria-label={`${t("videoWorkbench.removeVideo")} ${item.name}`} onClick={() => setVideoReferences((value) => value.filter((ref) => ref.id !== item.id))} />
                                        </Tooltip>
                                    </div>
                                ))}
                                <Button
                                    disabled={videoReferences.length >= mediaLimits.video.max}
                                    className={videoReferences.length ? styles.upload : styles.dropzone}
                                    icon={<VideoIcon size={18} />}
                                    aria-label={t("videoWorkbench.videoReferences")}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {!videoReferences.length && t(isReferenceDragActive ? "videoWorkbench.dropReferences" : "videoWorkbench.noVideos")}
                                </Button>
                            </div>
                        </div>
                        <div className={`${styles.field} ${styles.references}`} style={{ display: mediaLimits.audio.max === 0 ? "none" : undefined }}>
                            <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                                <label>
                                    {t("videoWorkbench.audioReferences")}{" "}
                                    <span className={styles.muted}>
                                        {mediaCountLabel(audioReferences.length, mediaLimits.audio.max)}
                                    </span>
                                </label>
                            </div>
                            <div className={styles.referenceList}>
                                {audioReferences.map((item, index) => (
                                    <div key={item.id} className={styles.audioReference}>
                                        <div className={styles.audioTitle}>
                                            <Music2 size={13} className="shrink-0" />
                                            <span className={styles.audioName}>{item.name}</span>
                                            <span className={styles.muted}>{formatDuration(item.durationMs || 0)}</span>
                                        </div>
                                        <audio src={item.url} controls preload="metadata" />
                                        <ReferenceOrderButtons index={index} total={audioReferences.length} onMove={(offset) => setAudioReferences((value) => moveListItem(value, index, offset))} />
                                        <Tooltip title={t("videoWorkbench.removeAudio")}>
                                            <Button size="small" icon={<X size={12} />} aria-label={`${t("videoWorkbench.removeAudio")} ${item.name}`} onClick={() => setAudioReferences((value) => value.filter((ref) => ref.id !== item.id))} />
                                        </Tooltip>
                                    </div>
                                ))}
                                <Button
                                    disabled={audioReferences.length >= mediaLimits.audio.max}
                                    className={audioReferences.length ? styles.upload : styles.dropzone}
                                    icon={<Music2 size={18} />}
                                    aria-label={t("videoWorkbench.audioReferences")}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {!audioReferences.length && t(isReferenceDragActive ? "videoWorkbench.dropReferences" : "videoWorkbench.noAudio")}
                                </Button>
                            </div>
                        </div>
                        <div className={styles.prompt}>
                            <div className={styles.field}>
                                <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                                    <label htmlFor="image-prompt">{t("imageWorkbench.promptLabel")}</label>
                                    <Tooltip title={t("workbench.viewPrompts")}>
                                        <Button type="text" size="small" icon={<BookOpen size={14} />} onClick={() => setPromptDialogOpen(true)}>
                                            {t("imageWorkbench.promptLibrary")}
                                        </Button>
                                    </Tooltip>
                                </div>
                                <Input.TextArea
                                    id="image-prompt"
                                    value={prompt}
                                    onChange={(event) => setPrompt(event.target.value)}
                                    rows={4}
                                    placeholder={t("videoWorkbench.promptPlaceholder")}
                                    onKeyDown={(event) => {
                                        if (!event.nativeEvent.isComposing && (event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                            event.preventDefault();
                                            if (canGenerate && !running) void generate();
                                        }
                                    }}
                                />
                            </div>
                            <div className={styles.promptFooter}>
                                <span>{t("imageWorkbench.promptHint")}</span>
                                <kbd>Ctrl / ⌘ ↵</kbd>
                            </div>
                        </div>
                    </div>
                    <div className={styles.generate}>
                        <VideoGenerationSettings />
                        <Button type="primary" loading={running} disabled={!canGenerate || running} icon={!running && <Wand2 size={16} />} onClick={() => void generate()}>
                            {t(running ? "workbench.generating" : "workbench.generate")}
                            {!running && estimatedPriceLabel ? <span className="ml-1 font-mono text-xs opacity-80">（{estimatedPriceLabel}）</span> : null}
                        </Button>
                    </div>
                </section>
                <section className={`${styles.gallery} thin-scrollbar`} aria-label={t("workbench.results")}>
                    <div className={`${styles.sectionHeader} ${styles.galleryHeader}`}>
                        <h2>
                            {t("workbench.results")}
                            <span className={styles.counter}>
                                {results.filter((result) => result.status === "success").length}
                                {results.length ? ` / ${results.length}` : ""}
                            </span>
                        </h2>
                        <div className={styles.actions}>
                            <span className={styles.resultStatus} role="status">
                                {running ? t("workbench.waiting", { time: formatDuration(elapsedMs) }) : null}
                            </span>
                            <Tooltip title={t("imageWorkbench.localHistoryHint")}>
                                <Button type="text" className={styles.historyButton} icon={<History size={15} />} aria-pressed={logsOpen} onClick={() => setLogsOpen(true)}>
                                    {t("workbench.logs")}
                                    {logs.length > 0 && <span className={styles.counter}>{logs.length}</span>}
                                </Button>
                            </Tooltip>
                        </div>
                    </div>
                    {results.length ? (
                        <div className={styles.grid}>
                            {results.map((result, index) =>
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
                        <div className={styles.empty}>
                            <div className={styles.emptyIcon}>
                                <VideoIcon size={30} strokeWidth={1.25} />
                            </div>
                            <h3>{t("videoWorkbench.title")}</h3>
                            <p className="!max-w-none">{t("videoWorkbench.empty")}</p>
                            <Button icon={<BookOpen size={14} />} onClick={() => setPromptDialogOpen(true)}>
                                {t("imageWorkbench.explorePrompts")}
                            </Button>
                        </div>
                    )}
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept={acceptedMediaTypes}
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="right" closable={{ placement: "end" }} size={400} open={logsOpen} onClose={() => setLogsOpen(false)} styles={{ wrapper: { maxWidth: "100vw" }, body: { ...appearance.style, padding: 20 } }}>
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
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function ResultVideoCard({ video, onDownload, onSaveAsset }: { video: GeneratedVideo; onDownload: (video: GeneratedVideo) => void; onSaveAsset: (video: GeneratedVideo) => void }) {
    const { t } = useTranslation();
    return (
        <article className={styles.result}>
            <video src={video.url} controls className="aspect-video w-full bg-black object-contain" />
            <div className={styles.metadata}>
                <span>
                    {video.width} × {video.height} · {formatBytes(video.bytes)}
                </span>
                <span>{formatDuration(video.durationMs)}</span>
            </div>
            <div className={styles.resultActions}>
                <Button type="text" size="small" icon={<FolderPlus size={14} />} onClick={() => onSaveAsset(video)}>
                    {t("common.addToAssets")}
                </Button>
                <Button type="text" size="small" icon={<Download size={14} />} onClick={() => onDownload(video)}>
                    {t("common.download")}
                </Button>
            </div>
        </article>
    );
}

function PendingVideoCard() {
    const { t } = useTranslation();
    return (
        <div className={styles.pending} style={{ aspectRatio: "16 / 9" }} role="status">
            <LoaderCircle className="size-5 animate-spin" />
            <span>{t("workbench.generating")}</span>
        </div>
    );
}

function FailedVideoCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className={styles.failed} role="alert">
            <Typography.Text type="danger">{t("workbench.failed")}</Typography.Text>
            <Typography.Paragraph ellipsis={{ rows: 4, expandable: true }} type="secondary">
                {error}
            </Typography.Paragraph>
            <Button onClick={onRetry}>{t("workbench.retry")}</Button>
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
            <div className="mb-3 flex flex-wrap gap-1">
                <Button size="small" type="text" className="!h-7 !rounded-lg !px-2.5 !text-xs" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" type="text" className="!h-7 !rounded-lg !px-2.5 !text-xs" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" type="text" danger className="!h-7 !rounded-lg !px-2.5 !text-xs" icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-1.5">
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
                {!logs.length ? <div className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const thumbnails = (log.references || []).filter((item) => item.dataUrl || item.storageKey).slice(0, 3);

    return (
        <div className={styles.log} data-active={active}>
            <Checkbox checked={selected} aria-label={t("imageWorkbench.selectLog", { title: log.title })} onChange={(event) => onSelectedChange(event.target.checked)} />
            <button type="button" className={styles.logButton} aria-pressed={active} onClick={onClick}>
                {thumbnails[0] ? (
                    <img src={previewUrlFor(thumbnails[0].storageKey) || thumbnails[0].dataUrl} alt="" />
                ) : (
                    <span className={styles.logIcon}>
                        <VideoIcon size={20} />
                    </span>
                )}
                <span className={styles.logText}>
                    <span className={styles.logTitle}>{log.title}</span>
                    <span className={styles.logMeta}>
                        {t(`workbench.${log.status === "success" ? "success" : log.status === "pending" ? "generating" : "failed"}`)} · {resolutionLabel(log.resolution)} · {log.seconds}s
                    </span>
                    <span className={styles.logMeta}>{log.time}</span>
                </span>
            </button>
        </div>
    );
}

function serializeLog(log: GenerationLog): GenerationLog {
    return {
        ...log,
        references: log.references.map((item) => ({ ...item, dataUrl: item.storageKey ? "" : item.dataUrl })),
        videoReferences: (log.videoReferences || []).map((item) => (item.storageKey ? { ...item, url: "" } : item)),
        audioReferences: (log.audioReferences || []).map((item) => (item.storageKey ? { ...item, url: "" } : item)),
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

/** 有模型上限时显示「当前数 / 上限」，未声明上限时只显示当前数。 */
function mediaCountLabel(count: number, max: number) {
    return Number.isFinite(max) ? `${count} / ${max}` : String(count);
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    const { t } = useTranslation();
    if (total <= 1) return null;
    return (
        <div className={styles.referenceOrder}>
            <Button
                size="small"
                className="!h-5 !w-5 !min-w-5 !rounded-lg !bg-white/85 !p-0 !shadow-sm dark:!bg-stone-900/85"
                aria-label={t("videoWorkbench.moveEarlier")}
                icon={<ArrowLeft className="size-2.5" />}
                disabled={index <= 0}
                onClick={() => onMove(-1)}
            />
            <Button
                size="small"
                className="!h-5 !w-5 !min-w-5 !rounded-lg !bg-white/85 !p-0 !shadow-sm dark:!bg-stone-900/85"
                aria-label={t("videoWorkbench.moveLater")}
                icon={<ArrowRight className="size-2.5" />}
                disabled={index >= total - 1}
                onClick={() => onMove(1)}
            />
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

function buildLog({
    prompt,
    model,
    config,
    references,
    videoReferences,
    audioReferences,
    durationMs,
    status,
    task,
    video,
    error,
}: {
    prompt: string;
    model: string;
    config: AiConfig;
    references: ReferenceImage[];
    videoReferences: ReferenceVideo[];
    audioReferences: ReferenceAudio[];
    durationMs: number;
    status: GenerationLog["status"];
    task?: VideoGenerationTask;
    video?: GeneratedVideo;
    error?: string;
}): GenerationLog {
    const logConfig = {
        model: config.model,
        videoModel: config.videoModel,
        size: config.size,
        vquality: normalizeResolution(config.vquality),
        videoSeconds: config.videoSeconds,
        videoGenerateAudio: config.videoGenerateAudio,
        videoWatermark: config.videoWatermark,
        videoMode: config.videoMode === "text" || config.videoMode === "reference" ? config.videoMode : "frames",
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
        videoReferences,
        audioReferences,
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
        videoMode: config.videoMode === "text" || config.videoMode === "reference" ? config.videoMode : "frames",
    };
}

function normalizeVideoSeconds(value: string) {
    if (String(value).trim() === "-1") return "-1";
    return clampVideoSeconds(value);
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return "auto";
    if (/^\d+x\d+$/.test(value || "")) return value;
    const ratio = inferVideoRatio(value);
    return ratio === "auto" ? "auto" : computeVideoSize("720", ratio);
}

function normalizeResolution(value: string) {
    return resolutionToken(value);
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
    const videoReferences = await Promise.all((log.videoReferences || []).map(async (item) => ({ ...item, url: item.storageKey ? await resolveMediaUrl(item.storageKey, item.url) : item.url })));
    const audioReferences = await Promise.all((log.audioReferences || []).map(async (item) => ({ ...item, url: item.storageKey ? await resolveMediaUrl(item.storageKey, item.url) : item.url })));
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
        videoReferences,
        audioReferences,
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
