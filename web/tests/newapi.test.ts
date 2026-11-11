import { afterEach, beforeEach, expect, test } from "bun:test";

import { consumeNewApiCallback, findNewApiAutoToken, NewApiError, type NewApiSession, type NewApiToken } from "../src/services/api/newapi";
import { newApiRequestSignal, useNewApiStore } from "../src/stores/use-newapi-store";

const originalFetch = globalThis.fetch;
const session: NewApiSession = { access_token: "login-secret", access_expires_at: Date.now() / 1000 + 3600, user: { id: 7, username: "flow-user" }, session: { sid: "session-7" } };
const token: NewApiToken = { id: 12, user_id: 7, name: "existing", group: "auto", status: 1, expired_time: -1, unlimited_quota: true, remain_quota: 0 };
const calls: Array<{ path: string; options: RequestInit }> = [];
let handler: (path: string, options: RequestInit) => Response | Promise<Response>;
const ok = (data: unknown) => Response.json({ success: true, data });
const fail = (status: number, message: string, code?: string) => Response.json({ success: false, message, code }, { status });
const page = (items: NewApiToken[], total = items.length, size = items.length || 1) => ok({ items, total, page_size: size });
const signal = () => new AbortController().signal;

beforeEach(() => {
    calls.length = 0;
    useNewApiStore.setState({ status: "idle", session: null, token: null, apiKey: "", models: [], error: "" });
    handler = (path) => {
        if (path === "/api/user/auth/refresh") return ok(session);
        if (path === "/api/token/?p=1") return page([token]);
        if (path === "/api/token/12/key") return ok({ key: "model-secret" });
        if (path === "/v1/models") return ok([{ id: "gpt-image-2", supported_endpoint_types: ["image-generation"] }]);
        if (path === "/api/pricing") return ok([]);
        if (path === "/api/user/auth/logout") return ok({});
        throw new Error(`Unexpected request: ${path}`);
    };
    globalThis.fetch = (async (input: string | URL | Request, options: RequestInit = {}) => {
        const url = input instanceof Request ? input.url : String(input);
        const parsed = new URL(url);
        const path = parsed.pathname + parsed.search;
        calls.push({ path, options });
        return handler(path, options);
    }) as typeof fetch;
});

afterEach(async () => {
    if (useNewApiStore.getState().session) {
        handler = () => ok({});
        await useNewApiStore.getState().logout();
    }
    globalThis.fetch = originalFetch;
});

test("separates login credentials from the model key and omits cookies on token/model requests", async () => {
    await Promise.all([useNewApiStore.getState().connect(), useNewApiStore.getState().connect()]);
    expect(calls.map((call) => call.path)).toEqual(["/api/user/auth/refresh", "/api/token/?p=1", "/api/token/12/key", "/v1/models", "/api/pricing"]);
    expect(calls[0].options.credentials).toBe("include");
    expect(new Headers(calls[1].options.headers).get("Authorization")).toBe("Bearer login-secret");
    expect(new Headers(calls[3].options.headers).get("Authorization")).toBe("Bearer sk-model-secret");
    expect(new Headers(calls[4].options.headers).get("Authorization")).toBe("Bearer login-secret");
    expect(calls.slice(1).every((call) => call.options.credentials === "omit")).toBe(true);
    expect(useNewApiStore.getState().status).toBe("ready");
});

test("enriches only key-visible models with the explicit New API category", async () => {
    const baseHandler = handler;
    handler = (path, options) => path === "/api/pricing" ? ok([
        { model_name: "gpt-image-2", category: " video " },
        { model_name: "not-visible-to-key", category: "image" },
    ]) : baseHandler(path, options);
    await useNewApiStore.getState().connect();
    expect(useNewApiStore.getState().models).toEqual([{ id: "gpt-image-2", category: "video", supported_endpoint_types: ["image-generation"] }]);
});

test("reports an unavailable category catalog without treating a logged-in account as ready", async () => {
    const baseHandler = handler;
    handler = (path, options) => path === "/api/pricing" ? fail(403, "pricing is disabled") : baseHandler(path, options);
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("模型分类读取失败");
    expect(useNewApiStore.getState().status).toBe("error");
    expect(useNewApiStore.getState().session?.user.id).toBe(session.user.id);
    expect(useNewApiStore.getState().models).toEqual([]);
    expect(useNewApiStore.getState().apiKey).toBe("");
    handler = baseHandler;
    await useNewApiStore.getState().connect();
    expect(useNewApiStore.getState().status).toBe("ready");
});

test("reports a CORS or network failure while reading model categories", async () => {
    const baseHandler = handler;
    handler = (path, options) => {
        if (path === "/api/pricing") throw new TypeError("Failed to fetch");
        return baseHandler(path, options);
    };
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("跨域配置");
    expect(useNewApiStore.getState().status).toBe("error");
    expect(useNewApiStore.getState().session?.user.id).toBe(session.user.id);
    expect(useNewApiStore.getState().models).toEqual([]);
});

