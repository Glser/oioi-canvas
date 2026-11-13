import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { z } from "zod/v3";
import { AgentConversations } from "../agent/conversations.js";
import { inspectRuntime } from "../agent/capabilities.js";
import { RuntimeDiscovery } from "../agent/runtimes.js";
import { createCodexTransport, type AgentTransportFactory } from "../agent/codex-rpc.js";
import { ConversationManifest } from "../agent/manifest.js";

import { AGENT_PROTOCOL_VERSION, CanvasSession } from "../canvas/session.js";
import { CONFIG_DIR, DEFAULT_PORT, loadConfig, saveConfig, mergeOrigins, originAllowed, readStartupOrigins, type CanvasAgentConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { checkVersions } from "../version-check.js";

const PAIR_CODE_LENGTH = 6;
const PAIR_MAX_ATTEMPTS = 5;
const PAIR_LOCK_MS = 60_000;
/** 这些路径无需 Origin 白名单：/health、/config 用于探测，/bootstrap 与 /pair 用于首次领取 token。 */
const CORS_EXEMPT_PATHS = new Set(["/health", "/config", "/pair", "/bootstrap"]);

/** 启动仅监听本机的 Canvas Agent HTTP 服务。 */
export function startHttpServer() {
    const config = loadConfig(true);
    const port = Number(process.env.PORT) || Number(new URL(config.url).port) || DEFAULT_PORT;
    config.url = `http://127.0.0.1:${port}`;
    mergeOrigins(config, readStartupOrigins());
    saveConfig(config);

    const session = new CanvasSession();
    const pairing = createPairing(config.token);
    const discovery = new RuntimeDiscovery(process.cwd());
    const spawnRuntime: AgentTransportFactory = async (notify, request, closed, context) => {
        const runtimeId = context?.runtimeId || "codex";
        const runtime = (await discovery.list()).runtimes.find((item) => item.id === runtimeId);
        if (!runtime?.path || runtime.status !== "detected") throw new Error(runtime?.error || `未检测到可用 ${runtime?.name || runtimeId}，请安装后点击重新检测`);
        if (runtimeId === "claude") {
            const { createClaudeTransport } = await import("../agent/claude.js");
            return createClaudeTransport(runtime.path, context?.cwd || process.cwd())(notify, request, closed);
        }
        return createCodexTransport(runtime.path)(notify, request, closed);
    };
    const conversations = new AgentConversations(session, new ConversationManifest(path.join(CONFIG_DIR, "conversations.json")), process.cwd(), spawnRuntime);
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "30mb" }));
    app.use((req, res, next) => {
        if (!logger.enabled) return next();
        const startedAt = Date.now();
        const url = requestUrl(req, config);
        res.on("finish", () => {
            if (req.method === "OPTIONS" || (res.statusCode < 400 && ["/health", "/canvas/state", "/canvas/activate"].includes(url.pathname))) return;
            logger.debug(`HTTP ${req.method} ${url.pathname}`, { status: res.statusCode, durationMs: Date.now() - startedAt });
        });
        next();
    });
    app.use((req, res, next) => {
        const url = requestUrl(req, config);
        if (!setCors(req, res, url, config)) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        if (req.method === "OPTIONS") return void res.json({});
        next();
    });
    app.get("/health", (_req, res) => res.json(session.health()));
    app.get("/config", (_req, res) => res.json({ ok: true, protocolVersion: AGENT_PROTOCOL_VERSION, url: config.url, hasToken: true, pairCodeRequired: true }));
    app.post("/pair", (req, res) => {
        const result = pairing.exchange(String(req.body?.pairCode || ""));
        if (!result.ok) return void res.status(result.status).json({ ok: false, error: result.error });
        res.json({ ok: true, token: config.token, url: config.url });
    });
    app.post("/bootstrap", (req, res) => {
        if (!originAllowed(req.headers.origin, config.origins)) return void res.status(403).json({ ok: false, error: "origin not allowed" });
        res.json({ ok: true, token: config.token, url: config.url });
    });
    app.use((req, res, next) => {
        if (validToken(req, requestUrl(req, config), config.token)) return next();
        res.status(401).json({ ok: false, error: "invalid token" });
    });
    app.get("/events", (req, res) => {
        session.openEvents(requestUrl(req, config), res, req.headers.origin || "");
    });
    app.post("/canvas/state", (req, res) => {
        session.updateState(req.body, String(req.query.clientId || ""));
        res.json({ ok: true });
    });
    app.post("/canvas/activate", (req, res) => {
        session.activateClient(String(req.query.clientId || ""));
        res.json({ ok: true });
    });
    app.post("/canvas/result", (req, res) => {
        const ok = session.resolveResult(String(req.query.clientId || ""), req.body);
        res.status(ok ? 200 : 409).json({ ok });
    });
    app.post("/api/tools", route(async (req, res) => res.json({ ok: true, result: await session.callTool(req.body?.name, req.body?.input || {}, req.body?.bindingId) })));
    const targetSchema = z.object({ clientId: z.string().min(1), projectId: z.literal("") });
    const target = (req: Request) => ({ ...targetSchema.parse(req.body), origin: req.headers.origin || "" });
    const conversationTarget = (req: Request) => ({ ...target(req), conversationId: z.string().uuid().parse(req.body.conversationId) });
    const runtimeSchema = z.enum(["codex", "claude"]);
    app.get("/agent/runtime-info", route(async (req, res) => {
        const runtimeId = runtimeSchema.parse(req.query.runtimeId || "codex");
        const rpc = await spawnRuntime(() => {}, async () => { throw new Error("能力检测不执行交互操作"); }, () => {}, { runtimeId, cwd: process.cwd() });
        try { res.json(await inspectRuntime(rpc, process.cwd())); }
        finally { rpc.close(); }
    }));
    app.get("/agent/runtimes", route(async (req, res) => res.json(await discovery.list(req.query.refresh === "true"))));
    app.post("/agent/capabilities", route(async (req, res) => res.json(await conversations.refreshCapabilities(conversationTarget(req)))));
    app.post("/agent/connect", route(async (req, res) => {
        res.json(await conversations.connect({ ...target(req), runtimeId: runtimeSchema.optional().parse(req.body.runtimeId) }));
    }));
    app.post("/agent/conversations", route(async (req, res) => res.json(conversations.list(target(req)))));
    app.post("/agent/open", route(async (req, res) => {
        const options = z.object({ id: z.string().uuid().optional(), cwd: z.string().min(1).optional(), runtimeId: runtimeSchema.optional() }).parse(req.body);
        res.json(await conversations.open({ ...target(req), conversationId: z.string().uuid().optional().parse(req.body.conversationId) }, options));
    }));
    app.post("/agent/directories", route(async (req, res) => {
        const { path: directory } = z.object({ path: z.string().optional() }).parse(req.body);
        res.json(await conversations.directories(target(req), directory));
    }));
    app.post("/agent/permissions", route(async (req, res) => {
        const { mode } = z.object({ mode: z.enum(["runtime", "request", "readOnly", "fullAccess"]) }).parse(req.body);
        res.json(await conversations.setPermissions(conversationTarget(req), mode));
    }));
    app.post("/agent/send", route(async (req, res) => {
        const { submissionId, text, canvasProjectId, model, reasoningEffort } = z.object({ submissionId: z.string().uuid(), text: z.string().trim().min(1), canvasProjectId: z.string(), model: z.string().min(1).optional(), reasoningEffort: z.string().min(1).optional() }).parse(req.body);
        res.json(await conversations.send(conversationTarget(req), submissionId, text, canvasProjectId, { model, reasoningEffort }));
    }));
    app.post("/agent/interrupt", route(async (req, res) => res.json(await conversations.interrupt(conversationTarget(req)))));
    app.post("/agent/answer", route(async (req, res) => {
        const answer = z.object({ requestId: z.string(), decision: z.enum(["accept", "decline"]).optional(), answers: z.record(z.string()).optional(), content: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional() }).parse(req.body);
        res.json(conversations.answer(conversationTarget(req), answer));
    }));
    app.post("/api/agent/tools", route(async (req, res) => {
        const { bindingId, name } = z.object({ bindingId: z.string().uuid(), name: z.string() }).parse(req.body);
        res.json({ ok: true, result: await conversations.callTool(bindingId, name, req.body.input || {}) });
    }));
    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error("HTTP request failed", { method: req.method, path: req.path, error });
        res.status(500).json({ ok: false, error: error.message });
    });

    const server = app.listen(port, "127.0.0.1", (error?: Error) => {
        if (error) return;
        console.log("oioi-canvas 连接器已启动");
        checkVersions();
        console.log("请保持此窗口运行。网页会自动检测本机 Agent 并连接。");
        if (config.origins?.length) console.log(`已允许网页：${config.origins.join("、")}`);
        console.log(`工作目录: ${process.cwd()}`);
        void discovery.list().then((catalog) => catalog.runtimes.forEach((runtime) => console.log(`${runtime.name}: ${runtime.status}${runtime.version ? ` · ${runtime.version}` : ""}${runtime.status === "detected" && !runtime.supported ? "（已安装，网页执行暂未适配）" : ""}`)));
        if (logger.enabled) console.log(`Debug log: ${logger.filePath}`);
        logger.info("Canvas Agent started", { url: config.url, debugLog: logger.filePath });
    });
    const shutdown = () => { conversations.close(); session.close(); server.close(); process.exitCode = 0; };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.once("error", (error: NodeJS.ErrnoException) => {
        conversations.close();
        session.close();
        console.error(error.code === "EADDRINUSE"
            ? `连接器启动失败：端口 ${port} 已被占用。请先在原连接器终端按 Ctrl+C 停止旧进程，再重新启动；网页目前仍连接旧进程，新代码尚未生效。`
            : `连接器启动失败：${error.message}`);
        process.exitCode = 1;
    });
}

