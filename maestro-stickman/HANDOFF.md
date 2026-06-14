# Maestro Stickman — 交付文档（给接手工具 / Codex）

> 这是一份自包含的交接文档。读完即可接手开发或排查。日常状态记录另见 `STATUS.md`（更简短，记"做到哪了 + 踩过的坑"）。本文档侧重**架构全貌 + 当前未解问题**。

## 1. 是什么

Chrome **MV3** 扩展，在每个网页右下角注入一个火柴人音乐家 SVG，**随打字速度切换状态/动画**。KeyJam PRD §12 的 Maestro Stickman，**独立扩展**（不是某 index.html 内嵌版本）。完全离线，无任何远程服务。

- 位置：`~/Desktop/maestro-stickman/`
- 技术栈：React 18 + TypeScript + Vite（单文件 IIFE 打包成 `dist/content.js`）+ `@rive-app/react-canvas`（运行时已打进包，但当前无 `.riv` 资源，走 SVG fallback）
- **加载方式**：`chrome://extensions` → 开发者模式 → 加载已解压 → 选 **`dist/`**（不是项目根！）。改完代码 `npm run build` 后，在扩展卡片点 🔄 重新加载，再硬刷新网页 `⌘+⇧+R`。

## 2. 当前状态（已验证 ✓）

- 核心动画：Shadow DOM 隔离 + 打字状态机，**在真实带输入框的 https 页面已肉眼验证**——慢/正常/狂敲三档手臂摆动、点击 jump、连点 annoyed、停 5s resting、停 20s sleeping，全正常。
- 设置系统：开关/尺寸/位置/边距/透明度/指定网站禁用，`chrome.storage.sync` 持久化、实时生效；工具栏弹窗（popup）+ 完整设置页（options）两个入口。**逻辑层已被 `scripts/repro.mjs`（jsdom + storage 桩）验证全绿**；浏览器侧实时行为用户尚未完整实测（见 §5）。
- 已纳入 git：`git init` + 一次初始提交 `1b8f290`，`node_modules/`、`dist/` 已 gitignore。

## 3. 架构与关键文件

### 构建管线（重要，别乱改）
`vite.config.ts` 是**单入口 IIFE**：`rollupOptions.input = { content: src/content/main.tsx }`，`output.format:"iife"` + `inlineDynamicImports:true` + 单 `entryFileNames:"content.js"`。这意味着**不能再加第二个"被打包"的入口**（会冲突）。所以 popup/options 用 `public/` 下的**静态原生 JS/HTML**，Vite 原样拷进 `dist/`（零构建改动）。自定义插件 `copyManifest` 在 `closeBundle` 把根 `manifest.json` 拷到 `dist/manifest.json`。

### 文件清单
| 文件 | 职责 |
|---|---|
| `src/content/main.tsx` | **入口**。`window.__maestroStickmanInjected` 去重；异步 `init` 先 `await loadSettings()` 再决定挂载；`buildHost()` 建 host + Shadow DOM + 注入 CSS + React 挂载；host 挂在 `document.documentElement`（非 body）；**节点守护 MutationObserver 已改成感知设置**；`handleSettingsChange` 监听 `chrome.storage.onChanged` 实时反应。详见 §4。 |
| `src/content/StickmanWidget.tsx` | React widget。200ms 轮询打字状态 → `data-state`；Rive（无 .riv 时）回退 SVG。**尺寸/位置/可见全在 host 层，widget 仅 `width/height:100%`**，因此 widget 本身不读设置。 |
| `src/logic/typingTracker.ts` | 打字速度追踪（只记按键时间戳，不读内容）；`level()` → none/slow/normal/fast；`isTypingTarget()`。 |
| `src/logic/characterState.ts` | 状态机：`computeBaseState`（打字档 + 空闲→resting/sleeping）+ 点击瞬时态（clicked/annoyed）。 |
| `src/logic/settings.ts` | **设置契约**：`Settings`、`STORAGE_KEY="maestro_stickman_settings_v1"`、`DEFAULT_SETTINGS`、`loadSettings()`（merge+clamp，前后向兼容）、`subscribe(cb)`、`isBlocked(url, blocklist)`（glob→正则，匹配 hostname+path）、`cornerInsets()`。 |
| `src/styles/widget.css` | SVG 样式 + `@keyframes` 动画，按 `[data-state]` 驱动。`:host` 即 shadow 宿主。 |
| `public/options.html` + `public/options.js` | **完整设置页**（静态原生 JS）。autosave 到 storage.sync；恢复默认。⚠️ 内有 `STORAGE_KEY`+`DEFAULT_SETTINGS` 的**复制副本**，须与 `settings.ts` 逐字同步。 |
| `public/popup.html` + `public/popup.js` | **工具栏弹窗**：开关 + 尺寸 + 打开完整设置。**写入前 merge**（读已存再覆盖 enabled/scale），不冲掉 options 才有的字段。⚠️ 同样复制了契约。 |
| `scripts/repro.mjs` | jsdom 复现 + 断言（渲染/状态机/body 清空存活/守护重挂）。**含 `chrome.storage` 内存桩**。改契约后记得同步桩。 |
| `manifest.json` | `permissions:["storage"]` + `action.default_popup=popup.html` + `options_page=options.html` + `content_scripts.matches:<all_urls>` + `web_accessible_resources:[maestro_stickman.riv]`。 |

