import { Alert, App, Button, Empty, Input, Skeleton } from "antd";
import { LogIn, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

import { NEW_API_BASE_URL } from "@/constant/env";
import { startNewApiLogin } from "@/services/api/newapi";
import { useNewApiStore } from "@/stores/use-newapi-store";

export function NewApiAccountPanel() {
    const { message, modal } = App.useApp();
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
        title: "退出当前账户？",
        content: "这也会结束账户中心的本次登录。当前浏览器中的画布和素材会保留。",
        okText: "退出账户",
        cancelText: "取消",
        onOk: async () => {
            setLoggingOut(true);
            try {
                await logout();
            } catch (error) {
                message.error(error instanceof Error ? error.message : "退出失败，请重试");
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
                    <h2 className="text-base font-semibold">{session ? session.user.display_name || session.user.username : "连接 oioi 账户"}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{session ? "模型与调用权限由你的账户管理。" : "登录后自动连接可用模型，开始创作。"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {session ? <Button icon={<LogOut className="size-4" />} loading={loggingOut} disabled={loading} onClick={signOut}>退出账户</Button> : <Button type="primary" icon={<LogIn className="size-4" />} disabled={loading} onClick={startNewApiLogin}>登录 / 注册</Button>}
                    <Button icon={<RefreshCw className="size-4" />} disabled={loading || loggingOut} onClick={() => void connect().catch(() => {})}>重新获取</Button>
                    <Button href={`${NEW_API_BASE_URL}/dashboard`} target="_blank" rel="noopener noreferrer">账户中心</Button>
                </div>
            </div>
            {loading ? <Skeleton active title={false} paragraph={{ rows: 2 }} /> : null}
            {!loading && error && status !== "anonymous" ? <Alert type="error" showIcon title="账户连接未完成" description={error} /> : null}
            {token && status === "ready" ? <p className="text-sm text-muted-foreground">已连接 auto 分组 · {models.length} 个模型</p> : null}
            {status === "ready" ? (
                <section aria-label="账户可用模型" className="space-y-4">
                    <Input.Search aria-label="搜索模型" placeholder="搜索模型名称" value={query} allowClear onChange={(event) => setQuery(event.target.value)} />
                    {visibleModels.length ? (
                        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                            {visibleModels.map((model) => <li key={model.id} className="py-3 text-sm break-all">{model.id}</li>)}
                        </ul>
                    ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={models.length ? "没有匹配的模型" : "当前令牌没有可用模型，请联系管理员检查分组和模型权限"} />}
                    <p className="text-xs text-muted-foreground">此处列出令牌有权调用的模型；创作界面按模型名称和接口信息分组，仅展示当前已适配的能力。</p>
                </section>
            ) : null}
        </div>
    );
}
