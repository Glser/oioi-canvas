import { App, Button, Form, Input, Switch } from "antd";
import { Copy, Network, Wifi } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useCopyText } from "@/hooks/use-copy-text";
import { testLocalProxy } from "@/services/api/local-proxy";
import { DEFAULT_LOCAL_PROXY_URL, LOCAL_PROXY_PACKAGE, normalizeLocalProxyUrl, useConfigStore } from "@/stores/use-config-store";

export function ConfigLocalProxy() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const [testing, setTesting] = useState(false);
    const config = useConfigStore((state) => state.config);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const command = localProxyCommand(config.proxyUrl);

    const testProxy = async () => {
        setTesting(true);
        try {
            message.success(t("config.proxy.available", { proxy: await testLocalProxy(config.proxyUrl) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("config.proxy.unreachable"));
        } finally {
            setTesting(false);
        }
    };

    return (
        <Form layout="vertical" requiredMark={false}>
            <section className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Network className="size-4" />
                            {t("config.proxy.title")}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{t("config.proxy.description")}</div>
                    </div>
                    <Switch checked={config.proxyEnabled} onChange={(checked) => updateConfig("proxyEnabled", checked)} />
                </div>
                {config.proxyEnabled ? (
                    <>
                        <div className="mt-3 rounded-xl border border-black/[0.04] bg-card/90 p-3 shadow-xs dark:border-white/[0.06]">
                            <div className="mb-1 text-xs text-muted-foreground">{t("config.proxy.startHint")}</div>
                            <div className="flex items-center justify-between gap-3">
                                <code className="min-w-0 truncate text-xs">{command}</code>
                                <Button size="small" type="text" className="!h-7 !w-7 !min-w-7 !rounded-full !p-0" icon={<Copy className="size-3.5" />} onClick={() => copyText(command)} />
                            </div>
                        </div>
                        <Form.Item label={<span className="text-xs font-medium text-muted-foreground">{t("config.proxy.address")}</span>} extra={<span className="text-[11px] text-muted-foreground">{t("config.proxy.addressDescription")}</span>} className="mt-3 mb-0">
                            <Input
                                value={config.proxyUrl}
                                placeholder={DEFAULT_LOCAL_PROXY_URL}
                                onChange={(event) => updateConfig("proxyUrl", event.target.value)}
                                onBlur={(event) => updateConfig("proxyUrl", normalizeLocalProxyUrl(event.target.value) || DEFAULT_LOCAL_PROXY_URL)}
                            />
                        </Form.Item>
                        <Button className="mt-3 !h-8 !rounded-full !px-3.5 !text-xs font-medium" icon={<Wifi className="size-3.5" />} loading={testing} onClick={() => void testProxy()}>
                            {t("config.proxy.test")}
                        </Button>
                        <div className="mt-3 text-xs text-muted-foreground">{t("config.proxy.channelHint")}</div>
                    </>
                ) : null}
            </section>
        </Form>
    );
}

function localProxyCommand(proxyUrl: string) {
    // Pinned to @latest because npx otherwise reuses whatever version it already cached.
    const command = `npx ${LOCAL_PROXY_PACKAGE}@latest`;
    try {
        const port = new URL(normalizeLocalProxyUrl(proxyUrl) || DEFAULT_LOCAL_PROXY_URL).port;
        return port && port !== new URL(DEFAULT_LOCAL_PROXY_URL).port ? `${command} --port ${port}` : command;
    } catch {
        return command;
    }
}
