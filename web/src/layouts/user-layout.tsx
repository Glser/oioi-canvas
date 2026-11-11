import { useMemo, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import { useLocation } from "react-router-dom";
import { getWorkbenchAppearance, isWorkbenchPath } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";

export default function UserLayout({ children }: { children: ReactNode }) {
    const { pathname } = useLocation();
    const theme = useThemeStore((state) => state.theme);
    const appearance = useMemo(() => getWorkbenchAppearance(theme === "dark"), [theme]);
    const workbench = isWorkbenchPath(pathname);
    return (
        <ConfigProvider {...(workbench ? { theme: appearance.theme, tooltip: appearance.tooltip, popover: appearance.popover, drawer: appearance.drawer, modal: appearance.modal } : {})}>
        <div className="relative flex h-dvh overflow-hidden bg-background text-foreground" style={workbench ? appearance.style : undefined}>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            <AgentPanel />
        </div>
        </ConfigProvider>
    );
}
