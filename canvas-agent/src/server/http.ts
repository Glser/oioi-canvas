import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import net from "node:net";

import { AGENT_PROTOCOL_VERSION, CanvasSession } from "../canvas/session.js";
import { DEFAULT_PORT, loadConfig, saveConfig, type CanvasAgentConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { checkVersions } from "../version-check.js";

const PAIR_CODE_LENGTH = 6;
const PAIR_MAX_ATTEMPTS = 5;
const PAIR_LOCK_MS = 60_000;
const WEB_DEV_PORT = 3100;
/** 这些路径无需 Origin 白名单：前两个是状态探测，/pair 是首次连接换取 token 的唯一入口。 */
const CORS_EXEMPT_PATHS = new Set(["/health", "/config", "/pair"]);

/** 启动仅监听本机的 Canvas Agent HTTP 服务。 */
export function startHttpServer() {
    const config = loadConfig(true);
    const port = Number(process.env.PORT) || Number(new URL(config.url).port) || DEFAULT_PORT;
    config.url = `http://127.0.0.1:${port}`;
    saveConfig(config);

    const session = new CanvasSession();
    const pairing = createPairing(config.token);
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
    app.use((req, res, next) => {
        if (validToken(req, requestUrl(req, config), config.token)) return next();
        res.status(401).json({ ok: false, error: "invalid token" });
    });
    app.get("/events", (req, res) => {
        session.openEvents(requestUrl(req, config), res);
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
    app.use((_req, res) => res.status(404).json({ ok: false, error: "not found" }));
    app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error("HTTP request failed", { method: req.method, path: req.path, error });
        res.status(500).json({ ok: false, error: error.message });
    });

    app.listen(port, "127.0.0.1", () => {
        console.log("oioi-canvas Agent");
        checkVersions();
        console.log(`Local URL: ${config.url}`);
        console.log(`配对码: ${pairing.code}`);
        console.log("Register MCP in your own Codex or Claude Code (skip if the plugin already provides it).");
        console.log("Codex: codex mcp add oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp");
        console.log("Claude: claude mcp add --scope user --transport stdio oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp");
        console.log("After connecting the browser, use canvas_list_clients and canvas_bind_client in your Agent.");
        if (logger.enabled) console.log(`Debug log: ${logger.filePath}`);
        logger.info("Canvas Agent started", { url: config.url, debugLog: logger.filePath });
        void openCanvasPage(config);
    });
}

/** 本机网页已在运行时自动打开画布页并带上连接参数，省去手动复制地址和 token。 */
async function openCanvasPage(config: CanvasAgentConfig) {
    if (!(await probePort(WEB_DEV_PORT))) {
        logger.info("Canvas web dev server is not running, skip opening browser");
        return;
    }
    const hash = `#agentUrl=${encodeURIComponent(config.url)}&agentToken=${encodeURIComponent(config.token)}`;
    const target = `http://localhost:${WEB_DEV_PORT}/?mode=new${hash}`;
    try {
        const { spawn } = await import("node:child_process");
        // Windows 下必须走 explorer.exe：cmd /c start 会把 URL 里的 & 当成命令分隔符。
        const [command, args] = process.platform === "win32" ? ["explorer.exe", [target]] : process.platform === "darwin" ? ["open", [target]] : ["xdg-open", [target]];
        const child = spawn(command, args, { stdio: "ignore", detached: true });
        child.on("error", (error) => logger.warn("Failed to open browser automatically", { error: error.message }));
        child.unref();
    } catch (error) {
        logger.warn("Failed to open browser automatically", { error: String(error) });
    }
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

/** 探测本机端口是否已有服务在监听。 */
function probePort(port: number) {
    return new Promise<boolean>((resolve) => {
        const socket = net.connect({ port, host: "127.0.0.1" });
        const done = (result: boolean) => {
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(1000);
        socket.once("connect", () => done(true));
        socket.once("timeout", () => done(false));
        socket.once("error", () => done(false));
    });
}
