import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { GlassFolder, type GlassFolderHandle } from "@/components/glass-folder/GlassFolder";
import { useThemeStore } from "@/stores/use-theme-store";

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
    const { t } = useTranslation();
    const navigate = useNavigate();
    const theme = useThemeStore((state) => state.theme);
    const [searchParams] = useSearchParams();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

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

    const menuItems: MenuProps["items"] = [
        {
            key: "rename",
            label: t("canvas.project.rename"),
            icon: <Pencil className="size-3" />,
            onClick: () => folderRef.current?.startEdit(),
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
            return new Date(project.updatedAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }).replace(/\//g, "-");
        } catch {
            return project.updatedAt;
        }
    }, [project.updatedAt]);

    // 刷新后 content 中的 blob: 已全部失效，文件扇出的图片依赖排队生成/加载的缩略图
    useEffect(() => {
        project.nodes.forEach((node) => {
            const media = extractProjectCoverMeta([node]);
            if (media?.type === "image" && media.storageKey) void ensureImagePreview(media.storageKey);
        });
    }, [project.nodes]);

    const files = project.nodes.filter((node) => node.type !== CanvasNodeType.Group).map((node) => {
        const media = extractProjectCoverMeta([node]);
        return { id: node.id, name: node.title, meta: getFileTypeLabel(node.type),
            url: media?.type === "image" ? previewUrlFor(media.storageKey) || aliveImageUrl(media.content) : undefined,
            type: media?.type };
    });

    // 文件夹真实打开状态（引擎根的 data-open）直接驱动封面按钮覆盖层翻转，与玻璃前盖严格同步；
    // 回调里只改 DOM style、不经过 React 状态，避免悬停触发重渲染打断引擎的文件展开过渡和媒体元素。
    const folderHost = useRef<HTMLDivElement>(null);
    const folderOverlay = useRef<HTMLDivElement>(null);
    const folderRef = useRef<GlassFolderHandle>(null);
    useEffect(() => {
        const host = folderHost.current?.querySelector<HTMLElement>("[data-motion-component='glass-folder']");
        // 引擎把 .gf-root 挂在 motion surface 的 shadow root 里
        const root = host?.firstElementChild?.shadowRoot?.querySelector<HTMLElement>(".gf-root");
        const overlay = folderOverlay.current;
        if (!root || !overlay) return;
        const apply = () => {
            overlay.style.transform = root.hasAttribute("data-open") ? "perspective(760px) rotateX(-24deg)" : "";
        };
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(root, { attributes: true, attributeFilter: ["data-open"] });
        return () => observer.disconnect();
    }, []);

    return (
        <article
            className="group relative flex min-w-0 flex-col rounded-xl transition-colors hover:z-20 focus-within:z-20"
            onClick={() => !editing && open()}
        >
            <div className="relative w-full" ref={folderHost}>
                <GlassFolder ref={folderRef} options={{ id: project.id, label: project.title, meta: t("canvas.project.elementCount", { count: files.length }), tone: theme, renamable: true,
                    openLabel: t("canvas.project.openCanvas", { name: project.title }), elementsLabel: t("canvas.project.elementCount", { count: files.length }),
                    coverUrl: resolvedUrl, coverType: coverMeta?.type, files, onOpen: () => open(),
                    onRename: (label) => renameProject(project.id, label) }} />

                {/* 跟随文件夹前盖翻转的覆盖层：几何与前盖一致（顶部 74/272、绕底铰链），打开时同角度掀开，静止保持平面 */}
                <div ref={folderOverlay} className="pointer-events-none absolute inset-x-0 bottom-0 top-[27.2%] z-10 origin-bottom [transition:transform_.8s_cubic-bezier(.34,1.36,.5,1)] motion-reduce:transition-none">
                    {/* 文件夹封面内侧的选择框 */}
                    <div
                        className={`pointer-events-auto absolute left-3 top-[21%] flex size-6.5 items-center justify-center transition-opacity duration-150 motion-reduce:transition-none ${
                            selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelected(project.id, !selected)}
                            className="size-3.5 cursor-pointer rounded accent-stone-900 shadow-xs dark:accent-stone-100"
                            aria-label={t("canvas.project.select", { name: project.title })}
                        />
                    </div>

                    {/* 文件夹封面内侧的管理入口 */}
                    <div
                        className="pointer-events-auto absolute right-3 top-[21%] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <Dropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight"
                            styles={{ root: theme === "dark" ? {
                                background: "rgba(30, 30, 34, .78)",
                                backdropFilter: "blur(24px) saturate(1.6)",
                                WebkitBackdropFilter: "blur(24px) saturate(1.6)",
                                border: "1px solid rgba(255, 255, 255, .1)",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), 0 0 0 .5px rgba(255,255,255,.08), 0 24px 48px -16px rgba(0,0,0,.7)",
                                borderRadius: 16,
                            } : {
                                background: "rgba(252, 252, 253, .78)",
                                backdropFilter: "blur(24px) saturate(1.6)",
                                WebkitBackdropFilter: "blur(24px) saturate(1.6)",
                                border: "1px solid rgba(255, 255, 255, .55)",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,.9), 0 0 0 .5px rgba(0,0,0,.12), 0 24px 48px -16px rgba(10,12,20,.42)",
                                borderRadius: 16,
                            } }}>
                            <button
                                type="button"
                                className="flex size-6.5 items-center justify-center rounded-lg border border-white/60 bg-white/85 text-stone-800 shadow-[inset_0_1px_0_#fff,inset_0_-2px_4px_rgba(0,0,0,.06),0_6px_14px_-6px_rgba(0,0,0,.3)] backdrop-blur-md transition hover:bg-white active:scale-95 dark:border-white/15 dark:bg-white/15 dark:text-stone-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_6px_14px_-6px_rgba(0,0,0,.55)] dark:hover:bg-white/25"
                                aria-label={t("canvas.project.moreActions")}
                            >
                                <MoreVertical className="size-3.5" />
                            </button>
                        </Dropdown>
                    </div>
                </div>
            </div>

            <time
                className="pointer-events-auto absolute bottom-[9.9%] right-4 z-10 text-[10px] font-medium tabular-nums text-white/80"
                onClick={(e) => e.stopPropagation()}
            >
                {formattedDate}
            </time>
        </article>
    );
}



function getFileTypeLabel(type: string) {
    return ({ image: i18n.t("canvas.nodeTypes.image"), video: i18n.t("canvas.nodeTypes.video"), audio: i18n.t("canvas.nodeTypes.audio"), text: i18n.t("canvas.nodeTypes.text"), config: i18n.t("canvas.nodeTypes.config") } as Record<string, string>)[type] || i18n.t("canvas.project.element");
}

// blob: URL 只在创建它的页面会话内有效，刷新后是死链；用作图片源会在加载失败时露出黑底。
function aliveImageUrl(content?: string) {
    return content && !content.startsWith("blob:") ? content : undefined;
}
