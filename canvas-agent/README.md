# oioi-canvas Agent

本机 HTTP bridge 将同电脑浏览器的 oioi Canvas 接到用户自己的原生 Codex / Claude Code：`原生 Agent → stdio MCP → 本机 bridge → 浏览器工具`。对话、模型、权限、技能和历史由原生 Agent 管理，bridge 不运行 Agent 执行引擎。

## 快速开始

`@oioi-npm/canvas-agent@0.6.0` 已公开发布到 npm，以下命令可直接使用。Windows PowerShell 中可使用 `npx.cmd` 避免脚本执行策略限制；调试源码时按「连接与开发」启动。

1. 在电脑终端启动 bridge，保持终端运行：

   ```bash
   npx -y @oioi-npm/canvas-agent@latest
   ```

   终端会输出 `Local URL: http://127.0.0.1:17371` 和一个 6 位 `配对码`。若本机网页（默认 `http://localhost:3100`）已在运行，bridge 会自动用默认浏览器打开画布页并带上连接参数，无需手动复制地址；网页未运行时只打印地址，不弹浏览器。`@latest` 避免 npx 一直使用旧缓存；排查问题时可在命令后加 `--debug`，日志位于 `~/.oioi-canvas/logs/`，token 与图片 Data URL 会隐藏。

2. 给原生 Agent 注册 MCP；已有 oioi-canvas 插件提供 MCP 时跳过，避免重复注册。

   Codex：

   ```bash
   codex mcp add oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp
   ```

   Claude Code：

   ```bash
   claude mcp add --scope user --transport stdio oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp
   ```

   默认启动命令仅运行 bridge，`mcp` 子命令仅提供 stdio 工具，两者不是同一个进程。MCP 从 `~/.oioi-canvas/canvas-agent.json` 读取同一地址和 token。

3. 连接网页。网页侧 Agent 面板会轮询检测本机服务：检测到服务后，把终端显示的 6 位配对码填进「配对码」输入框并点「配对并连接」，即可用配对码换回连接 token 并自动连接，不需要复制 36 位 token。自动打开的浏览器页面已完成这一步。服务未运行时面板会提示先启动，并保留手动填写地址/token 的兜底表单。云端网页也连接你电脑的 loopback 地址，不需要内网穿透；本地网页开发地址通常为 `http://localhost:3100`，它不是 bridge 地址。

   配对码只存在 bridge 内存中、不落盘、每次启动重新生成；连续输错 5 次会锁定 60 秒。`/pair` 与 `/config`、`/health` 一样对未授权 Origin 开放，因为首次连接的用户此时还没有进入 Origin 白名单。

## 目标选择与工具

- 首先调用 `canvas_list_clients({})`，根据页面路径、标题、画布 ID 选择目标；多个标签页无法确定时询问用户，不以焦点自动选择。
- 调用 `canvas_bind_client({clientId, projectId?})`。可传列表中的 `projectId` 检查选择期间画布未变化；绑定始终记录此刻页面的画布 ID。
- 每个 MCP 进程独立保持绑定，后续站点工具只发到该页面，画布工具还会核对项目 ID。焦点变化不改目标，断线不回退到其他标签页。
- `site_navigate` 可以在绑定页面打开其他画布；项目加载后重新 list/bind 才能操作新画布。旧绑定不会跟随导航自动更新。
- 结束或换目标时调用 `canvas_release_client({})`，再明确重新绑定。

保留画布读取/批量操作/生成、画布项目列表、站点导航、图片/视频工作台、提示词库和素材工具。图片素材可用 `assets_add` 的 `imageUrl`（URL 或 dataURL）；画布图片节点用 `canvas_create_node`/`canvas_apply_ops` 的真实媒体 metadata。原生 Agent 的附件和原生生图结果不会自动导入浏览器。

权限审批遵循原生 Agent 配置；浏览器收到已授权工具后直接执行，不提供网页聊天或第二套审批流程。

## 连接与开发

bridge 默认只监听 `127.0.0.1`。每个带正确 token 的网页 Origin 都可以被授权并记录到配置，不是首个 Origin 独占；token 属于连接凭证，不要分享。`/config` 只返回地址、协议版本和是否配置 token，不泄露 token。

开发时在本目录安装依赖后使用 `npm run dev`，或构建后运行 `node dist/index.js`。注册开发 MCP 时，将命令改成 `node /绝对路径/canvas-agent/dist/index.js mcp`。

手动移除 MCP 使用 `codex mcp remove oioi-canvas` 或 `claude mcp remove --scope user oioi-canvas`；插件安装的 MCP 应通过对应 Agent 移除插件。

## 文档与发布

操作指令见 [agent-instructions.md](./agent-instructions.md)，完整文档和待测试变更见仓库 `docs/`，插件入口见 `plugins/oioi-canvas/`。

本包版本独立于根目录 `VERSION`。npm 旧包不会自动迁移到新包名；首次发布须具备 `@oioi-npm` scope 的真实发布权限，并以 public 发布。使用本机已登录的 npm 账号手动发布，按 npm 提示完成双重验证；仓库不提供此包的 GitHub Actions 发布工作流，推送代码不会发布 npm 包。发布前检查编译产物和安装包，并验证 HTTP 与 stdio MCP 两个入口。
