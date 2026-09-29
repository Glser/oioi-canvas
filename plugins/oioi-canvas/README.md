# oioi Canvas 插件

让 Codex / ZCode 打开并操作本仓库的 oioi Canvas。

安装后新建一个任务，然后输入：

```text
打开无限画布
```

插件会启动本地 Agent，打开 `http://localhost:3100/?mode=new`，并自动带上连接信息。

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
