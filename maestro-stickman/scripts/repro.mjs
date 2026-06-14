// 本地复现内容脚本执行：用 jsdom 跑 dist/content.js，自己看它在哪里炸。
// 不需要真实浏览器，目的是把"右下角空白"的根因从黑盒里挖出来。
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const html = `<!DOCTYPE html><html><head></head><body><input id="i" /></body></html>`;
const dom = new JSDOM(html, {
  url: "https://example.com/",
  runScripts: "dangerously",
  pretendToBeVisual: true,
});
const { window } = dom;

// ---- 桩：模拟内容脚本环境里能拿到的 chrome / fetch ----
// storage 用内存对象模拟：初始空 → loadSettings 走默认（enabled:true）→ 挂载。
const memStore = {};
window.chrome = {
  runtime: {
    id: "fakeextensionid",
    getURL: (p) => "chrome-extension://fakeextensionid/" + p,
  },
  storage: {
    sync: {
      get: (keys) => {
        const out = {};
        for (const k of keys) if (k in memStore) out[k] = memStore[k];
        return Promise.resolve(out);
      },
      set: (obj) => {
        Object.assign(memStore, obj);
        return Promise.resolve();
      },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};
// 没有 .riv → fetch 返回 404，触发 fallback
window.fetch = () => Promise.resolve({ ok: false, status: 404 });

// ---- 捕获一切错误 ----
const errors = [];
const maestroMessages = [];
window.addEventListener("error", (e) => {
  errors.push("[window error] " + (e.error?.stack || e.message));
});
window.addEventListener("unhandledrejection", (e) => {
  errors.push("[unhandledrejection] " + (e.reason?.stack || String(e.reason)));
});
window.addEventListener("message", (e) => {
  if (e.data?.type === "KEYJAM_MAESTRO_ACK" || e.data?.type === "MAESTRO_KEYJAM_COMMAND") {
    maestroMessages.push(e.data);
  }
});
const nativePostMessage = window.postMessage.bind(window);
window.postMessage = (message, targetOrigin) => {
  nativePostMessage(message, targetOrigin);
  window.dispatchEvent(new window.MessageEvent("message", { data: message, source: window }));
};

// ---- 加载并执行 content.js ----
const code = readFileSync("dist/content.js", "utf8");
try {
  const s = window.document.createElement("script");
  s.textContent = code;
  window.document.documentElement.appendChild(s);
  console.log("✅ content.js 执行完毕，未同步抛错");
} catch (e) {
  console.log("❌ 同步抛错:\n" + (e.stack || String(e)));
}

// ---- 等 React 渲染 + 首个 setInterval tick ----
await new Promise((r) => setTimeout(r, 600));

console.log("\n===== 运行期错误 =====");
console.log(errors.length ? errors.join("\n\n") : "(无)");

const root = window.document.getElementById("maestro-stickman-root-fakeextensionid");
console.log("\n===== 挂载结果 =====");
console.log("root 节点是否存在:", !!root);
const shadow = root?.shadowRoot ?? null;
console.log("shadow root 是否存在:", !!shadow);

const readState = () => {
  const widget = shadow?.querySelector(".maestro-stickman-widget");
  return {
    widget: !!widget,
    dataState: widget?.getAttribute("data-state") ?? null,
    musicHitPhase: widget?.getAttribute("data-music-hit-phase") ?? null,
    musicStyle: widget?.getAttribute("data-music-style") ?? null,
    hasStyleBubble: !!shadow?.querySelector(".maestro-style-bubble"),
    hasAnimationRule: /maestro-fast-lean|maestro-left-hand-fast|face-focused/.test(
      shadow?.querySelector("style")?.textContent ?? "",
    ),
  };
};

if (shadow) {
  const before = readState();
  console.log("初始 widget 渲染:", before.widget, "| data-state:", before.dataState);
  console.log("shadow 内含动画规则:", before.hasAnimationRule);

  // 模拟打字：在 input 上派发若干 keydown，驱动 typingTracker → 状态机切到 typing_*
  const input = window.document.getElementById("i");
  const fireKey = () =>
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { bubbles: true, cancelable: true }),
    );
  for (let k = 0; k < 12; k++) fireKey();

  // 等 200ms 的状态重算 tick 触发
  await new Promise((r) => setTimeout(r, 350));
  const after = readState();
  console.log("打字后 data-state:", after.dataState);
  console.log(
    after.dataState && after.dataState.startsWith("typing")
      ? "✅ 状态机随打字切换正常"
      : "❌ 打字后未进入 typing_* 状态",
  );

  window.postMessage(
    { type: "KEYJAM_MAESTRO_EVENT", version: 1, event: "hello", style: "jazz", enabled: true },
    "*",
  );
  await new Promise((r) => setTimeout(r, 80));
  const connected = readState();
  const acked = maestroMessages.some((m) => m.type === "KEYJAM_MAESTRO_ACK");
  console.log("KeyJam hello 后 ACK:", acked, acked ? "✅" : "❌");
  console.log(
    "KeyJam 连接后气泡存在:",
    connected.hasStyleBubble,
    "| style:",
    connected.musicStyle,
  );

  const edmButton = [...shadow.querySelectorAll(".bubble-style-button")].find(
    (button) => button.textContent === "EDM",
  );
  edmButton?.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 80));
  const commanded = maestroMessages.some(
    (m) => m.type === "MAESTRO_KEYJAM_COMMAND" && m.command === "setStyle" && m.style === "edm",
  );
  console.log("气泡风格按钮发出 setStyle:", commanded, commanded ? "✅" : "❌");

  window.postMessage(
    { type: "KEYJAM_MAESTRO_EVENT", version: 1, event: "pageEnabled", enabled: false },
    "*",
  );
  await new Promise((r) => setTimeout(r, 80));
  const hiddenByPage = !shadow.querySelector(".maestro-stickman-widget");
  console.log("KeyJam 关闭本页后隐藏:", hiddenByPage, hiddenByPage ? "✅" : "❌");

  window.postMessage(
    { type: "KEYJAM_MAESTRO_EVENT", version: 1, event: "pageEnabled", enabled: true },
    "*",
  );
  for (let k = 0; k < 12; k++) {
    window.postMessage(
      {
        type: "KEYJAM_MAESTRO_EVENT",
        version: 1,
        event: "note",
        style: "edm",
        note: "C4",
        midi: 60,
        velocity: 0.8,
      },
      "*",
    );
  }
  await new Promise((r) => setTimeout(r, 80));
  const duringMusic = readState();
  await new Promise((r) => setTimeout(r, 270));
  const afterMusic = readState();
  console.log(
    "KeyJam note 后 data-state:",
    afterMusic.dataState,
    "| hit phase:",
    duringMusic.musicHitPhase,
  );
  console.log(
    afterMusic.dataState &&
      afterMusic.dataState.startsWith("typing") &&
      duringMusic.musicHitPhase !== "0"
      ? "✅ 音乐事件驱动演奏状态正常"
      : "❌ 音乐事件未驱动演奏状态",
  );
}

// ===== 复现"普通网站不出现"的两个真凶，验证新挂载点能扛住 =====
if (root) {
  // 1) SPA 整体重建 body：清空 body。挂载点现在在 <html> 下，应存活。
  const savedBody = window.document.body.innerHTML;
  window.document.body.innerHTML = "";
  const survivedBodyNuke = !!window.document.getElementById("maestro-stickman-root-fakeextensionid");
  window.document.body.innerHTML = savedBody;
  console.log(
    "body 被清空后 host 仍在:",
    survivedBodyNuke,
    survivedBodyNuke ? "✅ 迁移到 <html> 生效" : "❌",
  );

  // 2) 站点显式删除 host：MutationObserver 守护应自动挂回（给一个 tick 让回调跑）。
  window.document.getElementById("maestro-stickman-root-fakeextensionid")?.remove();
  await new Promise((r) => setTimeout(r, 120));
  const reinserted = !!window.document.getElementById("maestro-stickman-root-fakeextensionid");
  console.log(
    "host 被删后自动重挂:",
    reinserted,
    reinserted ? "✅ 守护生效" : "❌（jsdom 可能没派发 MutationObserver）",
  );
}

process.exit(0);
