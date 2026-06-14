# Maestro Stickman

一个 Chrome MV3 扩展：在每个网页右下角注入一个火柴人音乐家。它随你的打字速度演奏、空闲时休息、久不动时睡觉，点击会有反应。

> 开箱即用的是 **CSS/SVG 占位小人**。当你把真实的 `maestro_stickman.riv` 放进 `public/` 后，组件会自动改用 Rive 动画。

## 技术栈

- React 18 + TypeScript
- Chrome Extension Manifest V3（内容脚本注入）
- Vite（单文件 IIFE 构建 → `dist/content.js`）
- `@rive-app/react-canvas`（Rive 集成，资源可选）

## 目录结构

```
maestro-stickman/
├── manifest.json
├── package.json
├── vite.config.ts
├── tsconfig.json
├── public/
│   └── maestro_stickman.riv        ← 以后由你提供（可选）
└── src/
    ├── vite-env.d.ts
    ├── content/
    │   ├── main.tsx                ← 内容脚本入口：注入 CSS + 挂载 React + keydown 监听
    │   └── StickmanWidget.tsx      ← 组件：有 .riv 走 Rive，否则 SVG 占位
    ├── logic/
    │   ├── typingTracker.ts        ← 3s 滚动窗口 / keys-per-sec / 空闲秒数（仅时间戳）
    │   └── characterState.ts       ← 状态机 + 数值映射 + 点击爆发逻辑
    └── styles/
        └── widget.css              ← 布局 + 占位小人按 [data-state] 驱动的动画
```

## 隐私

只记录 `input` / `textarea` / `contenteditable` 内的 **keydown 时间戳**，绝不读取、保存、上传任何输入内容。无远程 API、无远程脚本、无网络请求，全部本地打包。

## 状态 → 数值（`character_state` 输入）

| state | value |
|---|---|
| idle | 0 |
| typing_slow | 1 |
| typing_normal | 2 |
| typing_fast | 3 |
| resting | 4 |
| sleeping | 5 |
| clicked | 6 |
| annoyed | 7 |

## Rive 约定（当你提供 `.riv` 时）

- Artboard: `Stickman`
- State Machine: `StickmanMachine`
- Numeric Input: `character_state`
- 文件路径: `public/maestro_stickman.riv`（构建时自动拷到扩展根，已在 `web_accessible_resources` 声明）

---

## 1. 安装依赖

```bash
cd maestro-stickman
npm install
```

## 2. 本地开发

```bash
npm run dev      # = vite build --watch，每次保存自动重建 dist/
```

先按第 4 步把 `dist/` 加载为「已解压的扩展程序」一次；之后每次重建只需在 `chrome://extensions` 里点扩展卡片上的 **「刷新」**，再刷新网页即可看到改动。

## 3. 构建

```bash
npm run build    # tsc --noEmit && vite build → dist/content.js + dist/manifest.json（有 .riv 则一并拷入）
```

## 4. 在 Chrome 里加载

1. 执行 `npm run build`。
2. 打开 `chrome://extensions`。
3. 右上角开启 **开发者模式**。
4. 点 **「加载已解压的扩展程序」** → 选择 `dist/` 文件夹。
5. 打开任意普通网页（如 `https://example.com`），右下角出现火柴人。

## 5. 没有 `.riv` 时确认 fallback 正常工作

在 **没有** `public/maestro_stickman.riv` 的情况下加载扩展：

- 右下角出现火柴人 + 一个状态小标签（如 `idle`）。← fallback 已工作。
- 点击任意 `input` / `textarea`（或富文本框）打字：
  - 慢敲 → 标签变 `typing_slow`，手臂慢摆。
  - 正常 → `typing_normal`。
  - 快敲 → `typing_fast`，手臂快摆。
- 停手超过 5s → `resting`；超过 20s → `sleeping`。
- 点击小人 → `clicked`（跳一下），约 0.8s 后回到常态。
- 2 秒内连点 5 次 → `annoyed`（抖动）。

能看到小标签依次走过这些状态，就说明 fallback 与整条状态机都正常。以后放进真实 `.riv`，组件会自动切换为 Rive 动画。

## 已知后续（放入真实 `.riv` 之后）

`@rive-app/canvas` 运行时会加载 `rive.wasm`。在内容脚本环境下，这个 wasm 的 URL 可能需要从扩展内提供并声明到 `web_accessible_resources`。如果放入 `.riv` 后 Rive 画布空白，打开控制台看是否有 wasm / `locateFile` 相关报错，按和 `.riv` 同样的方式把 wasm 资源加进 `web_accessible_resources` 即可。在那之前，只要 Rive 未就绪，组件都会用占位小人兜底。
