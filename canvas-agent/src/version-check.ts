import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { VERSION } from "./config.js";
import { logger } from "./utils/logger.js";

const execFileAsync = promisify(execFile);

/** 仅提醒 bridge 自身版本，不探测或管理用户原生 Agent。 */
export function checkVersions() {
    logger.info("Canvas Agent version", { version: VERSION });
    void checkLatestVersion();
}

async function checkLatestVersion() {
    try {
        const latest = await npmVersion("@oioi-npm/canvas-agent");
        if (isOlder(VERSION, latest)) logger.warn(`Update available: Canvas Agent ${VERSION} -> ${latest}. Run: npx -y @oioi-npm/canvas-agent@latest`);
    } catch {
        logger.warn("Unable to check the latest npm version; startup will continue.");
    }
}

/** 读取 npm 包的最新版本，沿用现有请求等待时间。 */
async function npmVersion(name: string) {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const { stdout } = await execFileAsync(command, ["view", name, "version"], { encoding: "utf8", timeout: 10_000 });
    return stdout.trim();
}

/** 比较仅包含数字段的稳定版语义版本。 */
function isOlder(current: string, latest: string) {
    const left = current.split(".").map(Number);
    const right = latest.split(".").map(Number);
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
        if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) < (right[index] || 0);
    }
    return false;
}
