import i18n from "@/i18n";
import { NEW_API_BASE_URL } from "@/constant/env";
import type { ModelFeatures } from "@/lib/model-features";

export type NewApiUser = { id: number; username: string; display_name?: string };
export type NewApiSession = {
    access_token: string;
    access_expires_at: number;
    user: NewApiUser;
    session: { sid: string };
};
export type NewApiModelPricing = {
    /** 0=按量计费（倍率），1=按次计费（固定价） */
    quotaType?: number;
    /** 按量倍率（quota_type=0 时有效，相对基准价的倍数） */
    modelRatio?: number;
    /** 按次固定价，美元/次（quota_type=1 时有效） */
    modelPrice?: number;
    /** 补全倍率（相对 prompt 单价的倍数） */
    completionRatio?: number;
    /** 人类可读的分档计费表达式，如 tier("480p", u("seconds") * 0.36) */
    billingExpr?: string;
    /** 模型可用的分组列表；各分组系数由顶层 group_ratio 提供，分组价 = 基准价 × 分组系数。 */
    enableGroups?: string[];
};
export type NewApiModel = { id: string; category?: string; supported_endpoint_types?: string[]; features?: ModelFeatures; pricing?: NewApiModelPricing };
/** 分组 → 计费系数（auto 令牌所在分组的系数决定最终价格）。 */
export type NewApiGroupRatios = Record<string, number>;
export type NewApiToken = {
    id: number;
    user_id: number;
    name: string;
    group: string;
    status: number;
    expired_time: number;
    unlimited_quota: boolean;
    remain_quota: number;
};
type ApiResult<T> = { success?: boolean; message?: string; code?: string; data: T; error?: { message?: string } };

export const NEW_API_AUTO_TOKEN_NAME = "oioi-创作台专用";

export class NewApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public code?: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${NEW_API_BASE_URL}${path}`, { credentials: "omit", cache: "no-store", ...options });
    } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new NewApiError(i18n.t("account.errors.serviceUnreachable"), 0);
    }
    let result: ApiResult<T>;
    try {
        result = await response.json();
    } catch {
        throw new NewApiError(i18n.t("account.errors.nonJsonResponse"), response.status);
    }
    if (!result || typeof result !== "object") throw new NewApiError(i18n.t("account.errors.badResponseShape"), response.status);
    if (!response.ok || result.success === false || result.error) {
        throw new NewApiError(result.message || result.error?.message || i18n.t("account.errors.requestFailed"), response.status, result.code);
    }
    return result.data;
}

function authOptions(accessToken: string, signal: AbortSignal): RequestInit {
    return { headers: { Authorization: `Bearer ${accessToken}` }, signal };
}

export function refreshNewApiSession(sid?: string, signal?: AbortSignal) {
    return request<NewApiSession>("/api/user/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: sid ? { "X-Auth-Session": sid } : undefined,
        signal,
    });
}

export function logoutNewApiSession(session: NewApiSession, signal: AbortSignal) {
    return request<unknown>("/api/user/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${session.access_token}`, "X-Auth-Session": session.session.sid },
        signal,
    });
}

export async function findNewApiAutoToken(session: NewApiSession, signal: AbortSignal) {
    let page = 1;
    for (;;) {
        const data = await request<{ items: NewApiToken[]; total: number; page_size: number }>(`/api/token/?p=${page}`, authOptions(session.access_token, signal));
        if (!Array.isArray(data.items) || !Number.isInteger(data.page_size) || data.page_size <= 0 || !Number.isInteger(data.total) || data.total < 0) {
            throw new Error(i18n.t("account.errors.tokenListInvalid"));
        }
        const token = data.items.find((item) => item.user_id === session.user.id && item.name === NEW_API_AUTO_TOKEN_NAME && item.group === "auto" && item.status === 1 && (item.expired_time === -1 || item.expired_time > Date.now() / 1000) && (item.unlimited_quota || item.remain_quota > 0));
        if (token) return token;
        if (page * data.page_size >= data.total) return null;
        if (!data.items.length) throw new Error(i18n.t("account.errors.tokenListEmpty"));
        page += 1;
    }
}

export function createNewApiAutoToken(session: NewApiSession, settings: { unlimited_quota: boolean; expired_time: number; remain_quota: number }, signal: AbortSignal) {
    return request<unknown>("/api/token/", {
        ...authOptions(session.access_token, signal),
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: NEW_API_AUTO_TOKEN_NAME, group: "auto", ...settings }),
    });
}

