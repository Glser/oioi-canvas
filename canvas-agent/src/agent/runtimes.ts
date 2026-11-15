import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import which from "which";
import spawn from "cross-spawn";
import type { DetectedRuntime, RuntimeCatalog } from "./types.js";

const runtimes = [
    { id: "codex", name: "Codex", command: "codex", supported: true },
    { id: "claude", name: "Claude Code", command: "claude", supported: true },
    { id: "workbuddy", name: "WorkBuddy", command: "workbuddy", supported: false },
];

/**
 * Microsoft Store 版 Codex（MSIX）不给 codex 注册命令行别名，exe 只在带版本号的
 * WindowsApps 目录里且目录不可枚举。通过 Get-AppxPackage（普通用户可查）拿
 * InstallLocation，再拼出 codex.exe 的绝对路径。
 */
function findStoreCodex(): Promise<string | null> {
    if (process.platform !== "win32") return Promise.resolve(null);
    return new Promise((resolve) => {
        const child = spawn(
            "powershell",
            ["-NoProfile", "-Command", "(Get-AppxPackage -Name OpenAI.Codex).InstallLocation"],
            { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
        );
        let output = "";
        let settled = false;
        const finish = (value: string | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };
        const timer = setTimeout(() => {
            child.kill();
            finish(null);
        }, 8000);
        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => { output += chunk; });
        child.once("error", () => { clearTimeout(timer); finish(null); });
        child.once("close", () => {
            clearTimeout(timer);
            const installLocation = output.trim().split(/\r?\n/)[0]?.trim();
            if (!installLocation) return finish(null);
            for (const relative of ["app\\resources\\codex.exe", "codex.exe"]) {
                const candidate = path.join(installLocation, relative);
                try {
                    if (fs.existsSync(candidate)) return finish(candidate);
                } catch {
                    // WindowsApps 权限受限，忽略探测失败
                }
            }
            finish(null);
        });
    });
}

/** 使用系统 PATH/PATHEXT 查找运行时；只执行版本查询，不安装工具、不读取凭证。Store 版 Codex 额外探测 MSIX 安装位置。 */
export async function detectRuntime(runtime: typeof runtimes[number]): Promise<DetectedRuntime> {
    let executable = await which(runtime.command).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (!executable && runtime.id === "codex") executable = await findStoreCodex();
    if (!executable) return { ...runtime, path: null, version: null, status: "missing" };
    return new Promise((resolve) => {
        const child = spawn(executable, ["--version"], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
        let output = "";
        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => { output += chunk; });
        child.once("error", (error) => resolve({ ...runtime, path: executable, version: null, status: "error", error: error.message }));
        child.once("close", (code) => {
            const version = output.match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0] || null;
            resolve({ ...runtime, path: executable, version, status: code === 0 ? "detected" : "error", ...(code === 0 ? {} : { error: `版本检测退出码：${code}` }) });
        });
    });
}

export class RuntimeDiscovery {
    private pending?: Promise<RuntimeCatalog>;
    constructor(private cwd: string, private detect = detectRuntime) {}
    list(refresh = false): Promise<RuntimeCatalog> {
        if (!this.pending || refresh) {
            this.pending = Promise.all(runtimes.map(async (runtime) => {
                try { return await this.detect(runtime); }
                catch (error) { return { ...runtime, path: null, version: null, status: "error" as const, error: error instanceof Error ? error.message : String(error) }; }
            })).then((items) => ({ machine: os.hostname(), platform: process.platform, arch: process.arch, cwd: this.cwd, runtimes: items }));
        }
        return this.pending;
    }
}
