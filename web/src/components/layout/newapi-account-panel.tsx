import { Alert, App, Button, Empty, Input, Skeleton, Tooltip } from "antd";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ModelIcon } from "@/components/model-icon";
import { NEW_API_BASE_URL } from "@/constant/env";
import { startNewApiLogin } from "@/services/api/newapi";
import { useNewApiStore } from "@/stores/use-newapi-store";
import { modelPriceSummary } from "@/lib/model-pricing";

function formatQuota(quota: number, perUnit: number) {
    return (quota / perUnit).toFixed(2);
}

export function NewApiAccountPanel() {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const session = useNewApiStore((state) => state.session);
    const status = useNewApiStore((state) => state.status);
    const error = useNewApiStore((state) => state.error);
    const token = useNewApiStore((state) => state.token);
    const models = useNewApiStore((state) => state.models);
    const groupRatios = useNewApiStore((state) => state.groupRatios);
    const autoGroups = useNewApiStore((state) => state.autoGroups);
    const userQuota = useNewApiStore((state) => state.userQuota);
    const quotaPerUnit = useNewApiStore((state) => state.quotaPerUnit);
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
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold">{session ? session.user.username : t("account.connectTitle")}</h2>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        {session && userQuota ? (
                            <>
                                <span className="font-medium text-foreground">{t("account.balance", { amount: formatQuota(userQuota.quota, quotaPerUnit) })}</span>
                                <span>{t("account.usedQuota", { amount: formatQuota(userQuota.usedQuota, quotaPerUnit) })}</span>
                            </>
                        ) : null}
                        {token && status === "ready" ? <span>{t("account.connectedSummary", { count: models.length })}</span> : null}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {session ? <Button icon={<LogOut className="size-4" />} loading={loggingOut} disabled={loading} onClick={signOut}>{t("account.signOut")}</Button> : <Button type="primary" icon={<LogIn className="size-4" />} disabled={loading} onClick={startNewApiLogin}>{t("account.signIn")}</Button>}
                    <Button icon={<RefreshCw className="size-4" />} disabled={loading || loggingOut} onClick={() => void connect({ refreshModels: true }).catch(() => {})}>{t("account.refresh")}</Button>
                    <Button type="text" href={`${NEW_API_BASE_URL}/console/topup`} target="_blank" rel="noopener noreferrer">{t("account.wallet")}</Button>
                </div>
            </div>
            {loading ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : null}
            {!loading && error && status !== "anonymous" ? <Alert type="error" showIcon title={t("account.connectIncomplete")} description={error} /> : null}
            {status === "ready" ? (
                <section aria-label={t("account.modelsSection")} className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
                    <Input.Search aria-label={t("account.searchModels")} placeholder={t("account.searchModels")} value={query} allowClear onChange={(event) => setQuery(event.target.value)} />
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
                        {visibleModels.length ? (
                            <ul className="divide-y divide-border">
                                {visibleModels.map((model) => {
                                    const price = modelPriceSummary(model.pricing, groupRatios, autoGroups);
                                    return (
                                        <li key={model.id} className="flex items-center gap-2 py-3 text-sm">
                                            <ModelIcon model={model.id} />
                                            <span className="min-w-0 break-all">{model.id}</span>
                                            {price ? (
                                                <Tooltip title={price.detail ? <span className="whitespace-pre-line">{price.detail}</span> : ""} placement="left">
                                                    <span className="ml-auto flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs text-muted-foreground">
                                                        {(price.inlineLines && price.inlineLines.length ? price.inlineLines : [price.label]).map((line, index) => (
                                                            <span key={index}>{line}</span>
                                                        ))}
                                                    </span>
                                                </Tooltip>
                                            ) : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={models.length ? t("account.noMatchModels") : t("account.noModels")} />}
                        <p className="py-3 text-xs text-muted-foreground">{t("account.modelsHint")}</p>
                    </div>
                </section>
            ) : null}
        </div>
    );
}
