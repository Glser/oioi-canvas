import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_PORT = 17371;
export const CONFIG_DIR = path.join(os.homedir(), ".oioi-canvas");
export const CONFIG_FILE = path.join(CONFIG_DIR, "canvas-agent.json");
export const VERSION = readPackageVersion();
export const AGENT_PROMPT = fs.readFileSync(new URL("../agent-instructions.md", import.meta.url), "utf8");
export type CanvasAgentConfig = { url: string; token: string; origins?: string[] };

/** 读取本地 Canvas Agent 配置，不存在时生成默认配置。 */
export function loadConfig(create = false): CanvasAgentConfig {
    try {
        const { url, token, origins } = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as CanvasAgentConfig;
        return { url, token, ...(origins ? { origins } : {}) };
    } catch {
        const config = { url: `http://127.0.0.1:${Number(process.env.PORT) || DEFAULT_PORT}`, token: crypto.randomBytes(18).toString("hex") };
        if (create) saveConfig(config);
        return config;
    }
}

/** 将 Canvas Agent 配置写入用户配置目录。 */
export function saveConfig(config: CanvasAgentConfig) {
    writeConfigFile(CONFIG_DIR, CONFIG_FILE, config);
}

/** 写入配置并强制目录 0700、文件 0600，包括纠正已有宽松权限。 */
export function writeConfigFile(dir: string, file: string, config: CanvasAgentConfig) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(file, 0o600);
}

/** 从当前包信息中读取 Canvas Agent 版本号。 */
function readPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
        return pkg.version || "0.0.0";
    } catch {
        return "0.0.0";
    }
}

/** 把用户传入的网页地址收成 Origin，非法值直接忽略。 */
export function normalizeOrigin(input: string) {
    try {
        const url = new URL(input);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        return url.origin;
    } catch {
        return null;
    }
}

/** 启动参数和环境变量里的网页 Origin，用于网页自动领取连接凭证。 */
export function readStartupOrigins(argv = process.argv.slice(2), env = process.env) {
    const origins: string[] = [];
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === "--origin" && argv[i + 1]) {
            const origin = normalizeOrigin(argv[i + 1]);
            if (origin) origins.push(origin);
            i += 1;
        }
    }
    const fromEnv = env.OIOI_CANVAS_ORIGIN ? normalizeOrigin(env.OIOI_CANVAS_ORIGIN) : null;
    if (fromEnv) origins.push(fromEnv);
    return [...new Set(origins)];
}

/** 把新的网页 Origin 合并进已保存配置。 */
export function mergeOrigins(config: CanvasAgentConfig, origins: string[]) {
    if (!origins.length) return false;
    const current = config.origins || [];
    const next = [...new Set([...current, ...origins])];
    if (next.length === current.length && next.every((item) => current.includes(item))) return false;
    config.origins = next;
    return true;
}

/** 仅允许浏览器带上的 Origin 领取本机连接凭证。 */
export function originAllowed(origin: string | undefined, origins: string[] | undefined) {
    return Boolean(origin && origins?.includes(origin));
}
