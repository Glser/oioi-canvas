import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import { AGENT_PROTOCOL_VERSION } from "./agent/types.js";
import { CONFIG_DIR, DEFAULT_PORT, loadConfig, mergeOrigins, readStartupOrigins, saveConfig, type CanvasAgentConfig } from "./config.js";

const AUTOSTART_LABEL = "org.oioi.canvas-agent";
const POLL_TIMES = 40;
const POLL_INTERVAL_MS = 250;

/** 一次性安装：记录网页 Origin，注册登录自启并立即在后台启动连接器。 */
export async function installService(argv: string[]) {
    const config = loadConfig();
    mergeOrigins(config, readStartupOrigins(argv));
    saveConfig(config);
    const cwd = process.cwd();
    const isTs = import.meta.url.endsWith(".ts");
    const entry = fileURLToPath(new URL(isTs ? "../index.ts" : "../index.js", import.meta.url));
    const args = [...(isTs ? ["--import", pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href] : []), entry, "--debug"];
    console.log(`已注册开机自启：${writeAutostart(args, cwd)}`);
    if (entry.includes(`${path.sep}_npx${path.sep}`)) console.log("提示：当前实例来自 npx 缓存，npm 清理该缓存后自启会失效；长期使用建议先 npm install -g @oioi-npm/canvas-agent，再运行 canvas-agent install。");
    const state = await probe(config);
    if (state !== "stopped") {
        console.log(state === "outdated" ? "检测到旧版本连接器，正在停止…" : "检测到正在运行的连接器，正在重启以应用最新配置…");
        if (!(await stopRunning(config))) {
            console.log("无法自动停止现有连接器（其版本缺少远程停止接口）。请关闭旧连接器终端后重新执行 install；开机自启已注册，重启电脑后同样生效。");
            return;
        }
    }
    spawn(process.execPath, args, { cwd, detached: true, stdio: "ignore", windowsHide: true }).unref();
    console.log(await waitUntil(config, "running") ? "连接器已在后台启动，打开网页即可自动连接。" : "后台启动未确认成功；可前台运行连接器排查，开机自启已注册。");
}

/** 停止连接器并移除开机自启；配置与对话历史保留。 */
export async function uninstallService() {
    const config = loadConfig();
    const stopped = await stopRunning(config);
    const removed = removeAutostart();
    console.log(removed.length ? `已移除开机自启：${removed.join("、")}` : "未找到已注册的开机自启。");
    console.log(stopped ? "连接器已停止。" : "连接器未能自动停止，请手动关闭其终端或进程。");
    console.log(`配置与对话历史保留在 ${CONFIG_DIR}，重新 install 无需再次授权。`);
}

/** 连接器持久监听地址，与后台实例使用的配置端口保持一致。 */
function serviceUrl(config: CanvasAgentConfig) {
    return `http://127.0.0.1:${Number(new URL(config.url).port) || DEFAULT_PORT}`;
}

/** 探测本机连接器状态并校验协议版本。 */
async function probe(config: CanvasAgentConfig) {
    const res = await fetch(`${serviceUrl(config)}/config`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
    if (!res?.ok) return "stopped" as const;
    const data = await res.json().catch(() => null) as { protocolVersion?: number } | null;
    return data?.protocolVersion === AGENT_PROTOCOL_VERSION ? "running" as const : "outdated" as const;
}

/** 请求运行中的连接器自行退出，并等待端口释放。 */
async function stopRunning(config: CanvasAgentConfig) {
    if ((await probe(config)) === "stopped") return true;
    await fetch(`${serviceUrl(config)}/shutdown?token=${encodeURIComponent(config.token)}`, { method: "POST" }).catch(() => {});
    return waitUntil(config, "stopped");
}

async function waitUntil(config: CanvasAgentConfig, expected: "running" | "stopped") {
    for (let i = 0; i < POLL_TIMES; i++) {
        if ((await probe(config)) === expected) return true;
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return false;
}

function autostartFile() {
    if (process.platform === "win32") {
        const startupDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
        return path.join(startupDir, "oioi-canvas-agent.vbs");
    }
    if (process.platform === "darwin") return path.join(os.homedir(), "Library", "LaunchAgents", `${AUTOSTART_LABEL}.plist`);
    return path.join(os.homedir(), ".config", "autostart", "oioi-canvas-agent.desktop");
}

/** 写入当前平台的登录自启动项，隐藏窗口运行连接器。 */
function writeAutostart(args: string[], cwd: string) {
    const file = autostartFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const command = [process.execPath, ...args].map((part) => `"${part.replace(/"/g, "")}"`).join(" ");
    if (process.platform === "win32") {
        const line = (text: string) => text.replace(/"/g, '""');
        fs.writeFileSync(file, `${String.fromCharCode(0xfeff)}${[
            "On Error Resume Next",
            'Set shell = CreateObject("WScript.Shell")',
            `shell.CurrentDirectory = "${line(cwd)}"`,
            `shell.Run "${line(command)}", 0, False`,
        ].join("\r\n")}\r\n`, "utf16le");
    } else if (process.platform === "darwin") {
        const strings = [process.execPath, ...args].map((part) => `        <string>${xml(part)}</string>`).join("\n");
        fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n    <key>Label</key>\n    <string>${AUTOSTART_LABEL}</string>\n    <key>ProgramArguments</key>\n    <array>\n${strings}\n    </array>\n    <key>WorkingDirectory</key>\n    <string>${xml(cwd)}</string>\n    <key>RunAtLoad</key>\n    <true/>\n</dict>\n</plist>\n`);
    } else {
        fs.writeFileSync(file, `[Desktop Entry]\nType=Application\nName=oioi-canvas Agent\nExec=${command}\nPath=${cwd}\nTerminal=false\n`);
    }
    return file;
}

function removeAutostart() {
    const file = autostartFile();
    try {
        fs.rmSync(file);
        return [file];
    } catch {
        return [];
    }
}

function xml(value: string) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
