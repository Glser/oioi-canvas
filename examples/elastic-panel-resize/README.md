# 弹性面板缩放

独立场景没有标题、面板内容、工具栏、模拟鼠标、网络请求或复制操作。所有纹理、样式和 SVG 均内嵌于核心；组件不修改宿主 body、全局样式或已有 ID。示例页面自己的 margin 重置不属于组件样式。

## 当前项目直接运行

```powershell
cd D:\Java\api\oioi-canvas\web
bun install --frozen-lockfile
bun run dev
```

打开 `http://localhost:3100/elastic-panel-resize.html`。实际工作区的左侧画布面板、右侧 Agent 面板也已使用相同核心，不需要启动连接器即可测试缩放。

## 四个核心文件

位于 `web/src/components/elastic-panel-resize/`，文件均为完整实现：

- `ElasticPanelResize.tsx`：React 独立场景与实际侧栏把手入口；只在挂载后访问 DOM。
- `ElasticPanelResizeEngine.js`：零框架依赖的 DOM、内嵌 CSS、双 path SVG、指针/键盘状态、物理积分、ResizeObserver 和资源清理。
- `motion-runtime.ts`：共享挂载、选项更新、销毁与再次挂载生命周期。
- `ElasticPanelResizeEngine.d.ts`：核心 API、选项、实例及提交回调类型。

`example.tsx` 是当前 Vite 开发环境的 React 示例入口，`web/elastic-panel-resize.html` 是独立页面，不增加应用业务路由。

### 复用到 React 项目

复制上述四个文件到同一目录，安装框架本身即可；不需要动画库、图形库或远程素材：

```sh
npm install react react-dom
```

```tsx
import { ElasticPanelResize } from "./ElasticPanelResize";

export default function App() {
    return <ElasticPanelResize />;
}
```

可更新高度与动态偏好，不会重新挂载或清空当前宽度/拖动状态：

```tsx
<ElasticPanelResize options={{ height: 640, reducedMotion: true }} />
```

`height` 接受 CSS 像素数或 CSS 高度字符串，省略时场景为正方形；`reducedMotion` 省略或设为 `undefined` 时跟随系统。选项对象可以在渲染时直接创建，实例不会因此重建。

## 六框架的完整原生入口

本目录每个框架子目录均包含独立 `package.json`、`vite.config.ts`、`index.html` 和实际入口。它们引用同一套核心，不复制算法，也不使用 iframe：

| 目录 | 原生入口 / 清理方式 | 可选示例依赖 |
| --- | --- | --- |
| `react/` | `App.tsx`、`main.tsx`；组件 effect 清理 | React、React DOM、Vite React 插件 |
| `vue/` | `ElasticPanelResize.vue`、`main.ts`；onMounted/watch/onBeforeUnmount | Vue、Vite Vue 插件 |
| `svelte/` | `ElasticPanelResize.svelte`、`main.ts`；Svelte 5 action/update/destroy | Svelte、Vite Svelte 插件 |
| `solid/` | `ElasticPanelResize.solid.tsx`、`main.tsx`；onMount/createEffect/onCleanup | Solid、Vite Solid 插件 |
| `preact/` | `ElasticPanelResize.preact.tsx`、`main.tsx`；原生 Preact hooks | Preact、Vite Preact 插件 |
| `vanilla/` | `vanilla.js`、`main.js`；显式 update/destroy | 仅用于提供 HTTP 开发服务的 Vite |

运行任一完整示例（以下以 Vue 为例，其他框架替换目录名即可）：

```powershell
cd D:\Java\api\oioi-canvas\examples\elastic-panel-resize\vue
npm install
npm run dev
```

打开终端打印的本机 URL。子目录的依赖只用于该框架示例，不需要安装到应用 `web/`，也不会把其他框架打包到 React 应用中。共享源码使用相对路径引用，因此请保留仓库目录结构；移出仓库时将四个核心文件一起复制并调整入口的 import。

Vanilla 生命周期完整用法：

```js
import { createElasticPanelResize } from "./ElasticPanelResizeEngine.js";

const host = document.querySelector("#app");
const first = createElasticPanelResize(host, { height: 640 });
first.update({ height: 720, reducedMotion: true });
first.update({ reducedMotion: undefined });
first.destroy();
first.destroy(); // 幂等；不会再次释放或影响其他实例。
const second = createElasticPanelResize(host);
// 宿主卸载时调用 second.destroy()。
```

每个独立实例拥有自己的状态、ID、指针、隐藏计时器、RAF、监听器和观察器。框架示例均提供原生卸载及开发热更新清理。

## 实际项目侧栏

`ElasticPanelResizeHandle` 挂在现有 aside 内，`panelRef` 指向现有宽度 shell。它只控制 shell 宽度，不替换面板内容、不挤压画布、不新增连接器或网络行为。

- 左侧继续使用现有 220–480px、默认 280px；右侧继续使用现有 360–760px、默认 440px。
- 小窗口下边界不超过容器宽度；左右方向镜像，键盘箭头始终沿可见边缘的物理方向移动，Home 扩宽、End 收窄。
- 项目外观使用现有 `--wb-*` 主题变量，独立场景使用要求的浅灰/白色；不覆盖页面背景。
- 拖动过程中由核心直接更新 DOM；松手、取消和键盘提交时才更新已有 store 与极小的宽度配置。`onCommit` 的第二个参数含 `percentage` 和 `cancelled`。
- 开合动画、内容滚动和遮罩行为保持不变；关闭或卸载侧栏会结束当前手势。

## 交互及几何

以 1000px 为视觉设计基准，小容器等比缩小，大容器横向展开、装饰不放大，故橡皮筋实际位移始终不超过 15px。默认左边缘为场景宽度的 38.65%，合法范围 27.6%–50%。名义宽度百分比不扣 17px 右间距，实际白色面板内容宽度扣除此间距。

- 初始没有可见把手。靠近整条边缘、触屏按下或聚焦时显示；离开且无拖动/聚焦后等待 450ms，再收细隐藏。
- 合法区域直接跟随，不给位置加拖动弹簧；超界使用指定指数橡皮筋。移动速度只驱动把手，松手后速度清零，不从位置回弹推导弯曲方向。
- RAF 使用 `dt <= 1/30` 和四个子步；位置 400/26，弯曲/横移 680/34，形状指数插值系数 32。路径始终是同两条二次贝塞尔 path。
- 回弹中重抓从可见位置反算当前橡皮筋原始坐标，避免第一步再次压缩已经压缩过的位移；零尺寸先按 1000 初始化，正尺寸观测后再更新，忽略零宽度观测。
- 左/右箭头步长 2%，Shift 为 6%；Home/End 到边界；Escape 取消拖动，非拖动 Escape 与双击恢复初始值。只在提交时 aria-live 宣告，不逐帧播报。
- 减少动态效果仍支持全部输入与状态，但边界立即到达，把手保持直胶囊，不弯曲、不播放越界回弹。
- 指针捕获失败会通过隐藏状态区给出重试/键盘操作提示；本组件没有复制功能，因而不添加虚假的复制成功/失败反馈。

## 验收入口

在独立示例检查鼠标悬停、左右反向拖动、两端过拉、回弹中重抓、边缘外释放、双击和键盘；在实际画布检查左右面板、关闭中断、内容滚动及浅深主题。测试组件可在同一父容器渲染两个实例，卸载其中一个不应改变另一个。

浏览器验证及尚待确认的范围记录于 `docs/content/docs/progress/pending-test.mdx`。本次不修改 npm 连接器、不发布 npm 包、不更改 Agent 自动启动方式。