/** 将异步 Express 路由异常交给统一错误处理中间件。 */
function route(handler: (req: Request, res: Response) => Promise<unknown>) {
    return (req: Request, res: Response, next: NextFunction) => void handler(req, res).catch(next);
}

/** 结合服务配置解析当前请求 URL。 */
function requestUrl(req: Request, config: CanvasAgentConfig) {
    return new URL(req.originalUrl || req.url || "/", config.url);
}

/** 设置跨域响应头并记录通过 token 授权的来源。 */
function setCors(req: Request, res: Response, url: URL, config: CanvasAgentConfig) {
    const origin = req.headers.origin;
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Headers", "content-type,x-canvas-agent-token");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    // /pair 与 /config、/health 一样对未授权 Origin 开放：首次连接的用户此时还没有进入白名单。
    if (!origin || req.method === "OPTIONS" || CORS_EXEMPT_PATHS.has(url.pathname)) return true;
    config.origins ||= [];
    if (validToken(req, url, config.token) && !config.origins.includes(origin)) {
        config.origins.push(origin);
        saveConfig(config);
    }
    res.setHeader("Vary", "Origin");
    return config.origins.includes(origin);
}

/** 校验请求查询参数或请求头中的连接 token。 */
function validToken(req: Request, url: URL, token: string) {
    const header = req.headers["x-canvas-agent-token"];
    return url.searchParams.get("token") === token || header === token || (Array.isArray(header) && header.includes(token));
}

type PairResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * 用一次性配对码换取连接 token，省去用户手动复制 36 位 token。
 * 配对码只存内存、不落盘；失败次数超过上限后锁定一段时间，避免被暴力枚举。
 */
function createPairing(token: string) {
    const code = Array.from({ length: PAIR_CODE_LENGTH }, () => crypto.randomInt(0, 10)).join("");
    let attempts = 0;
    let lockedUntil = 0;

    const exchange = (input: string): PairResult => {
        if (Date.now() < lockedUntil) return { ok: false, status: 429, error: "配对码错误次数过多，请稍后重试" };
        if (input !== code) {
            attempts += 1;
            if (attempts >= PAIR_MAX_ATTEMPTS) lockedUntil = Date.now() + PAIR_LOCK_MS;
            return { ok: false, status: 401, error: "配对码不正确" };
        }
        return { ok: true };
    };

    return { exchange, code };
}
