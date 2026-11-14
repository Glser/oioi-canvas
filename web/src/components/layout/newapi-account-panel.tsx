import { Alert, App, Button, Empty, Input, Skeleton } from "antd";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ModelIcon } from "@/components/model-icon";
import { NEW_API_BASE_URL } from "@/constant/env";
import { startNewApiLogin } from "@/services/api/newapi";
import { useNewApiStore } from "@/stores/use-newapi-store";

export function NewApiAccountPanel() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const session = useNewApiStore((state) => state.session);
    const status = useNewApiStore((state) => state.status);
    const error = useNewApiStore((state) => state.error);
    const token = useNewApiStore((state) => state.token);
    const models = useNewApiStore((state) => state.models);
    const connect = useNewApiStore((state) => state.connect);
    const logout = useNewApiStore((state) => state.logout);
    const [query, setQuery] = useState("");
    const [loggingOut, setLoggingOut] = useState(false);
    const visibleModels = models.filter((model) => model.id.toLowerCase().includes(query.trim().toLowerCase()));
    const loading = status === "idle" || status === "loading";

    const signOut = () => modal.confirm({
        title: t("account.signOutTitle"),
        content: t("account.signOutContent"),
        okText: t("account.signOut"),
        cancelText: t("common.cancel"),
        onOk: async () => {
            setLoggingOut(true);
            try {
                await logout();
            } catch (error) {
                message.error(error instanceof Error ? error.message : t("account.signOutFailed"));
                throw error;
            } finally {
                setLoggingOut(false);
            }
        },
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold">{session ? session.user.display_name || session.user.username : t("account.connectTitle")}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{session ? t("account.signedInHint") : t("account.anonymousHint")}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {session ? <Button icon={<LogOut className="size-4" />} loading={loggingOut} disabled={loading} onClick={signOut}>{t("account.signOut")}</Button> : <Button type="primary" icon={<LogIn className="size-4" />} disabled={loading} onClick={startNewApiLogin}>{t("account.signIn")}</Button>}
                    <Button icon={<RefreshCw className="size-4" />} disabled={loading || loggingOut} onClick={() => void connect().catch(() => {})}>{t("account.refresh")}</Button>
                    <Button type="text" href={`${NEW_API_BASE_URL}/dashboard`} target="_blank" rel="noopener noreferrer">{t("account.dashboard")}</Button>
                </div>
            </div>
            {loading ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : null}
            {!loading && error && status !== "anonymous" ? <Alert type="error" showIcon title={t("account.connectIncomplete")} description={error} /> : null}
            {token && status === "ready" ? <p className="text-sm text-muted-foreground">{t("account.connectedSummary", { count: models.length })}</p> : null}
            {status === "ready" ? (
                <section aria-label={t("account.modelsSection")} className="space-y-4">
                    <Input.Search aria-label={t("account.searchModels")} placeholder={t("account.searchModels")} value={query} allowClear onChange={(event) => setQuery(event.target.value)} />
                    {visibleModels.length ? (
                        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                            {visibleModels.map((model) => <li key={model.id} className="flex items-center gap-2 py-3 text-sm"><ModelIcon model={model.id} /><span className="min-w-0 break-all">{model.id}</span></li>)}
                        </ul>
                    ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={models.length ? t("account.noMatchModels") : t("account.noModels")} />}
                    <p className="text-xs text-muted-foreground">{t("account.modelsHint")}</p>
                </section>
            ) : null}
        </div>
    );
}
