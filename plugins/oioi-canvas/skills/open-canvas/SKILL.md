---
name: open-canvas
description: 打开 oioi Canvas 并自动连接本地 Canvas Agent。用户要求打开、启动、进入或使用画布时使用。
---

# 打开 oioi Canvas

默认打开本机画布 `http://localhost:3100`，该站点须已启动；未启动时告知用户，不把 Canvas Agent 当成网页服务。只有用户明确给出其他地址时，才改用该地址。

无论本机站点还是公网站点，都必须用运行 Canvas Agent 的同一台电脑上的浏览器直接连接 loopback；不要使用云端远程浏览器、其他电脑或手机。

不要让用户复制 Local URL、Connect token 或手动填写连接表单。

## 步骤

1. 如果本机还没有 Canvas Agent 网页连接服务，启动并保持运行：

```bash
npx -y @oioi-npm/canvas-agent@latest
```

2. 从启动输出读取 `Local URL` 和 `Connect token`。

3. 在同电脑的本机浏览器中打开下面地址，把 Local URL 和 token 分别 URL 编码后填进 hash。不要公开输出或分享包含 token 的完整地址；浏览器若提示本地网络访问权限，由用户授权。

```text
http://localhost:3100/?mode=new#agentUrl=<Local URL>&agentToken=<Connect token>
```

未指定打开方式时用 `mode=new` 新建画布。只有用户明确要求时才替换为：

- 最近画布：`mode=recent`
- 自己选择：`mode=choose`

4. 用 `canvas_list_clients({})` 确认网页已连接，再用 `canvas_bind_client({clientId, projectId})` 绑定列出的目标画布。没有可识别的目标或有多个候选时，询问用户，不默认跟随活动标签页；导航或换画布后重新列出并绑定。

## 说明

插件加载时会启动 `npx -y @oioi-npm/canvas-agent@latest mcp`，只提供 stdio MCP 工具，不提供网页连接服务，也不执行 Agent 对话。普通 Canvas Agent 提供 loopback HTTP/SSE 桥接。两个进程读取同一份本机配置，因此不必让用户手动填写地址或 token。

对话、技能、历史和工具批准都留在用户的原生 Agent。不要关闭或绕过其权限流程，网页也不提供二次审批。网页不托管对话，画布和素材不云同步。