### 关键设计决策（why）
1. **Shadow DOM**：动画 CSS 与宿主页完全隔离，宿主页 `*{animation:none!important}` 等复位穿不透。**但注意：Shadow DOM 挡不住 CSP**（见 §6 尾）。
2. **host 挂 `document.documentElement` 而非 `body`**：body 常被 SPA 重建会连锅端；html 是根节点稳定，且无祖先能带 `transform` 把 `position:fixed` 容器化。
3. **MutationObserver 守护**：host 被站点 JS 删除时自动重挂。**关键是它已感知设置**——关闭/被 block 时不重挂，否则开关无效。
4. **scale 用改 width/height 实现，不用 `transform:scale`**：后者会和 shadow 内动画的 transform 叠乘、且要逐角改 transform-origin。
5. **popup/options 用静态 public/ 文件**：规避单入口 IIFE 构建冲突；代价是契约被复制 3 份（settings.ts / options.js / popup.js），改字段要同步三处。

## 4. 内容脚本实时反应逻辑（最易踩错的部分）

`src/content/main.tsx` 的核心流程：

```
init() async:
  current = await loadSettings()           # 先加载，避免被禁站闪现一帧
  if shouldBeVisible(current): mountWidget()  # enabled && !isBlocked(location.href)
  subscribe(handleSettingsChange)          # chrome.storage.onChanged → 实时

handleSettingsChange(next):
  current = next
  should = enabled && !isBlocked(...)
  if !should && hostExists: removeHost()    # 关闭/新命中blocklist → 当场移除
  if should && !hostExists: mountWidget()   # 重开/解除blocklist → 当场挂回
  if should && hostExists: applyHostStyles()# 可见→可见 → 原地改inline样式，不重挂React

mountWidget():
  appendChild(buildHost())
  guard.observe(...)  # 守护：host 被删 && shouldBeVisible(current) 才重挂
```

`removeHost()` 会 disconnect 守护 + `reactRoot.unmount()` + 移除节点——保证开关反复不泄漏 React root。

## 5. ⚠️ 当前未解决问题（接手者重点）

### 5.1 工具栏图标在部分 https 页面置灰、弹窗打不开（已应用修复，待浏览器重载验证）
- **现象**：工具栏的 Maestro Stickman 图标，在 `example.com` 是**彩色**、点开弹窗正常；但在 `github.com`（以及可能其它非 example 的站点）是**灰色**、点开无弹窗。
- **已排除**：
  - 不是 `chrome://extensions` → 详情里的「网站访问权限」——用户确认已是「在所有网站上」。
  - 不是新标签页/`chrome://` 受限页那类（github.com 是正经 https）。
  - 不是 popup 代码问题（example.com 能开 → `popup.html/js` 本身是好的）。
- **排查中的待确认点（用户尚未回）**：
  1. **站点级覆盖**：在 github.com 上右键工具栏图标 →「此站点可读取和更改数据」选的是哪个？（可能是「从不/点击时」把 github 单独拦了）
  2. **范围**：是**只有 github.com 灰**，还是「除 example.com 外全灰」？（决定是站点级还是全局 host 权限问题）
  3. github.com 上右下角**小人有出现吗**？（图标灰的页面内容脚本通常也进不去——若小人也没出现，印证是 host 权限问题）
