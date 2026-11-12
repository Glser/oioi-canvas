# oioi-canvas Agent

通过 npm CLI 将同一台电脑上的 Flow 网页接到本地 Codex：网页承接对话，本地服务管理原生会话，画布操作继续使用 stdio MCP。无需桌面安装包，也不在网页重建 Agent 推理循环。

> 当前源码已增加网页会话能力，尚未发布新的 npm 版本。npm 上已有的 0.6.0 仅提供原生 Agent → 画布桥接，不能用于新版网页协议。当前请使用源码开发入口；发布后再使用下面的安装方式。

## 使用方式

已有本地 Agent 的用户只需准备 Node.js，并在允许 Agent 操作的工作目录中启动连接器。CLI 会自动检测现有程序，不需要填写 Agent 安装路径、重新录入模型或手动注册受管 MCP：

```bash
npx -y @oioi-npm/canvas-agent --origin <网页地址>
# 例如：npx -y @oioi-npm/canvas-agent --origin http://localhost:3100
```

仅未安装 Codex 时需要 `npm install -g @openai/codex`，仅原生运行时报告需要认证时才需要 `codex login`；已有可用配置不要求重新登录。Windows PowerShell 可使用 `npm.cmd` / `npx.cmd`。当前对接 Codex app-server 的会话、历史分页和审批协议；旧 CLI 缺少对应接口时需要升级。网页对话首版仅支持 Codex，原有外部 Agent MCP 接入仍保留。

1. 在网页复制连接器命令，在本机终端运行并保持运行。命令中的 `--origin` 是当前网页地址，用于自动连接，不需要输入地址、Token 或配对码。关闭终端会断开连接，当前没有后台常驻。
2. 网页检测到连接器后自动接入本机 Agent。后续只要再次启动连接器即可恢复；手动断开会暂停自动重连。
3. 在首页输入需求会创建画布并保存待发送内容；未连接也不会要求复制需求。画布就绪并连接 Codex 后自动提交第一条消息。
4. 在 Agent 侧栏继续对话、查看工具进展、回答问题、允许或拒绝操作、停止当前执行。连接服务与 Codex 会话状态分开显示。

受管会话自动注入画布 MCP，不要求用户注册全局 MCP。新会话使用启动 CLI 时的目录，模型、权限和原生指令沿用 Codex 的生效配置，不再写死 sandbox/approvalPolicy。网页展示实际权限；本机已配置无审批或不受限沙箱时会明确提示。网页不能任意指定本地执行程序或目录。

## 自动发现和能力读取

- CLI 启动后使用系统 PATH/PATHEXT 查找 Codex、Claude Code、CodeBuddy、OpenCode，并读取版本；网页显示机器、安装路径、检测结果和「重新检测」入口。离线时展示本浏览器上次检测结果并标为离线，不把缓存当作实时可用状态。
- 当前仅 Codex 具有网页执行适配；其他运行时即便已安装，也明确显示「尚未适配」，不会声称能够执行。不会静默安装或升级第三方工具。
- 在创建对话前即可通过原生接口读取本地配置、模型目录、Skills 和 MCP；网页不显示账号内容、API Key、Token、环境变量或原始配置对象。
- 默认「跟随 Runtime」不覆盖当前模型/推理参数。模型与推理强度选项来自原生目录，当前自定义模型即便不在目录也保留显示；目录失败不猜测其他模型。网页选择随下一轮提交传给 Codex，只作用于该会话，不写全局配置。
- 网页协议为 9；前台进程、首次授权和原生认证仍然是必要条件，本轮没有实现后台 daemon 或所有 Agent 的执行接入。

## 会话、目标与历史

- 同一网站来源、同一画布关联一个原生 thread。执行目标固定为 `clientId + projectId`；运行中不能由另一个标签页夺取，网页换画布或断开后工具会报错，不回退到其他页面。
- 网页待发送内容使用 localforage；每条提交带唯一标识。服务保存提交回执，刷新与重连不会自动重复发送已接收的任务。接收状态不确定时保留待核对提示，不自动重放。
- 原生 Codex 保存正文历史；`~/.oioi-canvas/conversations.json` 只保存会话映射、目录和回执。该清单的版本独立于网页协议，损坏或未知版本拒绝覆盖，不按数量截断历史元数据。
- 消息使用 `threadId / turnId / itemId` 归属；完成的原生历史快照替代实时内容，不重复拼接。网页关闭并不代表画布工具仍可执行，重新打开后需恢复连接。
- 当前仅转发命令/文件/权限确认和结构化用户问题；未支持的原生交互明确拒绝并提示，不静默放行。

## 连接与开发

网页给用户看的是连接器命令，不是源码启动步骤。本地开发可在仓库根目录运行：

```bash
npm --prefix canvas-agent run dev -- --origin http://localhost:3100
```

也可以在本目录安装依赖后运行：

```bash
npm install
npm run dev -- --origin http://localhost:3100
```

`npm run dev` 使用当前包目录作为新会话的工作目录。需要其他目录时，从对应目录运行本包 CLI 入口。

排查时可加 `--debug`，桥接日志位于 `~/.oioi-canvas/logs/`；Codex 的进程诊断输出保留在终端，不向网页转发。连接配置位于 `~/.oioi-canvas/canvas-agent.json`。

## 保留的外部 Agent MCP 模式

仍可从原生 Codex / Claude Code 调用画布工具；这与网页托管对话是两个入口。已有插件提供 MCP 时不要重复注册：

```bash
codex mcp add oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp
claude mcp add --scope user --transport stdio oioi-canvas -- npx -y @oioi-npm/canvas-agent@latest mcp
```

该模式仍需启动 HTTP 服务，业务工具调用前通过 `canvas_list_clients`、`canvas_bind_client` 明确目标。受管网页会话的 MCP 不暴露这些重新绑定工具。

## 发布

本包版本独立于根目录 `VERSION`；本次未执行构建、npm 发布或版本提升。后续发布需检查 HTTP 与 stdio MCP 两个入口、实际 Codex 协议和 Windows 路径行为，再使用拥有 scope 权限的 npm 账号发布。推送仓库不会自动发布此包。
