import { NEW_API_BASE_URL } from "@/constant/env";

export type NewApiUser = { id: number; username: string; display_name?: string };
export type NewApiSession = {
    access_token: string;
    access_expires_at: number;
    user: NewApiUser;
    session: { sid: string };
};
export type NewApiModel = { id: string; category?: string; supported_endpoint_types?: string[] };
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

export class NewApiError extends Error {
    constructor(message: string, public status: number, public code?: string) {
        super(message);
    }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${NEW_API_BASE_URL}${path}`, { credentials: "omit", cache: "no-store", ...options });
    } catch (error) {
        if (options.signal?.aborted) throw error;
        throw new NewApiError("无法连接账户服务，请检查网络及 API 跨域配置后重试", 0);
    }
    let result: ApiResult<T>;
    try {
        result = await response.json();
    } catch {
        throw new NewApiError("账户服务返回了非 JSON 响应，请检查 API 地址与反向代理", response.status);
    }
    if (!result || typeof result !== "object") throw new NewApiError("账户服务响应格式异常，请检查 New API 版本", response.status);
    if (!response.ok || result.success === false || result.error) {
        throw new NewApiError(result.message || result.error?.message || "账户服务请求失败", response.status, result.code);
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
            throw new Error("令牌列表格式异常，请检查 New API 版本");
        }
        const token = data.items.find((item) => item.user_id === session.user.id && item.group === "auto" && item.status === 1 && (item.expired_time === -1 || item.expired_time > Date.now() / 1000) && (item.unlimited_quota || item.remain_quota > 0));
        if (token) return token;
        if (page * data.page_size >= data.total) return null;
        if (!data.items.length) throw new Error("令牌列表分页异常，请重新获取");
        page += 1;
    }
}

export function createNewApiAutoToken(session: NewApiSession, settings: { unlimited_quota: boolean; expired_time: number; remain_quota: number }, signal: AbortSignal) {
    return request<unknown>("/api/token/", {
        ...authOptions(session.access_token, signal),
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Flow", group: "auto", ...settings }),
    });
}

export async function getNewApiAutoGroups(session: NewApiSession, signal: AbortSignal) {
    const data = await request<{ groups: string[] }>("/api/token/auto-groups", authOptions(session.access_token, signal));
    if (!Array.isArray(data.groups) || !data.groups.length) throw new Error("当前账户尚未开放 auto 候选分组，请联系管理员配置后重试");
    return data.groups;
}

export async function readNewApiTokenKey(session: NewApiSession, tokenId: number, signal: AbortSignal) {
    const data = await request<{ key: string }>(`/api/token/${tokenId}/key`, { ...authOptions(session.access_token, signal), method: "POST" });
    if (!data.key || data.key.includes("*")) throw new Error("未取得完整调用令牌，请重新获取");
    return data.key.startsWith("sk-") ? data.key : `sk-${data.key}`;
}

export async function fetchNewApiModels(apiKey: string, session: NewApiSession, signal: AbortSignal) {
    const [data, metadata] = await Promise.all([
        request<NewApiModel[]>("/v1/models", authOptions(apiKey, signal)),
        request<Array<{ model_name: string; category?: string; supported_endpoint_types?: string[] }>>("/api/pricing", authOptions(session.access_token, signal)).catch((error) => {
            if (signal.aborted) throw error;
            throw new Error("模型分类读取失败，请检查网关 /api/pricing 的访问权限与跨域配置，然后重新获取模型");
        }),
    ]);
    if (!Array.isArray(data) || data.some((model) => typeof model.id !== "string" || !model.id)) throw new Error("模型列表格式异常，请检查 New API 版本");
    const details = new Map((Array.isArray(metadata) ? metadata : []).map((model) => [model.model_name, model]));
    return [...new Map(data.map((model) => {
        const detail = details.get(model.id);
        return [model.id, { ...model, category: detail?.category?.trim() ?? model.category, supported_endpoint_types: detail?.supported_endpoint_types ?? model.supported_endpoint_types }];
    })).values()].sort((a, b) => a.id.localeCompare(b.id));
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
    if (!state || state !== expected) throw new Error("登录回调已失效，请返回首页重新登录");
    const target = sessionStorage.getItem("oioi-flow:return") || "/";
    sessionStorage.removeItem("oioi-flow:return");
    const url = new URL(target, location.origin);
    return url.origin === location.origin && url.pathname !== "/auth/callback" ? `${url.pathname}${url.search}${url.hash}` : "/";
}
