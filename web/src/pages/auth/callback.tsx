import { Alert, Button, Skeleton } from "antd";
import { useEffect, useRef, useState } from "react";
import i18n from "@/i18n";
import { Link, useNavigate } from "react-router-dom";

import { consumeNewApiCallback } from "@/services/api/newapi";
import { useNewApiStore } from "@/stores/use-newapi-store";

export default function AuthCallbackPage() {
    const navigate = useNavigate();
    const callback = useRef<Promise<string> | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        callback.current ??= Promise.resolve().then(consumeNewApiCallback);
        setError("");
        void callback.current.then(async (target) => {
            await useNewApiStore.getState().connect();
            if (useNewApiStore.getState().status !== "ready") throw new Error(i18n.t("auth.loginNotRestored"));
            if (active) void navigate(target, { replace: true });
        }).catch((error) => {
            if (active) setError(error instanceof Error ? error.message : i18n.t("auth.connectFailed"));
        });
        return () => { active = false; };
    }, [attempt, navigate]);

    return (
        <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
            <div className="w-full max-w-md space-y-6">
                <h1 className="text-2xl font-semibold">{i18n.t("auth.connecting")}</h1>
                {error ? <>
                    <Alert type="error" showIcon title={i18n.t("auth.failed")} description={error} />
                    <div className="flex gap-3"><Button onClick={() => setAttempt((value) => value + 1)}>{i18n.t("auth.retry")}</Button><Link to="/">{i18n.t("auth.backHome")}</Link></div>
                </> : <Skeleton active paragraph={{ rows: 2 }} />}
            </div>
        </main>
    );
}
