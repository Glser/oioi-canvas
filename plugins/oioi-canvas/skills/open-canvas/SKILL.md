---
name: open-canvas
description: 打开 oioi Canvas 并自动连接本地 Canvas Agent。用户要求打开、启动、进入或使用画布时使用。
---

# 打开 oioi Canvas

默认打开本机画布 `http://localhost:3100`。只有用户明确给出其他地址时，才改用该地址。

不要让用户复制 Local URL、Connect token 或手动填写连接表单。

## 步骤

1. 如果本机还没有 Canvas Agent 网页连接服务，启动并保持运行：

```bash
npx -y @basketikun/canvas-agent@latest
```

2. 从启动输出读取 `Local URL` 和 `Connect token`。

3. 在 Codex 内置浏览器打开下面地址，把 Local URL 和 token 填进 hash：

```text
http://localhost:3100/?mode=new#agentUrl=<Local URL>&agentToken=<Connect token>
```

未指定打开方式时用 `mode=new` 新建画布。只有用户明确要求时才替换为：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`

## 说明

插件加载时会启动 `npx -y @basketikun/canvas-agent@latest mcp`，只提供画布 MCP 工具，不提供网页连接服务。上面的普通 Canvas Agent 负责网页连接。两个进程读取同一份本地配置，因此不必让用户手动填写地址或 token。