- **已应用的代码层修复**：`manifest.json` 已加显式 **`"host_permissions": ["<all_urls>"]`**，并已重新 `npm run build` 产出到 `dist/manifest.json`。MV3 里 `content_scripts.matches` 负责注入，但 **action 图标的"激活/置灰"状态在不同 Chrome 版本里可能依赖显式 `host_permissions`**，加它是最稳妥的 canonical 修法。下一步只需在 `chrome://extensions` 里重载扩展，再到 github.com 验证图标是否变彩色、popup 是否能打开、小人是否出现。
- **加 host_permissions 的副作用**：扩展声明访问范围变广，但与现有 `content_scripts.matches` 同范围，无实质隐私变化。未打包扩展重载时静默授予，无弹窗。

### 5.2 设置系统的浏览器侧实时行为尚未完整实测
repro 已验逻辑，但 `chrome.storage.onChanged` 的实时反应（开关当场生效、blocklist 当场拦截、尺寸实时变）需用户在真浏览器实测。实测清单见 §7。

## 6. 已知限制（非 bug，别浪费时间查）
- **Chrome 受限页不注入、图标必灰**：`chrome://*`（含新标签页 `chrome://newtab`）、Chrome 应用商店、`about:blank`、`file://`（需在扩展卡片开「允许访问文件网址」）。`<all_urls>` 覆盖不到 `chrome://` scheme。**历史教训：曾把"新标签页不出现"当成 bug 追了一圈，其实是 Chrome 注入层禁止。**
- **CSP 极严站点**：Shadow DOM 隔离 CSS 级联，但挡不住 `style-src`（不含 `'unsafe-inline'`）。表现：小人框出现、`data-state` 会变，但手臂不动。若确认有站点中招，把动画从 CSS `@keyframes` 换成 **Web Animations API**（`element.animate()`，JS 驱动、CSP 管不着）。
- **未打包扩展重载静默授权**：我之前误判"加 storage 权限会弹一次性提示"——**错的**。未打包（开发者模式）扩展 🔄 重载时直接静默授予 manifest 声明的权限，不弹框。提示只对商店安装的扩展生效。

## 7. 如何构建 / 加载 / 测试
```bash
cd ~/Desktop/maestro-stickman
npm install            # 首次
npm run build          # tsc --noEmit && vite build → dist/
node scripts/repro.mjs # jsdom 自测逻辑（无需浏览器）
```
- 加载/重载：`chrome://extensions` → 选 `dist/` → 改完点卡片 🔄 → 网页 `⌘+⇧+R`。
- 浏览器实测设置系统清单：① 弹窗关"启用"→ 已开网页小人当场消失、勾回复现；② 拖尺寸/透明、切位置、调边距实时变；③ blocklist 加 `example.com` → 当场消失、删掉复现；④ 关闭后 DevTools 手动删 `#maestro-stickman-root` → 不应重挂（守护尊重 enabled=false）；⑤ popup 改开关不冲掉 options 设的其它字段。

## 8. 后续路线（暂未做）
1. **Rive 动画**：放入真实 `maestro_stickman.riv` 切换（目前项目无此资源；`.riv` 已在 `web_accessible_resources`，但 `rive.wasm` 可能也要加）。
2. **系统级小人**（用户提过，难度中偏高，**独立 macOS 原生项目**）：屏幕右下角、响应全局打字。难点=全局按键权限（CGEventTap + 「输入监控」授权）+ 跨 App 置顶悬浮窗。可复用 `typingTracker`/`characterState` 逻辑和视觉；与扩展基础设施零重叠。
3. **工具栏自定义图标**：v1 用默认拼图图标。加 `icons/` + `action.default_icon`。
4. **CSP 兜底动画**：见 §6（Web Animations API）。

## 9. 给 Codex 的快速上手
1. `cat STATUS.md`（踩坑史）+ 本文档（架构 + 未解问题）。
2. 跑 `npm run build && node scripts/repro.mjs` 确认基线绿。
3. 优先处理 §5.1 的验证：`host_permissions` 已加入并构建，去 `chrome://extensions` 点扩展卡片 🔄 重载 → github.com 验证图标是否变彩色、弹窗能否打开、小人是否出现。
4. 改设置契约时，**三处同步**：`src/logic/settings.ts` + `public/options.js` + `public/popup.js` 的 `STORAGE_KEY`/`DEFAULT_SETTINGS`。
5. 加新打包入口前，先读 `vite.config.ts` 的单 IIFE 约束——多数情况用 `public/` 静态文件绕开。
