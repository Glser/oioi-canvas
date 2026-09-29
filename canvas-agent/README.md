# oioi-canvas Agent

本地 Canvas Agent 用来把网页画布接到用户自己的 Codex / Claude Code。对话、技能和日志都在用户的 Agent 里完成，网页只负责连接和执行画布工具。

本地开发时优先连接 `http://localhost:3100`。云端打开的画布也是连你电脑上的 `127.0.0.1`，不需要内网穿透。

## 启动

```bash
npx -y @basketikun/canvas-agent@latest
```

带上 `@latest` 是因为 npx 会缓存已下载的版本，不加就可能一直运行旧版本。

需要排查连接或工具调用问题时，可开启 Debug 模式：

```bash
npx -y @basketikun/canvas-agent@latest --debug
```

Debug 日志会保存到 `~/.oioi-canvas/logs/canvas-agent-YYYY-MM-DD.log`。终端日志带级别颜色，文件日志为纯文本；token 与图片 Data URL 会自动隐藏。

本仓库开发时也可以直接运行：

```bash
cd canvas-agent
npm install
npm run build
node dist/index.js
```

启动后会输出本机地址和 token：

```txt
Local URL: http://127.0.0.1:17371
Connect token: xxxxxx
```

在画布右上角点击 `Agent`，按连接说明操作。安装 oioi-canvas 插件后，Codex 会读取 Local URL 和 Connect token 并直接打开画布；Canvas Agent 不负责生成画布打开 URL。

Canvas Agent 默认只监听 `127.0.0.1`。网页第一次带正确 token 连接后，Canvas Agent 会记录该网页 Origin；之后其他 Origin 不能复用这个本地 Agent，除非用户清理 `~/.oioi-canvas/canvas-agent.json` 里的 `origins`。

## 发布

`canvas-agent` 使用自己的 `package.json` 版本号，不跟仓库根目录 `VERSION` 绑定。推送到 `main` 后，GitHub Actions 会检查 npm 上是否已经存在当前包版本；不存在时才发布 `@basketikun/canvas-agent`。

发布前需要在 GitHub 仓库 Secrets 中配置 `NPM_TOKEN`。

## Codex MCP

直接运行 `npx -y @basketikun/canvas-agent@latest` 只启动本机网页连接服务，不会安装 MCP。只有安装 oioi-canvas 插件，或手动执行 `codex mcp add` 后，`oioi-canvas` 工具才会进入 Codex 上下文。

通过插件安装时移除插件：

```bash
codex plugin remove oioi-canvas
```

手动添加 MCP 时移除 MCP：

```bash
codex mcp remove oioi-canvas
```

### Codex app 插件

仓库内提供了 Codex app 插件：`plugins/oioi-canvas`。在 Codex app 中添加本仓库的 marketplace 后，可以安装 `oioi Canvas` 插件；插件会注册 `oioi-canvas` MCP，并带上画布操作说明。

添加本地 marketplace 时建议使用仓库绝对路径：

```bash
cd /path/to/oioi-canvas
codex plugin marketplace add "$(pwd)"
codex plugin add oioi-canvas@oioi-canvas-local
```

插件默认通过 npm 启动 MCP；这个命令只提供 MCP 工具，不会把 MCP 写入全局配置：

```bash
npx -y @basketikun/canvas-agent@latest mcp
```

使用时可以直接在 Codex 里说“打开无限画布”，插件会启动本地 Agent，读取 Local URL 和 Connect token，然后打开 `http://localhost:3100/?mode=new` 并自动新建、连接画布。

手动给 Codex 添加 MCP：

```bash
codex mcp add oioi-canvas -- npx -y @basketikun/canvas-agent@latest mcp
```

本仓库开发时可以改成：

```bash
codex mcp add oioi-canvas -- node /path/to/oioi-canvas/canvas-agent/dist/index.js mcp
```

如果希望终端里的 Codex 不被 MCP 审批卡住，可以在 `~/.codex/config.toml` 里给这个 MCP 设置自动放行：

```toml
[mcp_servers.oioi-canvas]
command = "npx"
args = ["-y", "@basketikun/canvas-agent@latest", "mcp"]
default_tools_approval_mode = "approve"
```

网页收到画布写操作后会自动执行，不再二次确认。

## Claude Code

如果希望 Claude Code 也能操作画布，需要添加同一个 MCP。建议用 user scope：

```bash
claude mcp add --scope user --transport stdio oioi-canvas -- npx -y @basketikun/canvas-agent@latest mcp
```

本仓库开发时可以改成：

```bash
claude mcp add --scope user --transport stdio oioi-canvas -- node /path/to/oioi-canvas/canvas-agent/dist/index.js mcp
```
