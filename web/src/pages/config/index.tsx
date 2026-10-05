import { useTranslation } from "react-i18next";
import { AppConfigPanel } from "@/components/layout/app-config-modal";

export default function ConfigPage() {
    const { t } = useTranslation();

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-stone-50/50 text-stone-950 dark:bg-[#141413] dark:text-stone-100">
            {/* 低调柔和的点状粒子网格背景 (沿用首页 21.6px 间隔与细腻低亮粒子) */}
            <div
                className="pointer-events-none absolute inset-0 z-0 text-stone-900/[0.18] dark:text-[#f4f4f4]/[0.19]"
                style={{
                    backgroundImage: "radial-gradient(circle, currentColor 0.72px, transparent 0.87px)",
                    backgroundSize: "21.6px 21.6px",
                }}
            />
            <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 pt-20 pb-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-5xl">
                    <div className="mb-6">
                        <h1 className="text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">{t("config.title")}</h1>
                        <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">{t("config.description")}</p>
                    </div>
                    <div className="rounded-3xl border border-black/[0.06] bg-white/80 p-5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] backdrop-blur-md sm:p-7 dark:border-white/[0.08] dark:bg-stone-900/60 dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
                        <AppConfigPanel />
                    </div>
                </div>
            </main>
        </div>
    );
}
