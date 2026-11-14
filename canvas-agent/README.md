# oioi-canvas Agent

通过 npm CLI 将同一台电脑上的 Flow 网页接到本地 Codex / Claude Code：网页承接对话，本地服务管理原生会话，画布操作继续使用 stdio MCP。无需桌面安装包，也不在网页重建 Agent 推理循环。

> 0.9.0 使用网页协议 13，新增 `install` / `uninstall` 子命令：一次安装注册登录自启并后台运行，重启电脑后网页自动重连。升级后运行一次 `npx -y @oioi-npm/canvas-agent@latest install --origin <网页地址>` 即可。

## 使用方式

已有本地 Agent 的用户只需准备 Node.js，并在允许 Agent 操作的工作目录中启动连接器。CLI 会自动检测现有程序，不需要填写 Agent 安装路径、重新录入模型或手动注册受管 MCP：

```bash
npx -y @oioi-npm/canvas-agent@latest install --origin <网页地址>
# 例如：npx -y @oioi-npm/canvas-agent@latest install --origin http://localhost:3100
```

`install` 会注册系统登录自启（Windows 启动文件夹 / macOS LaunchAgent / Linux autostart）并立即在后台启动连接器，只需执行一次；之后开机自动运行，打开网页即自动连接。移除时运行 `npx -y @oioi-npm/canvas-agent@latest uninstall`。不带子命令直接运行仍为前台模式，适合临时使用或排查。

仅缺少运行时时才需要安装：Codex 使用 `npm install -g @openai/codex`，Claude Code 使用 `npm install -g @anthropic-ai/claude-code`。已有可用本机配置无需重新录入；原生运行时报告需要认证时，再在本机完成登录或凭证配置。Windows PowerShell 可使用 `npm.cmd` / `npx.cmd`。连接器要求 Node.js 18.14 或更新版本；旧 CLI 缺少原生接口时需升级。

1. 在网页点击「复制连接说明」，发给这台电脑上的 Codex 或 Claude Code，由它检查环境并执行一次 install 命令；需要登录或授权时按提示完成。说明内包含带当前网页 `--origin` 的命令与所需协议版本，不需要用户填写地址、Token 或配对码。install 会注册开机自启并在后台启动连接器，执行成功后无需保持终端；发布版协议不兼容时需明确报告，不能视为连接成功。
2. 网页检测到连接器后自动接入本机 Agent。已 install 的机器重启后连接器自动在后台运行，网页打开即自动连接；手动断开会暂停自动重连。
3. 连接后可在首页、生图、视频、提示词、素材、配置及画布页打开 Agent 侧栏，共用同一组对话、会话历史和工作目录；切页不清空输入或中断当前会话。在首页输入需求仍会先创建画布，待目标画布就绪后再提交。
4. 在 Agent 侧栏继续对话、查看工具进展、回答问题、允许或拒绝操作、停止当前执行。每轮提交绑定当时的画布，执行期间切换画布不会把工具操作转到新画布；无画布时仍可对话和使用站点工具。连接服务与 Codex 会话状态分开显示。

受管会话自动注入画布 MCP，不要求用户注册全局 MCP。新会话使用启动 CLI 时的目录，也可通过目录选择创建会话；模型、权限和原生指令沿用所选运行时的配置。网页不能任意指定本地执行程序。

在连接设置的运行时列表中选择 Claude Code 即可新建 Claude 会话；原 Codex 对话保留在历史列表中，恢复时按记录启动对应运行时。执行中、有审批或待发送消息时禁止切换。

Claude 通过官方 Agent SDK 调用本机 PATH 中的 CLI，加载 user / project / local 配置及原生指令，凭证留在本机。支持流式回复、工具进展、单次审批、结构化提问、MCP 授权、停止及原生 session 恢复；模型和推理选项来自原生目录，不写全局配置。权限选项提供跟随运行时、常规审批和完整访问，不把 Claude 的规划模式当成只读沙箱。

## 自动发现和能力读取

- CLI 启动后使用系统 PATH/PATHEXT 查找 Codex、Claude Code、WorkBuddy，并读取版本；网页显示机器、安装路径、检测结果和「重新检测」入口。离线时展示本浏览器上次检测结果并标为离线，不把缓存当作实时可用状态。
- Codex 和 Claude Code 具有网页执行适配；其他运行时即便已安装，也明确显示「尚未适配」。不会静默安装或升级第三方工具。
- 在创建对话前即可通过原生接口读取本地配置、模型目录、Skills 和 MCP；网页不显示账号内容、API Key、Token、环境变量或原始配置对象。
- 默认「跟随 Runtime」不覆盖当前模型/推理参数。模型与推理强度选项来自原生目录，当前自定义模型即便不在目录也保留显示；目录失败不猜测其他模型。网页选择随下一轮提交传给 Codex，只作用于该会话，不写全局配置。
- 网页协议为 13；首次授权和原生认证仍然是必要条件。后台模式由 `install` 注册的登录自启项维护，原生执行接入仅支持已适配运行时。

## 会话、目标与历史

- 同一网站来源共用一组原生会话，使用空 `projectId` 保存全站会话映射；旧画布映射原样保留，不自动迁移。每轮画布目标固定为发送时的 `clientId + canvasProjectId`；运行中不能由另一个标签页夺取，网页换画布或断开后画布工具会报错，不回退到其他页面。对话、审批和停止不依赖当前是否打开画布。
- 网页待发送内容使用 localforage；每条提交带唯一标识。服务保存提交回执，刷新与重连不会自动重复发送已接收的任务。接收状态不确定时保留待核对提示，不自动重放。
- 原生 Codex / Claude Code 保存各自正文历史；`~/.oioi-canvas/conversations.json` 只保存运行时、会话映射、目录和回执。清单版本 3 独立于网页协议，升级前独占写入备份，保留原有 Codex 记录；损坏或未知版本拒绝覆盖，不按数量截断历史元数据。
- 消息使用 `threadId / turnId / itemId` 归属；完成的原生历史快照替代实时内容，不重复拼接。网页关闭并不代表画布工具仍可执行，重新打开后需恢复连接。
- 当前仅转发命令/文件/权限确认和结构化用户问题；未支持的原生交互明确拒绝并提示，不静默放行。

## 连接与开发

网页引导用户复制连接说明并发送给自己的本机 Agent，具体命令包含在说明中。本地开发可在仓库根目录运行：

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

本包版本独立于根目录 `VERSION`。发布时生成最新 `dist`、检查打包内容，再使用拥有 scope 权限的 npm 账号发布到官方 registry。推送仓库不会自动发布此包。
