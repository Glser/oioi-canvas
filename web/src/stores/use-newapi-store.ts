import { create } from "zustand";

import { NEW_API_ENABLED } from "@/constant/env";
import { createNewApiAutoToken, fetchNewApiModels, fetchNewApiStatus, findNewApiAutoToken, getNewApiAutoGroups, logoutNewApiSession, NewApiError, normalizeNewApiDocsLink, readNewApiTokenKey, refreshNewApiSession, type NewApiModel, type NewApiSession, type NewApiToken } from "@/services/api/newapi";

type NewApiStore = {
    status: "idle" | "loading" | "anonymous" | "ready" | "error";
    session: NewApiSession | null;
    token: NewApiToken | null;
    apiKey: string;
    models: NewApiModel[];
    docsLink: string;
    error: string;
    connect: () => Promise<void>;
    loadStatus: () => Promise<void>;
    ensureReady: () => Promise<void>;
    logout: () => Promise<void>;
};

export type NewApiRuntimeState = Pick<NewApiStore, "status" | "session" | "apiKey" | "models" | "docsLink">;

let pending: Promise<void> | null = null;
let pendingStatus: Promise<void> | null = null;
let signingOut: Promise<void> | null = null;
let revision = 0;
let identityController = new AbortController();

function resetIdentity() {
    revision += 1;
    identityController.abort();
    identityController = new AbortController();
    useNewApiStore.setState({ session: null, token: null, apiKey: "", models: [] });
}

async function obtainToken(session: NewApiSession, signal: AbortSignal) {
    const obtain = async () => {
        signal.throwIfAborted();
        let token = await findNewApiAutoToken(session, signal);
        if (!token) {
            await getNewApiAutoGroups(session, signal);
            await createNewApiAutoToken(session, { unlimited_quota: true, expired_time: -1, remain_quota: 0 }, signal);
            token = await findNewApiAutoToken(session, signal);
        }
        if (!token) throw new Error("未取得可用的 auto 令牌，请在账户中心检查后重新获取");
        const apiKey = await readNewApiTokenKey(session, token.id, signal);
        const models = await fetchNewApiModels(apiKey, session, signal);
        return { token, apiKey, models };
    };
    return navigator.locks ? navigator.locks.request(`oioi-flow:token:${session.user.id}`, { signal }, obtain) : obtain();
}

export const useNewApiStore = create<NewApiStore>((set, get) => ({
    status: "idle",
    session: null,
    token: null,
    apiKey: "",
    models: [],
    docsLink: "",
    error: "",
    loadStatus: () => {
        if (!NEW_API_ENABLED) return Promise.resolve();
        if (pendingStatus) return pendingStatus;
        const operation = (async () => {
            try {
                const status = await fetchNewApiStatus();
                set({ docsLink: normalizeNewApiDocsLink(status?.docs_link) });
            } catch {
                set({ docsLink: "" });
            }
        })();
        pendingStatus = operation;
        void operation.finally(() => { if (pendingStatus === operation) pendingStatus = null; });
        return operation;
    },
    connect: () => {
        if (!NEW_API_ENABLED) return Promise.resolve();
        if (signingOut) return signingOut;
        if (pending) return pending;
        let currentRevision = revision;
        const currentSession = get().session;
        let sessionRestored = false;
        set({ status: "loading", error: "" });
        const operation = (async () => {
            try {
                const session = await refreshNewApiSession(currentSession?.session.sid, identityController.signal);
                if (currentRevision !== revision) return;
                if (!session?.access_token || !session.session?.sid || !session.user?.id || !Number.isFinite(session.access_expires_at)) throw new Error("登录会话格式异常，请检查 New API 版本");
                sessionRestored = true;
                if (currentSession && (currentSession.user.id !== session.user.id || currentSession.session.sid !== session.session.sid)) {
                    resetIdentity();
                    currentRevision = revision;
                }
                set({ session });
                const sessionRevision = revision;
                const credentials = await obtainToken(session, identityController.signal);
                if (sessionRevision !== revision) return;
                set({ ...credentials, status: "ready", error: "" });
            } catch (error) {
                if (currentRevision !== revision) return;
                if (error instanceof NewApiError && error.status === 401 && !sessionRestored) {
                    resetIdentity();
                    set({ status: "anonymous", error: "登录已失效，请重新登录" });
                } else {
                    if (error instanceof NewApiError && error.code === "AUTH_SESSION_MISMATCH") resetIdentity();
                    set({ status: "error", token: null, apiKey: "", models: [], error: error instanceof Error ? error.message : "账户连接失败，请重试" });
                }
                throw error;
            }
        })();
        pending = operation;
        void operation.finally(() => { if (pending === operation) pending = null; }).catch(() => {});
        return operation;
    },
    ensureReady: async () => {
        if (!NEW_API_ENABLED) return;
        const state = get();
        if (state.status !== "ready" || !state.session || state.session.access_expires_at * 1000 <= Date.now()) await get().connect();
        if (get().status !== "ready") throw new Error(get().error || "请先登录账户");
    },
    logout: () => {
        if (signingOut) return signingOut;
        const session = get().session;
        if (!session) return Promise.resolve();
        revision += 1;
        identityController.abort();
        identityController = new AbortController();
        set({ status: "loading", error: "" });
        const operation = (async () => {
            try {
                await logoutNewApiSession(session, identityController.signal);
                resetIdentity();
                set({ status: "anonymous", error: "" });
            } catch (error) {
                if (error instanceof NewApiError && error.code === "AUTH_SESSION_MISMATCH") resetIdentity();
                set({ status: "error", error: error instanceof Error ? error.message : "退出失败，请重试" });
                throw error;
            }
        })();
        signingOut = operation;
        void operation.finally(() => { if (signingOut === operation) signingOut = null; }).catch(() => {});
        return operation;
    },
}));

export function newApiRequestSignal(signal?: AbortSignal) {
    if (!NEW_API_ENABLED) return signal;
    return signal ? AbortSignal.any([signal, identityController.signal]) : identityController.signal;
}
