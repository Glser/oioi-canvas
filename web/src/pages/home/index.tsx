import { useRef, useState, useEffect, useTransition } from "react";
import { App, Button, Dropdown, Input, Tabs, Tooltip, Modal, Upload } from "antd";
import type { MenuProps } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bot,
    ArrowUp,
    Download,
    FileText,
    FileUp,
    FolderKanban,
    History,
    Image as ImageIcon,
    LayoutGrid,
    Maximize2,
    MessageSquare,
    Music2,
    Plus,
    Search,
    Sparkles,
    Trash2,
    Video,
    Wand2,
} from "lucide-react";

import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { CanvasProjectCard } from "@/components/canvas/canvas-project-card";
import { CanvasDeleteProjectsDialog } from "@/components/canvas/canvas-delete-projects-dialog";
import { exportCanvasProjects } from "@/lib/canvas/canvas-export";
import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import type { CanvasExportFile } from "@/types/canvas-export";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { useAgentStore } from "@/stores/use-agent-store";
import { fetchPrompts } from "@/services/api/prompts";

let homeModeBootstrapped = false;

export default function IndexPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const updateProject = useCanvasStore((state) => state.updateProject);

    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    const agentConnected = useAgentStore((state) => state.connected);
    const togglePanel = useAgentStore((state) => state.togglePanel);

    const [inputPrompt, setInputPrompt] = useState("");
    const [quickPrompts, setQuickPrompts] = useState<string[]>([
        "赛博朋克风格未来雨夜都市，霓虹灯倒影，电影质感光影",
        "超写实中国古典水墨画，孤舟蓑笠翁，远山云雾缭绕",
        "极简几何艺术海报，高饱和度撞色，立体质感排版",
        "3D皮克斯可爱黏土小怪物角色设计，柔和柔光工作室照明",
    ]);

    useEffect(() => {
        void fetchPrompts({ pageSize: 50 }).then((res) => {
            if (res.items && res.items.length > 0) {
                // Shuffle and pick top 4
                const shuffled = [...res.items].sort(() => 0.5 - Math.random());
                const selected = shuffled.slice(0, 4).map(item => item.prompt || item.title);
                if (selected.length > 0) {
                    setQuickPrompts(selected);
                }
            }
        }).catch(() => {
            // keep default on error
        });
    }, []);
    const [searchKeyword, setSearchKeyword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!hydrated || homeModeBootstrapped) return;
        const mode = searchParams.get("mode") || "";
        if (!["new", "recent", "choose"].includes(mode)) return;
        homeModeBootstrapped = true;
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("mode");
        const search = nextParams.toString() ? `?${nextParams.toString()}` : "";
        const hash = window.location.hash;
        if (mode === "choose") {
            navigate({ pathname: "/", search, hash }, { replace: true });
            return;
        }
        const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (mode === "recent" && recent) {
            navigate({ pathname: `/canvas/${recent.id}`, search, hash }, { replace: true });
            return;
        }
        const id = createProject(t("canvas.defaultTitle", { count: projects.length + 1 }));
        navigate({ pathname: `/canvas/${id}`, search, hash }, { replace: true });
    }, [createProject, hydrated, navigate, projects, searchParams, t]);

    // 新建并进入画布
    const handleCreateProject = () => {
        const id = createProject(t("canvas.defaultTitle", { count: projects.length + 1 }));
        navigate(`/canvas/${id}`);
    };

    // 从首页对话框快速启动生成/新建画布
    const handlePromptSubmit = () => {
        const prompt = inputPrompt.trim();
        if (!prompt || submitting) return;

        setSubmitting(true);
        try {
            // 创建一个新画布，以用户输入的前十几个字命名或默认名
            const title = prompt.length > 20 ? `${prompt.slice(0, 20)}...` : prompt;
            const newId = createProject(title);

            // 在画布中央放置一个文本节点作为灵感/提示词
            const initialTextNode: CanvasNodeData = {
                id: `text-${Date.now()}`,
                type: CanvasNodeType.Text,
                title: t("assets.kinds.text"),
                position: { x: 0, y: 0 },
                width: 380,
                height: 220,
                metadata: {
                    content: prompt,
                    prompt: prompt,
                    status: "success",
                },
            };

            updateProject(newId, {
                nodes: [initialTextNode],
            });

            navigate(`/canvas/${newId}`);
        } catch {
            message.error(t("apiErrors.requestFailed"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handlePromptSubmit();
        }
    };

    // 导入工程
    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(t("canvas.imported", { count: data.projects.length }));
        } catch {
            message.error(t("canvas.importFailed"));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // 筛选作品（根据标题关键词即时过滤）
    const filteredProjects = projects.filter((project) => {
        return !searchKeyword.trim() || project.title.toLowerCase().includes(searchKeyword.toLowerCase());
    });



    const batchActionMenu: MenuProps["items"] = [
        {
            key: "export",
            label: t("canvas.exportSelected"),
            icon: <Download className="size-4" />,
            onClick: () => {
                const selectedProjects = projects.filter((p) => selectedIds.includes(p.id));
                void exportCanvasProjects(selectedProjects, `${t("canvas.title")}-${selectedIds.length}`);
            },
        },
        {
            key: "delete",
            label: t("canvas.deleteSelected"),
            icon: <Trash2 className="size-4" />,
            danger: true,
            onClick: () => setDeleteIds(selectedIds),
        },
    ];

    return (
        <main className="relative h-full overflow-y-auto bg-stone-50/50 text-stone-950 dark:bg-[#141413] dark:text-stone-100">
            <style>{`
                @keyframes homeTitleShimmer {
                    0% {
                        background-position: 150% 0;
                    }
                    100% {
                        background-position: -50% 0;
                    }
                }
                .home-title-shimmer {
                    background-size: 200% 100%;
                    animation: homeTitleShimmer 2.8s linear infinite;
                    background-clip: text;
                    -webkit-background-clip: text;
                    color: transparent;
                }
            `}</style>
            {/* 低调柔和的点状粒子网格背景 (28px 间隔，1px 细腻低亮粒子，不喧宾夺主) */}
            <div
                className="pointer-events-none absolute inset-0 z-0 text-stone-950/[0.12] dark:text-stone-300/[0.2]"
                style={{
                    backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                }}
            />
            {/* 顶部英雄区 & AI 创作交互对话框 (小云雀 / Liblib 融合风格) */}
            <section className="relative z-10 mx-auto w-full max-w-5xl px-6 pt-16 pb-8 text-center md:pt-[100px] md:pb-12">
                {/* 装饰渐变光晕背景 */}
                <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 -z-10 h-72 w-full max-w-3xl rounded-full bg-gradient-to-tr from-amber-500/10 via-sky-500/10 to-indigo-500/10 blur-3xl dark:from-amber-400/5 dark:via-sky-400/5 dark:to-indigo-500/5" />

                <div className="flex items-center justify-center gap-2.5 sm:gap-3.5">
                    <img src="/logo.png" alt="Logo" className="size-7 sm:size-8 md:w-[clamp(36px,3.5vw,56px)] md:h-[clamp(36px,3.5vw,56px)] shrink-0 object-contain block dark:hidden" />
                    <img src="/logo-dark.png" alt="Logo" className="hidden size-7 sm:size-8 md:w-[clamp(36px,3.5vw,56px)] md:h-[clamp(36px,3.5vw,56px)] shrink-0 object-contain dark:block" />
                    <h1 className="flex items-center text-xl font-bold leading-none tracking-tight sm:text-2xl md:text-[clamp(24px,2.5vw,40px)] translate-y-2">
                        <span className="home-title-shimmer select-none bg-[linear-gradient(110deg,#1c1917_0%,#1c1917_35%,#a8a29e_47%,#ffffff_50%,#a8a29e_53%,#1c1917_65%,#1c1917_100%)] dark:bg-[linear-gradient(110deg,#d6d3d1_0%,#d6d3d1_35%,#78716c_47%,#ffffff_50%,#78716c_53%,#d6d3d1_65%,#d6d3d1_100%)]">
                            探索无限灵感，推演极致视界
                        </span>
                    </h1>
                </div>

                {/* 核心多模态创作对话入口 (类似小云雀/Liblib) */}
                <div className="relative mx-auto mt-7 max-w-3xl rounded-3xl border border-stone-200/80 bg-white p-3 shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all focus-within:border-stone-400 focus-within:shadow-[0_8px_40px_rgb(0,0,0,0.12)] dark:border-stone-700/80 dark:bg-[#1a1918] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] dark:focus-within:border-stone-500">
                    <div className="flex gap-1">
                        <textarea
                            value={inputPrompt}
                            onChange={(e) => setInputPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={5}
                            placeholder="描述你想要的画面，或构想一个场景、故事... 按 Enter 快速开启画布推演"
                            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500/80 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        />
                        <div className="flex flex-col pt-1 pr-1">
                            <Tooltip title="展开大窗口编辑">
                                <Button
                                    type="text"
                                    size="small"
                                    className="!text-stone-400 hover:!text-stone-600 dark:hover:!text-stone-300"
                                    icon={<Maximize2 className="size-3.5" />}
                                    onClick={() => setIsExpanded(true)}
                                />
                            </Tooltip>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-0">
                        {/* 左侧辅助模式与操作入口 */}
                        <div className="flex items-center gap-1.5">
                            <Tooltip title="上传素材">
                                <Upload
                                    showUploadList={false}
                                    beforeUpload={(file) => {
                                        message.info("素材上传功能即将支持: " + file.name);
                                        return false;
                                    }}
                                >
                                    <Button
                                        type="text"
                                        size="small"
                                        className="!flex !items-center justify-center !w-7 !h-7 !p-0 text-stone-500 hover:!text-stone-800 hover:!bg-stone-100 dark:text-stone-400 dark:hover:!text-stone-200 dark:hover:!bg-stone-800/50 rounded-full"
                                        icon={<Plus className="size-4" />}
                                    />
                                </Upload>
                            </Tooltip>
                            <Tooltip title={agentConnected ? "Agent已连接就绪" : "请先在环境启动 Codex Agent"}>
                                <Button
                                    type="text"
                                    size="small"
                                    className={`!flex !items-center !gap-1 text-xs rounded-full ${agentConnected ? "!text-indigo-600 dark:!text-indigo-400 hover:!bg-indigo-50 dark:hover:!bg-indigo-900/30" : "text-stone-500 hover:!text-stone-800 hover:!bg-stone-100 dark:text-stone-400 dark:hover:!text-stone-200 dark:hover:!bg-stone-800/50"}`}
                                    icon={<Bot className="size-4" />}
                                    onClick={togglePanel}
                                >
                                    Agent
                                </Button>
                            </Tooltip>
                        </div>

                        {/* 右侧提交与启动按钮 */}
                        <div className="flex items-center gap-2">
                            <span className="hidden text-xs text-stone-400 sm:inline">Enter 发送</span>
                            <Button
                                type="primary"
                                shape="round"
                                icon={submitting ? undefined : <ArrowUp className="size-4" />}
                                loading={submitting}
                                disabled={!inputPrompt.trim()}
                                onClick={handlePromptSubmit}
                                className="!h-8 px-4 font-medium"
                            >
                                开启创作
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 快捷灵感标签 */}
                <div className="mx-auto mt-3.5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
                    <span className="text-xs text-stone-400">试试灵感：</span>
                    {quickPrompts.map((p, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setInputPrompt(p)}
                            className="inline-flex items-center gap-1 rounded-full border border-stone-200/50 bg-white/60 px-3 py-1 text-xs text-stone-600 transition-all hover:scale-[1.02] hover:border-stone-300 hover:bg-white shadow-sm dark:border-stone-800/50 dark:bg-stone-900/50 dark:text-stone-300 dark:hover:border-stone-700/80 dark:hover:bg-stone-800/80 backdrop-blur-sm"
                        >
                            <Wand2 className="size-3 opacity-60" />
                            <span className="max-w-[200px] truncate sm:max-w-[260px]">{p}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* 下方：作品记录与画布项目管理 (极简紧凑展示) */}
            <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-2">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 pb-4 dark:border-stone-800/80">
                    <div className="flex items-center gap-2">
                        <FolderKanban className="size-4.5 shrink-0 text-stone-500 dark:text-stone-400 -translate-y-[0.5px]" />
                        <span className="text-base font-semibold leading-none text-stone-900 dark:text-stone-100">
                            最近作品
                        </span>
                        {projects.length > 0 && (
                            <span className="text-xs leading-none text-stone-400">
                                ({projects.length})
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* 紧凑搜索框 */}
                        <div className="w-40 sm:w-48">
                            <Input
                                prefix={<Search className="size-3.5 text-stone-400" />}
                                placeholder="搜索作品..."
                                allowClear
                                size="small"
                                value={searchKeyword}
                                onChange={(e) => setSearchKeyword(e.target.value)}
                                className="rounded-md text-xs"
                            />
                        </div>

                        {/* 多选批量操作 */}
                        {selectedIds.length > 0 && (
                            <Dropdown menu={{ items: batchActionMenu }} trigger={["click"]}>
                                <Button size="small">
                                    已选 {selectedIds.length} 项
                                </Button>
                            </Dropdown>
                        )}

                        {/* 导入工程 */}
                        <Button
                            size="small"
                            icon={<FileUp className="size-3.5" />}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {t("canvas.import")}
                        </Button>

                        {/* 新建工程按钮 */}
                        <Button
                            type="primary"
                            size="small"
                            icon={<Plus className="size-3.5" />}
                            onClick={handleCreateProject}
                        >
                            {t("canvas.create")}
                        </Button>
                    </div>
                </div>

                {/* 画布卡片网格列表 */}
                {!hydrated ? (
                    <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-stone-200 text-sm text-stone-500 dark:border-stone-800">
                        {t("canvas.loading")}
                    </div>
                ) : filteredProjects.length > 0 ? (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredProjects.map((project) => (
                            <CanvasProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                ) : (
                    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 py-12 text-center dark:border-stone-800">
                        <LayoutGrid className="size-10 text-stone-300 dark:text-stone-600 mb-3" />
                        <h3 className="text-base font-medium text-stone-800 dark:text-stone-200">
                            {searchKeyword ? "未找到符合条件的画布" : t("canvas.empty")}
                        </h3>
                        <p className="mt-1 max-w-sm text-xs text-stone-500">
                            {searchKeyword ? "尝试更换关键字进行检索" : t("canvas.emptyDescription")}
                        </p>
                        {!searchKeyword && (
                            <Button
                                type="primary"
                                className="mt-4"
                                icon={<Plus className="size-4" />}
                                onClick={handleCreateProject}
                            >
                                {t("canvas.create")}
                            </Button>
                        )}
                    </div>
                )}
            </section>

            <input
                ref={fileInputRef}
                type="file"
                accept="application/zip,.zip"
                className="hidden"
                onChange={(e) => void importCanvas(e.target.files?.[0])}
            />
            <CanvasDeleteProjectsDialog />

            <Modal
                title="扩展提示词编辑"
                open={isExpanded}
                onCancel={() => setIsExpanded(false)}
                footer={[
                    <Button key="cancel" onClick={() => setIsExpanded(false)}>
                        取消
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        onClick={() => {
                            setIsExpanded(false);
                        }}
                    >
                        确认
                    </Button>
                ]}
                width={800}
                centered
                destroyOnClose
            >
                <div className="pt-4 pb-2">
                    <Input.TextArea
                        value={inputPrompt}
                        onChange={(e) => setInputPrompt(e.target.value)}
                        placeholder="在这里输入更长、更详细的提示词..."
                        autoSize={{ minRows: 12, maxRows: 24 }}
                        className="!bg-stone-50 dark:!bg-[#141413] !text-base"
                    />
                </div>
            </Modal>
        </main>
    );
}