export async function getNewApiAutoGroups(session: NewApiSession, signal: AbortSignal) {
    const data = await request<{ groups: string[] }>("/api/token/auto-groups", authOptions(session.access_token, signal));
    if (!Array.isArray(data.groups) || !data.groups.length) throw new Error(i18n.t("account.errors.noAutoGroups"));
    return data.groups;
}

export async function readNewApiTokenKey(session: NewApiSession, tokenId: number, signal: AbortSignal) {
    const data = await request<{ key: string }>(`/api/token/${tokenId}/key`, { ...authOptions(session.access_token, signal), method: "POST" });
    if (!data.key || data.key.includes("*")) throw new Error(i18n.t("account.errors.tokenKeyMasked"));
    return data.key.startsWith("sk-") ? data.key : `sk-${data.key}`;
}

export async function fetchNewApiModels(apiKey: string, session: NewApiSession, signal: AbortSignal) {
    type PricingEntry = { model_name: string; category?: string; supported_endpoint_types?: string[]; features?: ModelFeatures; quota_type?: number; model_ratio?: number; model_price?: number; completion_ratio?: number; billing_expr?: string; enable_groups?: string[] };
    const [data, metadata] = await Promise.all([
        request<NewApiModel[]>("/v1/models", authOptions(apiKey, signal)),
        request<{ data?: PricingEntry[]; group_ratio?: Record<string, number> } & { [model_name: string]: PricingEntry }>("/api/pricing", authOptions(session.access_token, signal)).catch((error) => {
            if (signal.aborted) throw error;
            throw new Error(i18n.t("account.errors.modelCatalogFailed"));
        }),
    ]);
    if (!Array.isArray(data) || data.some((model) => typeof model.id !== "string" || !model.id)) throw new Error(i18n.t("account.errors.modelListInvalid"));
    const details = new Map((Array.isArray(metadata?.data) ? metadata.data : []).map((model) => [model.model_name, model]));
    const groupRatios = typeof metadata?.group_ratio === "object" && metadata.group_ratio ? metadata.group_ratio : {};
    const models = [
        ...new Map(
            data.map((model) => {
                const detail = details.get(model.id);
                return [
                    model.id,
                    {
                        ...model,
                        category: detail?.category?.trim() ?? model.category,
                        supported_endpoint_types: detail?.supported_endpoint_types ?? model.supported_endpoint_types,
                        features: detail?.features,
                        pricing: detail
                            ? {
                                  quotaType: detail.quota_type,
                                  modelRatio: detail.model_ratio,
                                  modelPrice: detail.model_price,
                                  completionRatio: detail.completion_ratio,
                                  billingExpr: detail.billing_expr,
                                  enableGroups: detail.enable_groups,
                              }
                            : undefined,
                    },
                ];
            }),
        ).values(),
    ].sort((a, b) => a.id.localeCompare(b.id));
    return { models, groupRatios };
}

export function fetchNewApiStatus(signal?: AbortSignal) {
    return request<{ docs_link?: string }>("/api/status", { signal });
}

export function normalizeNewApiDocsLink(value: string | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) return "";
    const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : trimmed.startsWith("//") ? `https:${trimmed}` : `https://${trimmed}`;
    try {
        const url = new URL(href);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

export function startNewApiLogin() {
    const state = crypto.randomUUID();
    sessionStorage.setItem("oioi-flow:auth-state", state);
    sessionStorage.setItem("oioi-flow:return", `${location.pathname}${location.search}${location.hash}`);
    const callback = new URL("/auth/callback", location.origin);
    callback.searchParams.set("state", state);
    const url = new URL("/sign-in", NEW_API_BASE_URL);
    url.searchParams.set("redirect", callback.href);
    location.assign(url.href);
}

export function consumeNewApiCallback() {
    const state = new URLSearchParams(location.search).get("state");
    const expected = sessionStorage.getItem("oioi-flow:auth-state");
    sessionStorage.removeItem("oioi-flow:auth-state");
    if (!state || state !== expected) throw new Error(i18n.t("account.errors.callbackExpired"));
    const target = sessionStorage.getItem("oioi-flow:return") || "/";
    sessionStorage.removeItem("oioi-flow:return");
    const url = new URL(target, location.origin);
    return url.origin === location.origin && url.pathname !== "/auth/callback" ? `${url.pathname}${url.search}${url.hash}` : "/";
}
