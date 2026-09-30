import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Clock, Download, MoreVertical, Pencil, Sparkles, Trash2, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Dropdown, Input } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";

import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { hasAgentUrlBootstrap } from "@/lib/agent/agent-url-bootstrap";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews } from "@/services/image-storage";
import { resolveMediaUrl } from "@/services/file-storage";

/**
 * 从画布工程中查找最合适作为卡片封面的素材：
 * 优先取最新有内容的图片节点，其次取视频节点。
 */
function extractProjectCoverMeta(nodes: CanvasNodeData[]) {
    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.type === CanvasNodeType.Image) {
            const meta = node.metadata;
            const primaryId = meta?.primaryImageId;
            const images = meta?.images || [];
            const primary = images.find((img) => img.id === primaryId) || images[0];
            const content = primary?.content || meta?.content;
            const storageKey = primary?.storageKey || meta?.storageKey;
            if (content || storageKey) {
                return { type: "image" as const, content, storageKey };
            }
        }
    }

    for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        if (node.type === CanvasNodeType.Video) {
            const content = node.metadata?.content;
            const storageKey = node.metadata?.storageKey;
            if (content || storageKey) {
                return { type: "video" as const, content, storageKey };
            }
        }
    }

    return null;
}

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);

    // 订阅缩略图状态更新
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);

    const coverMeta = useMemo(() => extractProjectCoverMeta(project.nodes), [project.nodes]);
    const [resolvedUrl, setResolvedUrl] = useState<string>("");

    useEffect(() => {
        let active = true;
        if (!coverMeta) {
            setResolvedUrl("");
            return;
        }

        if (coverMeta.type === "image") {
            const preview = previewUrlFor(coverMeta.storageKey);
            if (preview) {
                setResolvedUrl(preview);
                return;
            }
            if (coverMeta.storageKey) {
                void ensureImagePreview(coverMeta.storageKey).then((url) => {
                    if (active && url) setResolvedUrl(url);
                });
                void resolveImageUrl(coverMeta.storageKey, coverMeta.content || "").then((url) => {
                    if (active && url) setResolvedUrl((prev) => prev || url);
                });
            } else if (coverMeta.content) {
                setResolvedUrl(coverMeta.content);
            }
        } else if (coverMeta.type === "video") {
            if (coverMeta.storageKey) {
                void resolveMediaUrl(coverMeta.storageKey, coverMeta.content || "").then((url) => {
                    if (active && url) setResolvedUrl(url);
                });
            } else if (coverMeta.content) {
                setResolvedUrl(coverMeta.content);
            }
        }

        return () => {
            active = false;
        };
    }, [coverMeta]);

    const open = () => {
        const agentHash = hasAgentUrlBootstrap(window.location.hash) ? window.location.hash : "";
        navigate(`/canvas/${project.id}${searchParams.toString() ? `?${searchParams.toString()}` : ""}${agentHash}`, { replace: Boolean(agentHash) });
    };

    const saveTitle = () => {
        renameProject(project.id, editingTitle);
        stopEditing();
    };

    const menuItems: MenuProps["items"] = [
        {
            key: "rename",
            label: t("canvas.project.rename"),
            icon: <Pencil className="size-3" />,
            onClick: () => startEditing(project.id, project.title),
        },
        {
            key: "export",
            label: t("canvas.project.export"),
            icon: <Download className="size-3" />,
            onClick: () => void exportCanvasProjects([project], project.title || t("canvas.title")),
        },
        {
            type: "divider",
        },
        {
            key: "delete",
            label: t("canvas.project.delete"),
            icon: <Trash2 className="size-3" />,
            danger: true,
            onClick: () => setDeleteIds([project.id]),
        },
    ];

    const formattedDate = useMemo(() => {
        try {
            return new Date(project.updatedAt).toLocaleString(i18n.resolvedLanguage, {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return project.updatedAt;
        }
    }, [i18n.resolvedLanguage, project.updatedAt]);

    return (
        <article
            className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200 cursor-pointer ${
                selected
                    ? "border-stone-900 shadow-md ring-2 ring-stone-900/10 dark:border-stone-100 dark:ring-stone-100/20"
                    : "border-stone-200/80 bg-white hover:border-stone-300 hover:shadow-md dark:border-stone-800/80 dark:bg-[#191817] dark:hover:border-stone-700 dark:hover:shadow-stone-950/40"
            }`}
            onClick={() => !editing && open()}
        >
            {/* 顶部图片/素材封面区域 */}
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-100 dark:bg-stone-900/40">
                {resolvedUrl ? (
                    coverMeta?.type === "video" ? (
                        <video
                            src={resolvedUrl}
                            muted
                            playsInline
                            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                        />
                    ) : (
                        <img
                            src={resolvedUrl}
                            alt={project.title}
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                        />
                    )
                ) : (
                    // 封面无图片时的空卡片展示：使用项目 Logo 图标
                    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-stone-100/90 via-stone-50 to-[#ebe7df]/60 dark:from-[#201e1b] dark:via-[#1a1917] dark:to-[#151413]">
                        <div className="flex size-11 items-center justify-center rounded-xl border border-stone-200/70 bg-white/80 shadow-xs backdrop-blur-xs dark:border-stone-800/80 dark:bg-stone-800/80">
                            <img src="/logo.png" alt="Logo" className="size-6 object-contain opacity-80 block dark:hidden" />
                            <img src="/logo-dark.png" alt="Logo" className="hidden size-6 object-contain opacity-80 dark:block" />
                        </div>
                    </div>
                )}

                {/* 悬停时的遮罩渐变 */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                {/* 左上角轻量选择框 */}
                <div
                    className={`absolute left-2.5 top-2.5 z-10 transition-opacity duration-150 ${
                        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => toggleSelected(project.id, event => e.stopPropagation()) || toggleSelected(project.id, !selected)}
                        className="size-3.5 cursor-pointer rounded accent-stone-900 shadow-xs dark:accent-stone-100"
                        aria-label={t("canvas.project.select", { name: project.title })}
                    />
                </div>

                {/* 右上角精致微型操作按钮 */}
                <div
                    className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
                        <button
                            type="button"
                            className="flex size-6.5 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-md transition hover:bg-black/60 dark:bg-stone-900/80 dark:hover:bg-stone-800"
                            aria-label="更多操作"
                        >
                            <MoreVertical className="size-3.5" />
                        </button>
                    </Dropdown>
                </div>
            </div>

            {/* 卡片下半部分：小云雀风格 —— 标题与时间在同一行单行通栏精致排布 */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-2 min-h-[34px]">
                {editing ? (
                    <div className="flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <Input
                            size="small"
                            className="text-xs font-medium"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                            autoFocus
                        />
                        <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<Check className="size-3" />}
                            onClick={saveTitle}
                            aria-label={t("canvas.project.saveName")}
                        />
                        <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<X className="size-3" />}
                            onClick={stopEditing}
                            aria-label={t("canvas.project.cancelRename")}
                        />
                    </div>
                ) : (
                    <>
                        <h2
                            className="min-w-0 flex-1 truncate text-xs font-medium text-stone-800 group-hover:text-stone-950 dark:text-stone-200 dark:group-hover:text-white transition-colors"
                            title={project.title}
                        >
                            {project.title}
                        </h2>
                        <time
                            className="shrink-0 text-[11px] text-stone-400 dark:text-stone-500 tabular-nums"
                            title={project.updatedAt}
                        >
                            {formattedDate}
                        </time>
                    </>
                )}
            </div>
        </article>
    );
}


