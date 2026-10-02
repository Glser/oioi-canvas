import { Bot, Menu } from "lucide-react";
import { Tooltip } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/use-agent-store";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    return (
        <>
            {!hideHeader ? (
                <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-center px-4 transition-all duration-300 pointer-events-none">
                    {/* 移动端菜单与徽标 (窄屏展示) */}
                    <div className="flex md:hidden w-full items-center justify-between pointer-events-auto">
                        <button
                            type="button"
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-stone-600 transition hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label={t("topNav.openMenu")}
                            title={t("topNav.menu")}
                        >
                            <Menu className="size-4.5" />
                        </button>
                        <Link
                            to="/"
                            className="flex items-center rounded-xl p-1 transition-transform duration-200 hover:scale-105"
                            aria-label="OiOi Canvas"
                            title="OiOi Canvas"
                        >
                            <img src="/logo.png" alt="Logo" className="size-6.5 shrink-0 object-contain dark:hidden" />
                            <img src="/logo-dark.png" alt="Logo" className="hidden size-6.5 shrink-0 object-contain dark:block" />
                        </Link>
                    </div>

                    {/* 桌面端：全部整合并居中的一体化无背景悬浮岛屿 (Single Center Nav Island) */}
                    <div className="hidden md:flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white/75 p-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-white/[0.12] dark:bg-stone-900/70 dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] pointer-events-auto">
                        {/* 1. 项目 Logo */}
                        <Link
                            to="/"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-105"
                            aria-label="OiOi Canvas"
                            title="OiOi Canvas"
                        >
                            <img src="/logo.png" alt="Logo" className="size-6 shrink-0 object-contain dark:hidden" />
                            <img src="/logo-dark.png" alt="Logo" className="hidden size-6 shrink-0 object-contain dark:block" />
                        </Link>

                        <div className="h-4 w-px bg-stone-300/60 dark:bg-stone-700/60 mx-0.5" />

                        {/* 2. 页面与业务导航工具 */}
                        <nav className="flex items-center gap-1">
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Tooltip key={tool.slug} title={panelOpen ? t(`navigation.${tool.slug}`) : undefined} mouseEnterDelay={0.3}>
                                        <Link
                                            to={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex h-8.5 items-center rounded-full text-[13px] font-medium transition-all duration-200 select-none",
                                                panelOpen ? "px-2.5 justify-center" : "gap-2 px-3.5",
                                                active
                                                    ? "bg-white text-stone-950 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:bg-stone-800 dark:text-stone-50 dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
                                                    : "text-stone-600 hover:text-stone-950 hover:bg-black/[0.03] dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-white/[0.04]",
                                            )}
                                            aria-label={t(`navigation.${tool.slug}`)}
                                        >
                                            <Icon className={cn("size-4 transition-transform duration-200", active ? "scale-105" : "opacity-75")} />
                                            {!panelOpen ? <span className="hidden lg:inline">{t(`navigation.${tool.slug}`)}</span> : null}
                                        </Link>
                                    </Tooltip>
                                );
                            })}
                        </nav>

                        <div className="h-4 w-px bg-stone-300/60 dark:bg-stone-700/60 mx-0.5" />

                        {/* 3. Agent 开关 */}
                        <Tooltip title={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}>
                            <button
                                type="button"
                                onClick={togglePanel}
                                className={cn(
                                    "group flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-all duration-200",
                                    panelOpen
                                        ? "bg-purple-500/15 text-purple-600 dark:bg-purple-500/25 dark:text-purple-300 font-semibold"
                                        : "text-stone-600 hover:bg-black/[0.04] hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-stone-100",
                                )}
                                aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}
                            >
                                <Bot className="size-4 transition-transform duration-200 group-hover:scale-110" />
                                <span className="hidden sm:inline">Agent</span>
                            </button>
                        </Tooltip>

                        <div className="h-3.5 w-px bg-stone-300/60 dark:bg-stone-700/60 mx-0.5" />

                        {/* 4. 状态与快捷操作（移除重复设置按钮，通过 showConfig={false}） */}
                        <UserStatusActions variant="embedded" showConfig={false} />
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
