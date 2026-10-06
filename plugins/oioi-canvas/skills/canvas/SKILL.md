---
name: canvas
description: 操作 oioi Canvas 已绑定的网页画布，先列出并绑定目标，再读取节点、选区、创建文本节点、创建生成流程、连接节点或触发生成。
---

# oioi Canvas

你正在帮助用户操作 oioi Canvas 网页画布。需要理解或改动画布时，优先使用已配置的 `oioi-canvas` MCP 工具；不要让用户手动复制 JSON、URL 或 token。

## 工作流

- 如果用户还没有打开或连接网页画布，使用 `open-canvas` 技能打开画布，不要要求用户手动复制 URL 或 token。
- 操作前先调用 `canvas_list_clients({})`，按 `clientId`、路径、网页标题、`projectId` 和画布标题识别目标。多个网页且用户意图不明确时，先询问，不默认选择最近活动页。
- 调用 `canvas_bind_client({clientId, projectId})` 明确绑定。画布目标的 `projectId` 使用列表里的值，防止列表后网页换了画布；非画布页可只传 `clientId`。绑定仍会固定网页当时的画布 ID，不是跟随焦点。
- 所有业务工具须先绑定，再调用 `canvas_get_state` 读取目标画布；如果用户明确提到选中内容、当前节点或“这个”，先用 `canvas_get_selection`。
- 每个 stdio MCP 进程有独立绑定。切换标签页不会改变目标；网页导航、换画布或工具提示目标已变化时，重新列出并确认、绑定目标，不拿旧节点 ID 操作新画布。
- 目标断开时停止操作并告知用户，不回退到其他标签页。需要解除目标时调用 `canvas_release_client({})`，解除后须重新绑定才能继续业务工具。
- 创建单个文本内容优先用 `canvas_create_text_node`。
- 创建生成内容优先用 `canvas_generate_text`、`canvas_generate_image`、`canvas_generate_video`、`canvas_generate_audio`。
- 需要把提示词、配置和生成节点串成流程时，使用 `canvas_create_generation_flow` 或项目已有的流程工具。
- 需要批量增删改、移动、连接节点或设置视口时，使用 `canvas_apply_ops`。
- 不要模拟鼠标点击，不要要求用户手动复制 JSON。
- 工具批准由本地原生 Agent 的权限流程处理，不要关闭或绕过审批，也不要替用户自动批准。网页收到有效工具请求后自动执行，不做二次审批；执行是否成功以工具结果为准。
- 网页不托管对话，画布和素材主要保存在浏览器本地，不提供云同步。不要把 MCP 桥接误当成云端存储。

## 风格

- 页面文案和画布节点内容默认使用中文。
- 生成节点、配置节点和提示词节点要保持结构清晰，方便用户继续编辑。
- 批量创建节点时注意给节点留出间距，不要堆叠在同一个位置。
- 图片、视频、音频等媒体节点默认保留原始比例；只有用户明确要求自由变形时才改变比例。
- 生成流程尽量少而清楚，优先让用户一眼能看懂节点关系。
