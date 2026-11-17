import type { CSSProperties } from "react";
import { Tooltip } from "antd";
import { BookOpen, Keyboard, Puzzle, Settings2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { NEW_API_ENABLED } from "@/constant/env";
import { useNewApiStore } from "@/stores/use-newapi-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas" | "embedded";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const { i18n, t } = useTranslation();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const accountName = useNewApiStore((state) => state.session?.user.display_name || state.session?.user.username);
    const docsLink = useNewApiStore((state) => state.docsLink);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass = "inline-flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-full text-stone-600 transition-all duration-200 hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });

    const containerClass =
        variant === "canvas"
            ? "inline-flex shrink-0 items-center gap-1"
            : variant === "embedded"
            ? "inline-flex shrink-0 items-center gap-0.5"
            : "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-black/[0.06] bg-stone-500/[0.04] p-0.5 shadow-sm backdrop-blur-xl dark:border-white/[0.08] dark:bg-white/[0.03]";

    return (
        <div className={containerClass}>
            {NEW_API_ENABLED ? (
                <Tooltip trigger={["hover", "focus"]} title={accountName || t("account.signIn")}>
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false, "channels")} aria-label={accountName ? t("account.accountName", { name: accountName }) : t("account.signIn")}>
                        <UserRound className="size-4" />
                    </button>
                </Tooltip>
            ) : null}
            {onOpenPlugins ? (
                <Tooltip trigger={["hover", "focus"]} title={t("topNav.plugins")}>
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label={t("topNav.plugins")}>
                        <Puzzle className="size-4" />
                    </button>
                </Tooltip>
            ) : null}
            {docsLink ? (
                <Tooltip trigger={["hover", "focus"]} title={t("topNav.docs")}>
                    <a href={docsLink} target="_blank" rel="noopener noreferrer" className={naturalIconClass} style={iconStyle} aria-label={t("topNav.docs")}>
                        <BookOpen className="size-4" />
                    </a>
                </Tooltip>
            ) : null}
            {showConfig ? (
                <Tooltip trigger={["hover", "focus"]} title={t("navigation.config")}>
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label={t("navigation.config")}>
                        <Settings2 className="size-4" />
                    </button>
                </Tooltip>
            ) : null}
            <Tooltip trigger={["hover", "focus"]} title={languageLabel} mouseEnterDelay={0.2}>
                <button type="button" className={`${naturalIconClass} text-xs font-semibold tracking-tight`} style={iconStyle} onClick={() => void changeAppLocale(nextLocale)} aria-label={languageLabel}>
                    {locale === "zh-CN" ? "中" : "EN"}
                </button>
            </Tooltip>
            <AnimatedThemeToggler theme={theme} onThemeChange={setTheme} className={naturalIconClass} style={iconStyle} aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")} />
            {onOpenShortcuts ? (
                <Tooltip trigger={["hover", "focus"]} title={t("topNav.shortcuts")}>
                    <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label={t("topNav.shortcuts")}>
                        <Keyboard className="size-4" />
                    </button>
                </Tooltip>
            ) : null}
        </div>
    );
}
