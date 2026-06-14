# Maestro Stickman — 状态交接

> 用于对话上下文变长/重置时快速恢复。代码本身在仓库里，这里只记「做到哪了 + 下一步」。新开会话读这一个文件即可接上。

## 是什么
Chrome MV3 扩展，在每个网页右下角注入火柴人音乐家，随打字速度切状态。KeyJam PRD §12 的 Maestro Stickman，**独立扩展**（不是 index.html 内嵌那个）。

- 位置：`~/Desktop/maestro-stickman/`
- 技术栈：React 18 + TS + Vite（单文件 IIFE → `dist/content.js`）+ `@rive-app/react-canvas`
- 加载方式：`chrome://extensions` → 开发者模式 → 加载已解压 → 选 **`dist/`**（不是项目根目录）

## 已完成 ✓
- 12 个文件全部实现 + `README.md` + 本文件
- `npm install` ✓ / `npm run build` ✓（tsc 通过，产出 `dist/content.js` + `dist/manifest.json`）
- 已加载进 Chrome，右下角出现 SVG 占位小人 + 状态标签 ✓（无 .riv 时 fallback 正常）
- **Shadow DOM 隔离**：样式 + DOM 全部进 shadow root，动画由构造保证生效（详见下方「已踩过的坑」）
- **打字动画已验证**：在真实带输入框的 https 页面，慢/正常/狂敲三档手臂摆动、点击 jump、连点 annoyed，全部正常
- **设置系统**（工具栏弹窗 + 完整设置页）：开关 / 尺寸 / 位置 / 边距 / 透明度 / 指定网站禁用，`chrome.storage.sync` 持久化、**实时生效**（详见下方「设置系统」）
- 已纳入 git（`git init` + 一次初始提交；`node_modules/`、`dist/` 已 gitignore）

## 设置系统（已完成）
- **契约**：`src/logic/settings.ts` — `Settings`（enabled/scale/corner/margin/opacity/blocklist）、`STORAGE_KEY="maestro_stickman_settings_v1"`、`DEFAULT_SETTINGS`、`loadSettings()`（merge+clamp，前后向兼容）、`subscribe(cb)`、`isBlocked(url, blocklist)`（glob→正则，匹配 hostname+path）、`cornerInsets()`。
- **内容脚本**（`src/content/main.tsx`）：异步 `init` 先 `await loadSettings()` 再决定挂载（避免被禁站闪现一帧）；`buildHost` 读 `current` 设尺寸/角/边距/透明；**节点守护已改成感知设置**（关闭/被 block 时不重挂——这是设置正确性的命门）；`handleSettingsChange` 监听 `chrome.storage.onChanged` 实时反应：不该可见→`removeHost()`、该可见但不在→`mountWidget()`、可见→可见→原地改 inline 样式（不重挂 React）。
- **UI**（`public/` 下静态原生 JS/HTML，Vite 原样拷进 `dist/`，无构建改动）：`options.html/.js`（完整设置，autosave + 恢复默认）、`popup.html/.js`（工具栏快开：开关 + 尺寸 + 打开完整设置；写入前 merge 不冲掉 options 字段）。⚠️ 这两个 JS 各复制一份 `STORAGE_KEY`+`DEFAULT_SETTINGS`，须与 `settings.ts` 逐字同步。
- **manifest**：`permissions:["storage"]` + `action.default_popup` + `options_page`。

