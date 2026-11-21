import localforage from "localforage";
import { create } from "zustand";

import i18n from "@/i18n";
import { NEW_API_BASE_URL, NEW_API_ENABLED } from "@/constant/env";
import { createNewApiAutoToken, fetchNewApiModels, fetchNewApiStatus, fetchNewApiUserQuota, findNewApiAutoToken, getNewApiAutoGroups, logoutNewApiSession, NewApiError, normalizeNewApiDocsLink, readNewApiTokenKey, refreshNewApiSession, type NewApiGroupRatios, type NewApiModel, type NewApiSession, type NewApiToken, type NewApiUserQuota } from "@/services/api/newapi";

type ConnectOptions = { refreshModels?: boolean };
type ModelCache = { userId: number; baseUrl: string; models: NewApiModel[]; groupRatios: NewApiGroupRatios };
const modelCache = localforage.createInstance({ name: "oioi-canvas", storeName: "newapi_model_cache" });

type NewApiStore = {
    status: "idle" | "loading" | "anonymous" | "ready" | "error";
    session: NewApiSession | null;
    token: NewApiToken | null;
    apiKey: string;
    models: NewApiModel[];
    groupRatios: NewApiGroupRatios;
    /** 创作台 auto 候选分组（/api/token/auto-groups），价格明细只展示这些分组。 */
    autoGroups: string[];
    userQuota: NewApiUserQuota | null;
    /** New API 额度单位换算（quota/ quotaPerUnit = 金额 ¥），来自 /api/status 的 quota_per_unit。 */
    quotaPerUnit: number;
    docsLink: string;
    error: string;
    connect: (options?: ConnectOptions) => Promise<void>;
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
    useNewApiStore.setState({ session: null, token: null, apiKey: "", models: [], groupRatios: {}, autoGroups: [], userQuota: null });
}

async function obtainToken(session: NewApiSession, signal: AbortSignal, refreshModels = false) {
    const obtain = async () => {
        signal.throwIfAborted();
        // auto 候选分组即「oioi-创作台专用」令牌可用的分组，用于价格明细展示；获取失败不阻断已有令牌的连接
        const autoGroups = await getNewApiAutoGroups(session, signal).catch(() => [] as string[]);
        let token = await findNewApiAutoToken(session, signal);
        if (!token) {
            if (!autoGroups.length) throw new Error(i18n.t("account.errors.noAutoGroups"));
            await createNewApiAutoToken(session, { unlimited_quota: true, expired_time: -1, remain_quota: 0 }, signal);
            token = await findNewApiAutoToken(session, signal);
        }
        if (!token) throw new Error(i18n.t("account.errors.autoTokenMissing"));
        const apiKey = await readNewApiTokenKey(session, token.id, signal);
        const cached = refreshModels ? null : await modelCache.getItem<ModelCache>("catalog").catch(() => null);
        // 空目录不命中缓存：目录为空多来自网关瞬断或配置缺失，属异常态，下次连接应重新拉取
        if (cached?.userId === session.user.id && cached.baseUrl === NEW_API_BASE_URL && Array.isArray(cached.models) && cached.models.length > 0) return { token, apiKey, models: cached.models, groupRatios: cached.groupRatios || {}, autoGroups };
        const { models, groupRatios } = await fetchNewApiModels(apiKey, session, signal);
        if (models.length) await modelCache.setItem("catalog", { userId: session.user.id, baseUrl: NEW_API_BASE_URL, models, groupRatios }).catch(() => {});
        return { token, apiKey, models, groupRatios, autoGroups };
    };
    return navigator.locks ? navigator.locks.request(`oioi-flow:token:${session.user.id}`, { signal }, obtain) : obtain();
}

export const useNewApiStore = create<NewApiStore>((set, get) => ({
    status: "idle",
    session: null,
    token: null,
    apiKey: "",
    models: [],
    groupRatios: {},
    autoGroups: [],
    userQuota: null,
    quotaPerUnit: 500000,
    docsLink: "",
    error: "",
    loadStatus: () => {
        if (!NEW_API_ENABLED) return Promise.resolve();
        if (pendingStatus) return pendingStatus;
        const operation = (async () => {
            try {
                const status = await fetchNewApiStatus();
                const quotaPerUnit = Number(status?.quota_per_unit);
                set({ docsLink: normalizeNewApiDocsLink(status?.docs_link), ...(Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? { quotaPerUnit } : {}) });
            } catch {
                set({ docsLink: "" });
            }
        })();
        pendingStatus = operation;
        void operation.finally(() => { if (pendingStatus === operation) pendingStatus = null; });
        return operation;
    },
    connect: (options?: ConnectOptions) => {
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
                if (!session?.access_token || !session.session?.sid || !session.user?.id || !Number.isFinite(session.access_expires_at)) throw new Error(i18n.t("account.errors.sessionInvalid"));
                sessionRestored = true;
                if (currentSession && (currentSession.user.id !== session.user.id || currentSession.session.sid !== session.session.sid)) {
                    resetIdentity();
                    currentRevision = revision;
                }
                set({ session });
                const sessionRevision = revision;
                const credentials = await obtainToken(session, identityController.signal, Boolean(options?.refreshModels));
                if (sessionRevision !== revision) return;
                // 余额查询失败不影响连接与模型目录
                const userQuota = await fetchNewApiUserQuota(session, identityController.signal).catch(() => null);
                if (sessionRevision !== revision) return;
                set({ ...credentials, userQuota, status: "ready", error: "" });
            } catch (error) {
                if (currentRevision !== revision) return;
                if (error instanceof NewApiError && error.status === 401 && !sessionRestored) {
                    resetIdentity();
                    set({ status: "anonymous", error: i18n.t("account.errors.loginExpired") });
                } else {
                    if (error instanceof NewApiError && error.code === "AUTH_SESSION_MISMATCH") resetIdentity();
                    set({ status: "error", token: null, apiKey: "", models: [], groupRatios: {}, autoGroups: [], userQuota: null, error: error instanceof Error ? error.message : i18n.t("account.errors.connectFailed") });
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
        if (get().status !== "ready") throw new Error(get().error || i18n.t("account.errors.loginRequired"));
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
                set({ status: "error", error: error instanceof Error ? error.message : i18n.t("account.errors.logoutFailed") });
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
