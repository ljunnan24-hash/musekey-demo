import { createRoot, type Root } from "react-dom/client";
import StickmanWidget from "./StickmanWidget";
import { typingTracker, isTypingTarget } from "../logic/typingTracker";
import { typingMusic } from "../logic/typingMusic";
import widgetCss from "../styles/widget.css?inline";
import {
  loadSettings,
  subscribe,
  isBlocked,
  cornerInsets,
  type Settings,
} from "../logic/settings";

const ROOT_ID = `maestro-stickman-root-${chrome.runtime.id}`;
const BASE_BOX = 160; // scale=1 时的基础尺寸 px
const TYPING_PULSE_EVENT = "MAESTRO_STICKMAN_TYPING_PULSE";
const KEYJAM_LOCAL_PORT = "3000";

// 防止同一页面被重复注入（部分站点会多次执行内容脚本）
interface MaestroWindow {
  __maestroStickmanInjected?: boolean;
}
const win = window as unknown as MaestroWindow;

function isKeyJamPage(): boolean {
  try {
    const url = new URL(location.href);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === KEYJAM_LOCAL_PORT
    );
  } catch {
    return false;
  }
}

function allowsTypingSound(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement && target.type === "password") return false;
  return true;
}

if (!win.__maestroStickmanInjected && !isKeyJamPage()) {
  win.__maestroStickmanInjected = true;

  // 注入作用域内的运行态
  let current: Settings | null = null;
  let reactRoot: Root | null = null;
  let guard: MutationObserver | null = null;

  const hostExists = () => !!document.getElementById(ROOT_ID);
  const shouldBeVisible = (s: Settings) =>
    s.enabled && !isBlocked(location.href, s.blocklist);

  // 把设置映射到 host 的 inline 样式（尺寸/角/边距/透明）。切角时未用的边置 ""，
  // 避免上一次角的 right/bottom 残留。scale 用改 width/height 实现，不用 transform:scale
  //（后者会和 shadow 内动画的 transform 叠乘、且要逐角改 origin）。
  const applyHostStyles = (host: HTMLElement, s: Settings) => {
    const box = Math.round(BASE_BOX * s.scale);
    Object.assign(host.style, {
      width: `${box}px`,
      height: `${box}px`,
      opacity: String(s.opacity),
      ...cornerInsets(s.corner, s.margin),
    });
  };

  // 构造 host：Shadow DOM + 样式注入 + React 挂载。尺寸/位置读取 current。
  const buildHost = (): HTMLElement => {
    // 若有残留 root（host 被外部删除、未来不及 unmount），先收掉再建新的
    reactRoot?.unmount();
    reactRoot = null;

    const host = document.createElement("div");
    host.id = ROOT_ID;
    Object.assign(host.style, {
      position: "fixed",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    if (current) applyHostStyles(host, current);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.setAttribute("data-maestro", "");
    style.textContent = widgetCss;
    shadow.appendChild(style);
    const mountPoint = document.createElement("div");
    shadow.appendChild(mountPoint);
    reactRoot = createRoot(mountPoint);
    reactRoot.render(<StickmanWidget />);
    return host;
  };

  const mountWidget = () => {
    if (hostExists()) return;
    document.documentElement.appendChild(buildHost());

    // 节点守护：host 被外部删除时重挂——但必须尊重设置，
    // 否则「关闭」开关会被守护立刻挂回去（这是设置系统正确性的命门）。
    guard?.disconnect();
    guard = new MutationObserver(() => {
      if (hostExists()) return;
      if (current && shouldBeVisible(current)) {
        document.documentElement.appendChild(buildHost());
      }
    });
    guard.observe(document.documentElement, { childList: true });
  };

  const removeHost = () => {
    guard?.disconnect();
    guard = null;
    reactRoot?.unmount();
    reactRoot = null;
    document.getElementById(ROOT_ID)?.remove();
  };

  // 设置变更：实时反应（无需刷新页面）。
  const handleSettingsChange = (next: Settings) => {
    current = next;
    const was = hostExists();
    const should = shouldBeVisible(next);
    if (!should) {
      if (was) removeHost(); // 关闭 / 新命中 blocklist → 当场移除
      return;
    }
    if (!was) {
      mountWidget(); // 重新开启 / 解除 blocklist → 当场挂回
      return;
    }
    // 可见→可见：原地改 inline 样式，不重挂 React（拖滑条不会反复重建）
    const host = document.getElementById(ROOT_ID);
    if (host) applyHostStyles(host, next);
  };

  // 先加载设置再决定是否挂载——避免在「已禁用 / 被 block」的页面闪现一帧。
  const init = async () => {
    current = await loadSettings();
    if (shouldBeVisible(current)) mountWidget();
    subscribe(handleSettingsChange);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void init(), {
      once: true,
    });
  } else {
    void init();
  }

  // 只记录按键时间戳（input / textarea / contenteditable），绝不读取内容。
  // 用 capture 阶段监听，即使页面 stopPropagation 也能收到。隐藏时也照常记录，
  // 省去显隐时反复挂卸监听。
  document.addEventListener(
    "keydown",
    (e) => {
      if (!isTypingTarget(e.target)) return;
      typingTracker.record();
      window.dispatchEvent(new CustomEvent(TYPING_PULSE_EVENT));
      if (!e.repeat && allowsTypingSound(e.target)) {
        void typingMusic.play();
      }
    },
    true,
  );
}
