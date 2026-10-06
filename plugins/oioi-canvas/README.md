# oioi Canvas 插件

让 Codex / ZCode 打开并操作本仓库的 oioi Canvas。

安装后新建一个任务，然后输入：

```text
打开无限画布
```

插件通过 stdio MCP 调用本地 Canvas Agent 的 loopback HTTP 服务，再由同电脑浏览器执行画布工具。默认打开 `http://localhost:3100/?mode=new` 并带上连接信息；本机站点须已启动，Canvas Agent 本身不提供网页站点。使用公网站点时明确给出地址，仍须由同电脑浏览器直连 loopback，不使用远程浏览器。

对话、技能、历史与工具批准留在用户自己的原生 Agent。网页不托管对话，也不做二次审批；有效写入请求自动执行。画布项目与素材主要保存在浏览器本地，不提供云同步。

操作前先调用 `canvas_list_clients({})` 查看已连接网页，再调用 `canvas_bind_client({clientId, projectId})` 绑定列出的画布；非画布页可只传 `clientId`。每个 stdio MCP 进程独立绑定，切标签页不会改变目标。导航或换画布后重新列出并绑定；目标断开时报错，不回退其他页。`canvas_release_client({})` 用于解除绑定。

本轮目标绑定调整仍需测试，使用时以当前 MCP 工具声明为准；更新插件后新建对话，让技能和工具重新加载。

## 安装

如果之前安装过旧插件 `infinite-canvas`，先移除再安装：

```powershell
codex plugin remove infinite-canvas
```

在本仓库根目录执行：

```powershell
codex plugin marketplace add "$PWD"
codex plugin add oioi-canvas@oioi-canvas-local
```

macOS / Linux：

```bash
codex plugin marketplace add "$(pwd)"
codex plugin add oioi-canvas@oioi-canvas-local
```

也可以只把插件目录加为 marketplace：

```powershell
codex plugin marketplace add "$PWD\plugins\oioi-canvas"
codex plugin add oioi-canvas@oioi-canvas-local
```

## ZCode

- 打开 **Settings → Plugin Management → Discover**，点击右上角 **`+`** 添加 marketplace。
- 选择本仓库根目录，或 `plugins/oioi-canvas` 目录。
- 安装 `oioi-canvas` 后新建任务即可使用。
