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
    const [isScrolled, setIsScrolled] = useState(false);
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

    // 只有首页整页下滚才收缩导航。生图/视频等工作台的 main、提示词框、结果区滑动都不该触发。
    useEffect(() => {
        if (pathname !== "/") {
            setIsScrolled(false);
            return;
        }
        let ticking = false;
        const handleScroll = (event: Event) => {
            const target = event.target;
            const isDocument = target === document || target === document.documentElement || target === document.body;
            const isHomeMain = target instanceof HTMLElement && target.tagName === "MAIN";
            if (!isDocument && !isHomeMain) return;
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const top = isDocument ? window.scrollY || document.documentElement.scrollTop : (target as HTMLElement).scrollTop;
                if (top > 32) setIsScrolled(true);
                else if (top < 12) setIsScrolled(false);
                ticking = false;
            });
        };

        window.addEventListener("scroll", handleScroll, true);
        return () => window.removeEventListener("scroll", handleScroll, true);
    }, [pathname]);

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    const isCompact = panelOpen || isScrolled;

    return (
        <>
            {!hideHeader ? (
                <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-center px-4 pointer-events-none">
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

                    {/* 桌面端：一体化毛玻璃悬浮岛屿 (基于 CSS Grid 0fr->1fr 物理级平滑伸缩) */}
                    <div
                        className={cn(
                            "hidden md:flex items-center rounded-full border border-black/[0.08] bg-white/80 p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] backdrop-blur-xl pointer-events-auto transition-[gap,box-shadow] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] dark:border-white/[0.12] dark:bg-stone-900/75 dark:shadow-[0_4px_28px_rgba(0,0,0,0.45)]",
                            isCompact ? "gap-1 shadow-[0_8px_32px_rgba(0,0,0,0.12)]" : "gap-1.5",
                        )}
                    >
                        {/* 1. 项目 Logo */}
                        <Link
                            to="/"
                            className="flex size-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 hover:scale-105 active:scale-95"
                            aria-label="OiOi Canvas"
                            title="OiOi Canvas"
                        >
                            <img src="/logo.png" alt="Logo" className="size-6 shrink-0 object-contain translate-x-0.5 -translate-y-0.5 dark:hidden" />
                            <img src="/logo-dark.png" alt="Logo" className="hidden size-6 shrink-0 object-contain translate-x-0.5 -translate-y-0.5 dark:block" />
                        </Link>

                        <div className="h-4 w-px bg-stone-300/60 dark:bg-stone-700/60 mx-0.5 transition-colors duration-300" />

                        {/* 2. 页面与业务导航工具 */}
                        <nav className="flex items-center gap-1">
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                const titleText = t(`navigation.${tool.slug}`);
                                return (
                                    <Tooltip key={tool.slug} title={isCompact ? titleText : undefined} mouseEnterDelay={0.2}>
                                        <Link
                                            to={`/${tool.slug}`}
                                            className={cn(
                                                "relative flex h-8.5 min-w-8.5 items-center justify-center rounded-full px-2.5 text-[13px] font-medium select-none transition-colors duration-300",
                                                active
                                                    ? "bg-white text-stone-950 shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:bg-stone-800 dark:text-stone-50 dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
                                                    : "text-stone-600 hover:text-stone-950 hover:bg-black/[0.03] dark:text-stone-400 dark:hover:text-stone-100 dark:hover:bg-white/[0.04]",
                                            )}
                                            aria-label={titleText}
                                        >
                                            <Icon className={cn("size-4 shrink-0", active ? "scale-105" : "opacity-75")} />
                                            <div
                                                className={cn(
                                                    "grid transition-[grid-template-columns] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]",
                                                    isCompact ? "grid-cols-[0fr]" : "grid-cols-[1fr]",
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "min-w-0 overflow-hidden whitespace-nowrap pl-2 pointer-events-none transition-opacity duration-300 ease-out",
                                                        isCompact ? "opacity-0" : "opacity-100 delay-100",
                                                    )}
                                                >
                                                    {titleText}
                                                </span>
                                            </div>
                                        </Link>
                                    </Tooltip>
                                );
                            })}
                        </nav>

                        <div className="h-4 w-px bg-stone-300/60 dark:bg-stone-700/60 mx-0.5 transition-colors duration-300" />

                        {/* 3. Agent 开关 */}
                        <Tooltip title={isCompact ? t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent") : undefined} mouseEnterDelay={0.2}>
                            <button
                                type="button"
                                onClick={togglePanel}
                                className={cn(
                                    "group flex h-8.5 min-w-8.5 items-center justify-center rounded-full px-2.5 text-[13px] font-medium transition-colors duration-300",
                                    panelOpen
                                        ? "bg-purple-500/15 text-purple-600 dark:bg-purple-500/25 dark:text-purple-300 font-semibold"
                                        : "text-stone-600 hover:bg-black/[0.04] hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.08] dark:hover:text-stone-100",
                                )}
                                aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}
                            >
                                <Bot className="size-4 shrink-0 transition-transform duration-300 group-hover:scale-110" />
                                <div
                                    className={cn(
                                        "grid transition-[grid-template-columns] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]",
                                        isCompact ? "grid-cols-[0fr]" : "grid-cols-[1fr]",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "min-w-0 overflow-hidden whitespace-nowrap pl-1.5 pointer-events-none transition-opacity duration-300 ease-out",
                                            isCompact ? "opacity-0" : "opacity-100 delay-100",
                                        )}
                                    >
                                        Agent
                                    </span>
                                </div>
                            </button>
                        </Tooltip>

                        <div className="h-3.5 w-px bg-stone-300/60 dark:bg-stone-700/60 mx-0.5 transition-colors duration-300" />

                        {/* 4. 状态与快捷操作 */}
                        <UserStatusActions variant="embedded" showConfig={false} />
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