## 已踩过的坑（已处理）
- **内容脚本注入的 `<style>` 在真实页面不可靠** → 已把容器定位/尺寸/可见性改成**内联 style**，绕开（这就是当初右下角空白的根因）
- **TypingTracker 启动误判 `typing_slow`** → 已修（空 stamps → `none`，加载即 `idle`）
- **动画依赖全局 `<style>`，会被宿主页 `*{animation:none!important}` 等复位击穿**（表现为「标签变但小人不摆」）→ 已改 **Shadow DOM**：`main.tsx` 里 `host.attachShadow()`，`<style>` 注入 shadow root，React 也挂进 shadow root。shadow 边界挡住宿主页任何选择器，`@keyframes` 不再受干扰。`widget.css` 的 `#maestro-stickman-root` 选择器相应改为 `:host`。`repro.mjs` 已能验：shadow 内有动画规则 + 打字后 `data-state` 切到 `typing_fast`。
- **挂载点硬化（保留，非 bug 修复）**：host 改挂到 `document.documentElement`（`<html>`）而非 `body`，并加 **MutationObserver 守护**（host 被删时自动重挂）。这能扛住真实 SPA 整体重建 body、祖先 `transform` 容器化等坑。**注意：曾据此怀疑「只在 example.com 出现」是 body 重建所致，实为误判——真相见下方「已知限制」。** `repro.mjs` 含两段生存测试：清空 body 后 host 仍在、host 被删后自动重挂。

## 已知限制（非 bug，别再花时间查）
- **Chrome 受限页不注入**：`chrome://*`（设置、新标签页 `chrome://newtab`）、Chrome 应用商店、`about:blank`、本地 `file://`（需在扩展卡片开「允许访问文件网址」）。这些页面 Chrome 禁止任何扩展注入内容脚本，`<all_urls>` 也覆盖不到 `chrome://` scheme。**历史教训：用户曾在新标签页测试（它有 Google 搜索框，像「带输入框的普通网站」）发现「不出现」，追了一整圈——其实是被 Chrome 拦在注入层，脚本一行都没跑（Console 无 `[maestro]` 日志即此特征）。**
- **CSP 极严的站点可能挡掉 shadow 内 `<style>`**：Shadow DOM 隔离 CSS 级联，但挡不住 CSP `style-src`（不含 `'unsafe-inline'`）。表现：小人框出现、`data-state` 会变，但手臂不动。若遇此，改用 **Web Animations API**（`element.animate()`，JS 驱动、CSP 管不着）替代 CSS `@keyframes`。目前未确认有站点中招。

## 验证 ✓
`npm run build` 绿；`node scripts/repro.mjs` 全绿：shadow 内渲染 + 含动画规则 + 打字后切 `typing_fast` + body 清空后存活 + 删除后自动重挂。
浏览器侧只需重新加载扩展确认肉眼手臂摆动（动画现已隔离，理论上必生效）。

## 后续（暂不做）
- **Rive 动画**：放入真实 `maestro_stickman.riv` 后切 Rive（目前项目里没有该资源）；Rive 的 `rive.wasm` 可能需加进 `web_accessible_resources`（README 末尾有记）。
- **系统级小人**（用户提过，难度中偏高，单独立项）：让小人出现在屏幕右下角、响应全局打字，不限浏览器。这是**独立的 macOS 原生项目**（与扩展基础设施零重叠），难点是全局按键权限（CGEventTap + 「输入监控」授权）和跨 App 置顶悬浮窗；可复用 `typingTracker`/`characterState` 逻辑和视觉。Swift 原生最干净，Electron 可复用 widget 但臃肿。
- **设置 UI 的自定义图标**：v1 工具栏用默认拼图图标；后续可加 `icons/` + `action.default_icon`。
- **CSP 极严站点动画兜底**：若确认有站点中招（shadow `<style>` 被 CSP 挡），把动画从 CSS `@keyframes` 换成 Web Animations API（`element.animate()`）。

## 新会话怎么接
1. `cd ~/Desktop/maestro-stickman && cat STATUS.md`（本文件）
2. 已是 git 仓库；改完先 `npm run build`，再去 `chrome://extensions` 点扩展卡片的 🔄 刷新，再刷新网页
3. `node scripts/repro.mjs`（jsdom 复现 + storage 桩）：能验渲染/状态机/body 清空存活/守护重挂；实时 onChanged 行为只能真浏览器验
4. 改设置契约（`src/logic/settings.ts`）后，**同步**更新 `public/options.js`、`public/popup.js` 里复制的 `STORAGE_KEY`/`DEFAULT_SETTINGS`
