import { ArrowLeft, BookOpen, CheckSquare, Download, FolderPlus, History, ImagePlus, Image as ImageIcon, LoaderCircle, PenLine, Plus, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Input, Modal, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { GenerationSettings } from "./components/generation-settings";
import { GridReveal } from "./components/generation-loading";
import styles from "@/components/layout/workbench.module.css";
import resultStyles from "./image-results.module.css";
import { ImageDetailModal } from "@/components/image-detail-modal";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import { getGenerationCount } from "@/lib/canvas/canvas-generation-helpers";
import { imageModelSettings } from "@/lib/image-model-settings";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
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
    prompt?: string;
    model?: string;
    quality?: string;
    generationType?: string;
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

const RECENT_IMAGE_LIMIT = 10;
const logStore = localforage.createInstance({ name: "oioi-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const galleryRef = useRef<HTMLElement>(null);
    const revealingImageIdsRef = useRef(new Set<string>());
    const dragDepthRef = useRef(0);
    const theme = useThemeStore((state) => state.theme);
    const appearance = useMemo(() => getWorkbenchAppearance(theme === "dark"), [theme]);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [previewResult, setPreviewResult] = useState<{ image: GeneratedImage; index: number } | null>(null);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [imageToDelete, setImageToDelete] = useState<GeneratedImage | null>(null);
    const [deletingImage, setDeletingImage] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = getGenerationCount(effectiveConfig.canvasImageCount);
    const visibleResults = useMemo<GenerationResult[]>(() => {
        if (previewLog) return previewLog.images.map((image) => ({ id: `${previewLog.id}:${image.id}`, status: "success", image }));
        const savedImageIds = new Set(logs.flatMap((log) => log.images.map((image) => image.id)));
        const currentResults = new Map(results.filter((result) => result.image).map((result) => [result.image!.id, result]));
        const recentResults: GenerationResult[] = logs.flatMap((log) => log.images.map((image) => currentResults.get(image.id) ?? { id: `${log.id}:${image.id}`, status: "success" as const, image }));
        return [...results.filter((result) => !result.image || !savedImageIds.has(result.image.id)), ...recentResults].slice(0, RECENT_IMAGE_LIMIT);
    }, [logs, results, previewLog]);

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        let cancelled = false;
        void readStoredLogs().then((storedLogs) => {
            if (!cancelled) setLogs((current) => [...current, ...storedLogs.filter((log) => !current.some((item) => item.id === log.id))].sort((a, b) => b.createdAt - a.createdAt));
        }).finally(() => { if (!cancelled) setLogsLoading(false); });
        return () => { cancelled = true; };
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
        if (!isAiConfigReady(effectiveConfig, model, "image")) {
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
        galleryRef.current?.scrollTo({ top: 0 });
        const slots: GenerationResult[] = Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" }));
        setResults((value) => [...slots, ...value.filter((item) => item.status === "success")]);
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        const tasks = slots.map((slot) => runGenerationSlot(slot.id, snapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
        if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? undefined : error });

        try {
            await saveLog(
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
            metadata: { source: "image-page", prompt: image.prompt },
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
        if (running) return;
        setLogsOpen(false);
        setPrompt("");
        setReferences([]);
        setResults((value) => value.filter((item) => item.status === "success"));
        setPreviewResult(null);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = async () => {
        const deletedImages = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images);
        const imageKeys = deletedImages.map((image) => image.storageKey).filter((key): key is string => Boolean(key));
        await Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]);
        setLogs((value) => value.filter((log) => !selectedLogIds.includes(log.id)));
        const deletedImageIds = new Set(deletedImages.map((image) => image.id));
        setResults((value) => value.filter((result) => !result.image || !deletedImageIds.has(result.image.id)));
        setPreviewResult(null);
        if (previewLog && selectedLogIds.includes(previewLog.id)) {
            setPreviewLog(null);
        }
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const deleteResultImage = async () => {
        if (!imageToDelete || running || deletingImage) return;
        setDeletingImage(true);
        try {
            const log = logs.find((item) => item.images.some((image) => image.id === imageToDelete.id));
            if (log) {
                const images = log.images.filter((image) => image.id !== imageToDelete.id);
                const nextLog = { ...log, images, imageCount: images.length, successCount: images.length };
                await logStore.setItem(log.id, serializeLog(nextLog));
                setLogs((value) => value.map((item) => item.id === log.id ? nextLog : item));
                setPreviewLog((value) => value?.id === log.id ? nextLog : value);
            }
            // 底层文件交给现有未引用资源清理，避免影响素材或画布中的引用。
            setResults((value) => value.filter((result) => result.image?.id !== imageToDelete.id));
            setPreviewResult((value) => value?.image.id === imageToDelete.id ? null : value);
            setImageToDelete(null);
            message.success(t("imageWorkbench.imageDeleted"));
        } catch {
            message.error(t("imageWorkbench.imageDeleteFailed"));
        } finally {
            setDeletingImage(false);
        }
    };

    const saveLog = async (log: GenerationLog) => {
        try {
            await logStore.setItem(log.id, serializeLog(log));
            setLogs((value) => [log, ...value].sort((a, b) => b.createdAt - a.createdAt));
            const savedImageIds = new Set(log.images.map((image) => image.id));
            setResults((value) => value.filter((result) => !result.image || !savedImageIds.has(result.image.id)));
        } catch {
            message.error(t("imageWorkbench.historySaveFailed"));
        }
    };

    const previewGenerationLog = (log: GenerationLog) => {
        setPreviewLog(log);
        setPreviewResult(null);
        setLogsOpen(false);
        galleryRef.current?.scrollTo({ top: 0 });
    };

    const reuseGenerationLog = (log: GenerationLog) => {
        setPrompt(log.prompt);
        setReferences(log.references || []);
        updateConfig("imageModel", log.config.imageModel || log.model);
        updateConfig("quality", log.config.quality);
        updateConfig("size", log.config.size);
        updateConfig("canvasImageCount", log.config.count);
        message.success(t("imageWorkbench.configApplied"));
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!isAiConfigReady(effectiveConfig, model, "image")) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, quality: imageModelSettings(effectiveConfig, model).quality ? effectiveConfig.quality : "auto", count: String(generationCount) }, references: [...references] };
    };

    const runGenerationSlot = async (id: string, snapshot: { text: string; config: AiConfig; references: ReferenceImage[] }) => {
        const itemStartedAt = performance.now();
        try {
            const singleConfig = { ...snapshot.config, count: "1" };
            const result = snapshot.references.length ? await requestEdit(singleConfig, snapshot.text, snapshot.references) : await requestGeneration(singleConfig, snapshot.text);
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl);
            const nextImage: GeneratedImage = { id: image.id, dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: performance.now() - itemStartedAt, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType, prompt: snapshot.text, model: snapshot.config.model, quality: snapshot.config.quality, generationType: snapshot.references.length ? "图生图" : "文生图" };
            revealingImageIdsRef.current.add(nextImage.id);
            setResults((value) => updateResult(value, id, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResult(value, id, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (id: string) => {
        if (running) return;
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setRunning(true);
        setElapsedMs(0);
        setResults((value) => updateResult(value, id, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        setStartedAt(retryStartedAt);
        try {
            const image = await runGenerationSlot(id, snapshot);
            await saveLog(
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
        } finally {
            setRunning(false);
        }
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
                        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
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
                            <h1>{t("imageWorkbench.title")}</h1>
                            <Tooltip title={t("imageWorkbench.newSessionHint")}>
                                <Button type="text" size="small" icon={<Plus size={15} />} disabled={running} onClick={createSession}>{t("workbench.new")}</Button>
                            </Tooltip>
                        </header>
                        <div className={`${styles.editor} thin-scrollbar`}>
                            <div className={`${styles.field} ${styles.references}`}>
                                <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                                    <label>{t("imageWorkbench.referenceLabel")} <span className={styles.muted}>{references.length || t("imageWorkbench.optional")}</span></label>
                                    <Tooltip title={t("workbench.viewAssets")}>
                                        <Button type="text" size="small" icon={<FolderPlus size={14} />} onClick={() => setAssetPickerOpen(true)}>{t("imageWorkbench.fromAssets")}</Button>
                                    </Tooltip>
                                </div>
                                <div className={styles.referenceList}>
                                    {references.map((item) => (
                                        <div key={item.id} className={styles.reference}>
                                            <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} />
                                            <Tooltip title={t("imageWorkbench.removeReference")}>
                                                <Button size="small" icon={<X size={12} />} aria-label={`${t("imageWorkbench.removeReference")} ${item.name}`} onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))} />
                                            </Tooltip>
                                        </div>
                                    ))}
                                    <Button className={references.length ? styles.upload : styles.dropzone} icon={<ImagePlus size={18} />} aria-label={t("imageWorkbench.addReference")} onClick={() => fileInputRef.current?.click()}>
                                        {!references.length && t(isReferenceDragActive ? "imageWorkbench.dropHere" : "imageWorkbench.uploadHint")}
                                    </Button>
                                </div>
                            </div>
                            <div className={styles.prompt}>
                                <div className={styles.field}>
                                    <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                                        <label htmlFor="image-prompt">{t("imageWorkbench.promptLabel")}</label>
                                        <Tooltip title={t("workbench.viewPrompts")}>
                                            <Button type="text" size="small" icon={<BookOpen size={14} />} onClick={() => setPromptDialogOpen(true)}>{t("imageWorkbench.promptLibrary")}</Button>
                                        </Tooltip>
                                    </div>
                                    <Input.TextArea
                                        id="image-prompt"
                                        value={prompt}
                                        onChange={(event) => setPrompt(event.target.value)}
                                        rows={4}
                                        placeholder={t("imageWorkbench.promptPlaceholder")}
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
                            <GenerationSettings />
                            <Button type="primary" loading={running} disabled={!canGenerate || running} icon={!running && <Wand2 size={16} />} onClick={() => void generate()}>
                                {t(running ? "workbench.generating" : "workbench.generate")}
                            </Button>
                        </div>
                    </section>
                    <section ref={galleryRef} className={`${styles.gallery} thin-scrollbar`} aria-label={t("workbench.results")}>
                        <div className={`${styles.sectionHeader} ${styles.galleryHeader} ${resultStyles.header}`}>
                            <div className={resultStyles.heading}>
                                <h2>{t(previewLog ? "imageWorkbench.viewingHistory" : "imageWorkbench.recentResults")}<span className={styles.counter}>{visibleResults.filter((result) => result.status === "success").length}</span></h2>
                                {!previewLog && <p className={resultStyles.hint}>{t("imageWorkbench.recentHint", { count: RECENT_IMAGE_LIMIT })}</p>}
                            </div>
                            <div className={`${styles.actions} ${resultStyles.headerActions}`}>
                                {previewLog && <Button type="text" size="small" icon={<ArrowLeft size={14} />} onClick={() => { setPreviewLog(null); galleryRef.current?.scrollTo({ top: 0 }); }}>{t("imageWorkbench.backToRecent")}</Button>}
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
                        {previewLog ? (
                            <div className={resultStyles.historyContext}>
                                <div className={resultStyles.historySummary}>
                                    <strong>{previewLog.title}</strong>
                                    <span>{previewLog.time}</span>
                                </div>
                                <Button size="small" disabled={running} onClick={() => reuseGenerationLog(previewLog)}>{t("imageWorkbench.reuseConfig")}</Button>
                            </div>
                        ) : null}
                        {logsLoading && !visibleResults.length ? (
                            <div className={styles.empty} role="status"><LoaderCircle className="size-5 animate-spin" /><p>{t("imageWorkbench.loadingResults")}</p></div>
                        ) : visibleResults.length ? (
                            <div className={resultStyles.grid}>
                                {visibleResults.map((result, index) =>
                                    result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} disabled={running} onRetry={() => void retryResult(result.id)} />
                                    ) : (
                                        <ResultImageCard key={result.id} image={result.image} index={index} reveal={!previewLog && (!result.image || revealingImageIdsRef.current.has(result.image.id))} onRevealEnd={() => { if (result.image) revealingImageIdsRef.current.delete(result.image.id); }} onPreview={() => { if (result.image) setPreviewResult({ image: result.image, index }); }} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} onDelete={setImageToDelete} deleteDisabled={running} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className={styles.empty}>
                                <div className={styles.emptyIcon}><ImageIcon size={30} strokeWidth={1.25} /></div>
                                <h3>{t(previewLog ? "imageWorkbench.historyEmpty" : "imageWorkbench.emptyTitle")}</h3>
                                <p className={resultStyles.emptyHint}>{t(previewLog ? "imageWorkbench.historyEmptyHint" : "imageWorkbench.emptyHint")}</p>
                                {!previewLog && <Button icon={<BookOpen size={14} />} onClick={() => setPromptDialogOpen(true)}>{t("imageWorkbench.explorePrompts")}</Button>}
                            </div>
                        )}
                    </section>
                </main>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void addReferences(event.target.files); event.target.value = ""; }} />
                <Drawer
                    title={t("workbench.logs")}
                    placement="right"
                    closable={{ placement: "end" }}
                    size={400}
                    open={logsOpen}
                    onClose={() => setLogsOpen(false)}
                    styles={{ wrapper: { maxWidth: "100vw" }, body: { ...appearance.style, padding: 20 } }}
                >
                    <LogPanel running={running} logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={previewGenerationLog} />
                </Drawer>
                <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
                <ImageDetailModal
                    image={previewResult ? { ...previewResult.image, url: previewResult.image.dataUrl, title: t("imageWorkbench.resultTitle", { count: previewResult.index + 1 }) } : null}
                    open={Boolean(previewResult)}
                    onClose={() => setPreviewResult(null)}
                    onSaveAsset={() => { if (previewResult) void saveResultToAssets(previewResult.image, previewResult.index); }}
                />
                <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
                <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                    {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
                </Modal>
                <Modal title={t("imageWorkbench.deleteImage")} open={Boolean(imageToDelete)} onCancel={() => { if (!deletingImage) setImageToDelete(null); }} onOk={deleteResultImage} confirmLoading={deletingImage} okText={t("common.delete")} okButtonProps={{ danger: true, disabled: running }} cancelText={t("common.cancel")} cancelButtonProps={{ disabled: deletingImage }}>
                    {t("imageWorkbench.deleteImageConfirm")}
                </Modal>
            </div>
    );
}

function ResultImageCard({
    image,
    index,
    reveal,
    onRevealEnd,
    onPreview,
    onEdit,
    onDownload,
    onSaveAsset,
    onDelete,
    deleteDisabled,
}: {
    image?: GeneratedImage;
    index: number;
    reveal: boolean;
    onRevealEnd: () => void;
    onPreview: () => void;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
    onDelete: (image: GeneratedImage) => void;
    deleteDisabled: boolean;
}) {
    const { t } = useTranslation();
    const [revealFinished, setRevealFinished] = useState(false);
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const finishReveal = () => {
        setRevealFinished(true);
        onRevealEnd();
    };
    return (
        <article className={styles.result}>
            <button type="button" className={resultStyles.preview} disabled={!image} onClick={onPreview} aria-label={image ? t("imageWorkbench.resultAlt", { count: index + 1 }) : t("workbench.generating")}>
                {!image || (reveal && !revealFinished) ? (
                    <GridReveal src={image?.dataUrl} aspect={4 / 3} caption={t("workbench.generating")} role={image ? undefined : "status"} aria-label={image ? undefined : t("workbench.generating")} onRevealComplete={finishReveal} onError={finishReveal} />
                ) : (
                    <img src={revealFinished ? image.dataUrl : previewUrlFor(image.storageKey) || image.dataUrl} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} loading="lazy" />
                )}
            </button>
            {image && <>
            <div className={styles.metadata}>
                <span>{image.width} × {image.height} · {formatBytes(image.bytes)}</span>
                <span>{formatDuration(image.durationMs)}</span>
            </div>
            <div className={styles.resultActions}>
                <Tooltip title={t("imageWorkbench.addReference")}>
                    <Button type="text" size="small" icon={<PenLine size={14} />} onClick={() => onEdit(image, index)}>{t("imageWorkbench.addReference")}</Button>
                </Tooltip>
                <div className={styles.actions}>
                    <Tooltip title={t("common.addToAssets")}>
                        <Button type="text" size="small" icon={<FolderPlus size={15} />} aria-label={t("common.addToAssets")} onClick={() => onSaveAsset(image, index)} />
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <Button type="text" size="small" icon={<Download size={15} />} aria-label={t("common.download")} onClick={() => onDownload(image, index)} />
                    </Tooltip>
                    <Tooltip title={t(deleteDisabled ? "imageWorkbench.deleteAfterGeneration" : "imageWorkbench.deleteImage")}>
                        <Button type="text" size="small" danger disabled={deleteDisabled} icon={<Trash2 size={15} />} aria-label={t("imageWorkbench.deleteImage")} onClick={() => onDelete(image)} />
                    </Tooltip>
                </div>
            </div>
            </>}
        </article>
    );
}

function FailedImageCard({ error, disabled, onRetry }: { error: string; disabled: boolean; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className={`${styles.failed} ${resultStyles.placeholder}`} role="alert">
            <Typography.Text type="danger">{t("workbench.failed")}</Typography.Text>
            <Typography.Paragraph ellipsis={{ rows: 4, expandable: true }} type="secondary">{error}</Typography.Paragraph>
            <Button disabled={disabled} onClick={onRetry}>{t("workbench.retry")}</Button>
        </div>
    );
}

function updateResult(results: GenerationResult[], id: string, next: Partial<GenerationResult>) {
    return results.map((item) => (item.id === id ? { ...item, ...next } : item));
}

function LogPanel({
    running,
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
}: {
    running: boolean;
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
        <div className={styles.history}>
            <div className={styles.historyToolbar}>
                <Button size="small" type="text" icon={<Plus size={14} />} disabled={running} onClick={onCreateSession}>{t("workbench.new")}</Button>
                <div className={styles.actions}>
                    <Button size="small" type="text" icon={<CheckSquare size={14} />} disabled={!logs.length} onClick={toggleAll}>{allSelected ? t("common.cancel") : t("workbench.selectAll")}</Button>
                    <Tooltip title={t("workbench.deleteLogs")}>
                        <Button size="small" type="text" danger icon={<Trash2 size={14} />} aria-label={t("workbench.deleteLogs")} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                            {selectedLogIds.length || null}
                        </Button>
                    </Tooltip>
                </div>
            </div>
            {logs.map((log) => (
                <LogCard key={log.id} log={log} selected={selectedLogIds.includes(log.id)} active={activeLogId === log.id} onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))} onClick={() => onPreviewLog(log)} />
            ))}
            {!logs.length && <div className={styles.empty}><History size={24} className={styles.muted} /><p className="mt-4">{t("workbench.noLogs")}</p></div>}
        </div>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const thumbnail = log.images[0] || log.references[0];
    return (
        <div className={styles.log} data-active={active}>
            <Checkbox checked={selected} aria-label={t("imageWorkbench.selectLog", { title: log.title })} onChange={(event) => onSelectedChange(event.target.checked)} />
            <button type="button" className={styles.logButton} aria-pressed={active} onClick={onClick}>
                {thumbnail ? <img src={previewUrlFor(thumbnail.storageKey) || thumbnail.dataUrl} alt="" /> : <span className={styles.logIcon}><ImagePlus size={20} /></span>}
                <span className={styles.logText}>
                    <span className={styles.logTitle}>{log.title}</span>
                    <span className={styles.logMeta}>{t("workbench.itemCount", { count: log.imageCount })} · {formatDuration(log.durationMs)}{log.failCount ? ` · ${t("workbench.failCount", { count: log.failCount })}` : ""}</span>
                    <span className={styles.logMeta}>{log.time}</span>
                </span>
            </button>
        </div>
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
    const config = normalizeLogConfig(log);
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl), prompt: log.prompt, model: log.model || config.imageModel, quality: config.quality, generationType: references.length ? "图生图" : "文生图" };
        }),
    );
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




