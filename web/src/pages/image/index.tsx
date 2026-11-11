import { BookOpen, CheckSquare, Download, FolderPlus, History, ImagePlus, Image as ImageIcon, LoaderCircle, PenLine, Plus, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Image, Input, Modal, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { GenerationSettings } from "./components/generation-settings";
import styles from "@/components/layout/workbench.module.css";
import { getWorkbenchAppearance } from "@/lib/app-theme";
import { getGenerationCount } from "@/lib/canvas/canvas-generation-helpers";
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

const LOG_STORE_KEY = "oioi-canvas:image_generation_logs";
const logStore = localforage.createInstance({ name: "oioi-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
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
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = getGenerationCount(effectiveConfig.count);

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
        if (running) return;
        setLogsOpen(false);
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
        return { text, config: { ...effectiveConfig, model, count: String(generationCount) }, references: [...references] };
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
                    <section className={`${styles.gallery} thin-scrollbar`} aria-label={t("workbench.results")}>
                        <div className={`${styles.sectionHeader} ${styles.galleryHeader}`}>
                            <h2>{t("workbench.results")}<span className={styles.counter}>{results.filter((result) => result.status === "success").length}{results.length ? ` / ${results.length}` : ""}</span></h2>
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
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard key={result.id} image={result.image} index={index} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={() => retryResult(index)} />
                                    ) : <PendingImageCard key={result.id} />,
                                )}
                            </div>
                        ) : (
                            <div className={styles.empty}>
                                <div className={styles.emptyIcon}><ImageIcon size={30} strokeWidth={1.25} /></div>
                                <h3>{t("imageWorkbench.emptyTitle")}</h3>
                                <p>{t("imageWorkbench.emptyHint")}</p>
                                <Button icon={<BookOpen size={14} />} onClick={() => setPromptDialogOpen(true)}>{t("imageWorkbench.explorePrompts")}</Button>
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
                    <LogPanel running={running} logs={logs} selectedLogIds={selectedLogIds} activeLogId={previewLog?.id} onSelectedLogIdsChange={setSelectedLogIds} onCreateSession={createSession} onDeleteSelected={() => setDeleteConfirmOpen(true)} onPreviewLog={(log) => void previewGenerationLog(log)} />
                </Drawer>
                <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={setPrompt} />
                <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
                <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                    {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
                </Modal>
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
        <article className={styles.result}>
            <div className={styles.image}>
                <Image src={previewUrlFor(image.storageKey) || image.dataUrl} preview={{ src: image.dataUrl }} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} />
            </div>
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
                </div>
            </div>
        </article>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return <div className={styles.pending} role="status"><LoaderCircle className="size-5 animate-spin" /><span>{t("workbench.generating")}</span></div>;
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className={styles.failed} role="alert">
            <Typography.Text type="danger">{t("workbench.failed")}</Typography.Text>
            <Typography.Paragraph ellipsis={{ rows: 4, expandable: true }} type="secondary">{error}</Typography.Paragraph>
            <Button onClick={onRetry}>{t("workbench.retry")}</Button>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
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




