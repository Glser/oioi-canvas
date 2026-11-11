import pageStyles from "./prompts.module.css";
import styles from "@/components/layout/workbench.module.css";
import { FolderPlus, Search } from "lucide-react";
import { type ReactNode, type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Input, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "./components/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { useAssetStore } from "@/stores/use-asset-store";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success(t("common.addedToAssets"));
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <div className="h-full overflow-hidden">
            <main className={`${styles.library} ${pageStyles.page}`}>
                    <div className={`${styles.libraryHeader} ${pageStyles.header}`}>
                        <h1 className="text-2xl font-semibold text-foreground">{t("prompts.title")}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t("prompts.total", { count: totalPrompts })}</p>
                    </div>
                    <div className={pageStyles.columns}>
                        <aside className={`${styles.panel} ${pageStyles.filters}`}>
                            <PromptFilter label={t("prompts.category")} options={promptCategoryOptions} selected={selectedCategory} onChange={setSelectedCategory} />
                            <div className="mt-6">
                                <div className="mb-2 text-xs font-medium text-muted-foreground">{t("prompts.tags")}</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {promptTags.map((tag) => {
                                        const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                                        return <Tag.CheckableTag key={tag} checked={active} className={styles.filterTag} onChange={() => toggleTag(tag)}>{tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}</Tag.CheckableTag>;
                                    })}
                                </div>
                            </div>
                        </aside>
                        <section className={pageStyles.results} onScroll={handleListScroll}>
                            <div className={pageStyles.search}>
                            <Input size="large" prefix={<Search className="size-4 text-muted-foreground" />} value={titleKeyword} placeholder={t("prompts.search")} onChange={(event) => setTitleKeyword(event.target.value)} />
                            </div>
                            {query.isLoading ? <div className="flex h-60 items-center justify-center"><Spin /></div> : null}
                            {!query.isLoading ? <div><PromptGrid items={promptItems} onOpen={setSelectedPrompt} renderActions={(item) => <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>{t("common.addToAssets")}</Button>} onCopy={(item) => copyText(item.prompt, t("common.promptCopied"))} emptyText={t("prompts.empty")} /></div> : null}
                            <div className="mt-6 text-center text-xs text-muted-foreground">{query.isFetchingNextPage ? t("prompts.loading") : query.hasNextPage ? t("prompts.loadMore") : promptItems.length > 0 ? t("prompts.end") : null}</div>
                        </section>
                    </div>
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, t("common.promptCopied"))} onSaveAsset={savePromptAsset} />
        </div>
    );
}

function PromptFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string; onChange: (value: string) => void }) {
    const { t } = useTranslation();
    return <div><div className="mb-2 text-xs font-medium text-muted-foreground">{label}</div><div className="flex flex-wrap gap-1.5">{options.map((option) => <Tag.CheckableTag key={option} checked={selected === option} className={styles.filterTag} onChange={() => onChange(option)}>{option === ALL_PROMPTS_OPTION ? t("common.all") : option}</Tag.CheckableTag>)}</div></div>;
}

function PromptGrid({ items, onOpen, onCopy, renderActions, emptyText }: { items: Prompt[]; onOpen: (item: Prompt) => void; onCopy: (item: Prompt) => void; renderActions: (item: Prompt) => ReactNode; emptyText: string }) {
    return <div><div className={styles.collectionGrid}>{items.map((item) => <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => onOpen(item)} onCopy={() => onCopy(item)} extraAction={renderActions(item)} />)}</div>{items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} className="py-16" /> : null}</div>;
}
