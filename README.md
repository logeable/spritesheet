# Sprite — 精灵表工作台

在浏览器里打开一张精灵图（spritesheet），按均匀网格切分、浏览与导出单帧或整行动画帧。技术栈为 **React 19**、**TypeScript**、**Vite 8**。

## 功能概览

- **贴图**：本地上传或 URL 加载 WebP/PNG 等。
- **网格**：单元宽高、行列数；支持按行列反推单元尺寸。
- **每行帧数**：每一行可单独设置实际帧数（不超过网格列数），用于行尾留白或不同动画长度。
- **画布**：滚轮以指针为锚缩放、拖拽平移、像素风渲染；可选「聚焦中心」。
- **胶片条与预览**：当前行的帧缩略图；预览区按 FPS 播放，播放/暂停为普通按钮。
- **导出**：当前行连续帧为多个 PNG（`{basename}_r{row}_f{col}.png`）；可下载 **manifest JSON**（网格配置 + `rowFrameCounts`）。

## 开发与构建

需要 [Node.js](https://nodejs.org/) 与 [pnpm](https://pnpm.io/)（或自行用 npm/yarn 等价命令）。

```bash
pnpm install
pnpm dev          # 本地开发，默认 http://localhost:5173
pnpm run build    # 类型检查 + 生产构建，输出 dist/
pnpm run preview  # 本地预览构建结果
pnpm run lint     # ESLint
```

## Manifest 约定（节选）

导出 JSON 大致结构如下，便于引擎或工具读取：

| 字段 | 说明 |
|------|------|
| `version` | 当前为 `1` |
| `image` | 精灵图文件名 |
| `grid` | 单元宽高与行列数等网格配置 |
| `rowsAreAnimations` | 固定 `true`，表示按行视为动画 |
| `rowFrameCounts` | 每行实际帧数数组，与 `grid.colCount`（列上限）配合使用 |

## 许可证

私有项目；如需开源请自行补充 `LICENSE`。
