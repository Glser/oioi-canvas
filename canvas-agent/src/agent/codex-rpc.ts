import readline from "node:readline";
import spawn from "cross-spawn";
import { JSONRPCClient, JSONRPCServer, JSONRPCServerAndClient, createJSONRPCErrorResponse, createJSONRPCSuccessResponse } from "json-rpc-2.0";
import type { AgentCapabilities, AgentRuntimeId } from "./types.js";

export type RpcParams = Record<string, any>;
export type AgentTransport = { runtimeId?: AgentRuntimeId; capabilities?: () => Promise<AgentCapabilities>; request: (method: string, params: RpcParams) => Promise<any>; close: () => void };
export type AgentTransportFactory = (notify: (method: string, params: RpcParams) => void, request: (method: string, params: RpcParams, id: string) => Promise<unknown>, closed: (error: Error) => void, context?: { runtimeId: AgentRuntimeId; cwd: string }) => Promise<AgentTransport>;

/** app-server 使用逐行 JSON-RPC；协议请求/响应由成熟库处理，不解析终端展示文本。 */
export function createCodexTransport(command: string): AgentTransportFactory {
    return async (notify, request, closed) => {
        const child = spawn(command, ["app-server", "--listen", "stdio://"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        let stopped = false;
        const client = new JSONRPCClient((payload) => new Promise<void>((resolve, reject) => {
            if (stopped) return reject(new Error("Codex 连接已关闭"));
            // app-server 的线协议省略 jsonrpc 字段。
            const { jsonrpc: _version, ...wire } = payload;
            child.stdin!.write(`${JSON.stringify(wire)}\n`, (error) => error ? reject(error) : resolve());
        }));
        const server = new JSONRPCServer();
        server.applyMiddleware(async (_next, message) => {
            const params = (message.params || {}) as RpcParams;
            if (message.id === undefined) {
                notify(message.method, params);
                return null;
            }
            try {
                return createJSONRPCSuccessResponse(message.id, await request(message.method, params, `${typeof message.id}:${message.id}`));
            } catch (error) {
                return createJSONRPCErrorResponse(message.id, -32000, error instanceof Error ? error.message : String(error));
            }
        });
        const rpc = new JSONRPCServerAndClient(server, client);
        const finish = (error: Error) => {
            if (stopped) return;
            stopped = true;
            rpc.rejectAllPendingRequests(error.message);
            closed(error);
        };
        child.once("error", (error) => finish(new Error(`无法启动 Codex，请安装 Codex CLI 并确认 PATH：${error.message}`)));
        child.once("exit", (code) => finish(new Error(`Codex 已退出（${code ?? "信号终止"}），请重新连接会话`)));
        child.stdin!.on("error", finish);
        // 不向网页转发 stderr，避免泄漏本机日志或凭证；排查时可从终端查看。
        child.stderr!.pipe(process.stderr, { end: false });
        const lines = readline.createInterface({ input: child.stdout! });
        lines.on("line", (line) => {
            try {
                const payload = JSON.parse(line);
                void rpc.receiveAndSend({ ...payload, jsonrpc: "2.0" }, undefined, undefined).catch((error) => { finish(error); child.kill(); });
            } catch {
                finish(new Error("Codex 返回了无效协议数据，请检查 CLI 版本"));
                child.kill();
            }
        });
        const transport: AgentTransport = { request: async (method, params) => await rpc.request(method, params, undefined), close: () => { finish(new Error("本地连接服务已关闭")); lines.close(); child.stdin!.end(); child.kill(); } };
        try {
            await transport.request("initialize", { clientInfo: { name: "oioi_canvas", title: "Flow Canvas", version: "1.0.0" }, capabilities: { experimentalApi: true } });
            rpc.notify("initialized", {}, undefined);
            return transport;
        } catch (error) {
            transport.close();
            throw error;
        }
    };
}

export const startCodex = createCodexTransport("codex");
