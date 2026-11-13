import os from "node:os";
import which from "which";
import spawn from "cross-spawn";
import type { DetectedRuntime, RuntimeCatalog } from "./types.js";

const runtimes = [
    { id: "codex", name: "Codex", command: "codex", supported: true },
    { id: "claude", name: "Claude Code", command: "claude", supported: true },
    { id: "workbuddy", name: "WorkBuddy", command: "workbuddy", supported: false },
];

/** 使用系统 PATH/PATHEXT 查找运行时；只执行版本查询，不安装工具、不读取凭证。 */
export async function detectRuntime(runtime: typeof runtimes[number]): Promise<DetectedRuntime> {
    const executable = await which(runtime.command).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
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