test("searches subsequent pages and excludes other users, disabled, expired, and exhausted tokens", async () => {
    handler = (path) => path.endsWith("p=1") ? page([
        { ...token, user_id: 99 }, { ...token, status: 2 }, { ...token, expired_time: 1 }, { ...token, unlimited_quota: false },
    ], 5, 4) : page([token], 5, 4);
    expect(await findNewApiAutoToken(session, signal())).toEqual(token);
    expect(calls.map((call) => call.path)).toEqual(["/api/token/?p=1", "/api/token/?p=2"]);
});

test("creates only when no usable auto key exists and respects the agreed token settings", async () => {
    let created = false;
    const baseHandler = handler;
    handler = (path, options) => {
        if (path.startsWith("/api/token/?")) return page(created ? [token] : [{ ...token, status: 2 }]);
        if (path === "/api/token/auto-groups") return ok({ groups: ["standard"] });
        if (path === "/api/token/" && options.method === "POST") {
            expect(JSON.parse(String(options.body))).toEqual({ name: "Flow", group: "auto", unlimited_quota: true, expired_time: -1, remain_quota: 0 });
            created = true;
            return ok({});
        }
        return baseHandler(path, options);
    };
    await useNewApiStore.getState().connect();
    expect(calls.filter((call) => call.path === "/api/token/")).toHaveLength(1);
    expect(calls.some((call) => call.options.method === "DELETE" || call.options.method === "PUT")).toBe(false);
});

test("does not create a key when the account has no auto candidate groups", async () => {
    const baseHandler = handler;
    handler = (path, options) => path.startsWith("/api/token/?") ? page([]) : path === "/api/token/auto-groups" ? ok({ groups: [] }) : baseHandler(path, options);
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("auto 候选分组");
    expect(calls.some((call) => call.path === "/api/token/")).toBe(false);
});

test("reports token creation failure without retrying or touching other tokens", async () => {
    const baseHandler = handler;
    handler = (path, options) => path.startsWith("/api/token/?") ? page([]) : path === "/api/token/auto-groups" ? ok({ groups: ["standard"] }) : path === "/api/token/" ? fail(200, "已达到最大令牌数量限制") : baseHandler(path, options);
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("已达到最大令牌数量限制");
    expect(calls.filter((call) => call.path === "/api/token/")).toHaveLength(1);
    expect(useNewApiStore.getState().session?.user.id).toBe(7);
    expect(useNewApiStore.getState().apiKey).toBe("");
});

test("does not treat a network failure as an anonymous session", async () => {
    handler = () => { throw new TypeError("network unavailable"); };
    await expect(useNewApiStore.getState().connect()).rejects.toBeInstanceOf(NewApiError);
    expect(useNewApiStore.getState().status).toBe("error");
    expect(calls).toHaveLength(1);
});

test("refresh revocation clears credentials and cancels in-flight model work", async () => {
    await useNewApiStore.getState().connect();
    const requestSignal = newApiRequestSignal();
    handler = () => fail(401, "revoked");
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("revoked");
    expect(requestSignal?.aborted).toBe(true);
    expect(useNewApiStore.getState().status).toBe("anonymous");
    expect(useNewApiStore.getState().session).toBeNull();
    expect(useNewApiStore.getState().apiKey).toBe("");
});

test("model key rejection does not misreport a valid account session as logged out", async () => {
    const baseHandler = handler;
    handler = (path, options) => path === "/v1/models" ? fail(401, "令牌已失效") : baseHandler(path, options);
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("令牌已失效");
    expect(useNewApiStore.getState().session?.user.id).toBe(7);
    expect(useNewApiStore.getState().status).toBe("error");
    expect(useNewApiStore.getState().apiKey).toBe("");
});

test("session mismatch clears old identity and does not automatically replay refresh", async () => {
    await useNewApiStore.getState().connect();
    calls.length = 0;
    handler = () => fail(409, "会话已变化", "AUTH_SESSION_MISMATCH");
    await expect(useNewApiStore.getState().connect()).rejects.toThrow("会话已变化");
    expect(calls).toHaveLength(1);
    expect(useNewApiStore.getState().session).toBeNull();
    expect(useNewApiStore.getState().status).toBe("error");
});

test("validates callback state, consumes it once, and refuses cross-origin return destinations", () => {
    const values = new Map([["oioi-flow:auth-state", "once"], ["oioi-flow:return", "https://example.com/"]]);
    const previousLocation = Object.getOwnPropertyDescriptor(globalThis, "location");
    const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "location", { configurable: true, value: { origin: "https://flow.oioi.lat", search: "?state=once" } });
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) } });
    try {
        expect(consumeNewApiCallback()).toBe("/");
        expect(() => consumeNewApiCallback()).toThrow("登录回调已失效");
    } finally {
        if (previousLocation) Object.defineProperty(globalThis, "location", previousLocation); else delete (globalThis as Record<string, unknown>).location;
        if (previousStorage) Object.defineProperty(globalThis, "sessionStorage", previousStorage); else delete (globalThis as Record<string, unknown>).sessionStorage;
    }
});
