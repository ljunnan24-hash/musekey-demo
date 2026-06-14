// 工具栏弹窗：快捷开关 + 尺寸 + 打开完整设置。原生 JS。
// ⚠️ STORAGE_KEY / DEFAULT_SETTINGS 必须与 src/logic/settings.ts 逐字同步。
"use strict";

const STORAGE_KEY = "maestro_stickman_settings_v1";
const DEFAULT_SETTINGS = {
  enabled: true,
  scale: 1,
  corner: "bottom-right",
  margin: 24,
  opacity: 1,
  blocklist: [],
};

const enabledEl = document.getElementById("enabled");
const scaleEl = document.getElementById("scale");
const scaleOut = document.getElementById("scaleOut");
const openBtn = document.getElementById("openOptions");

function setScaleOut() {
  scaleOut.textContent = Math.round(parseFloat(scaleEl.value) * 100) + "%";
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get([STORAGE_KEY], (res) => {
    const s = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] ?? {}) };
    enabledEl.checked = !!s.enabled;
    scaleEl.value = typeof s.scale === "number" ? s.scale : DEFAULT_SETTINGS.scale;
    setScaleOut();
  });

  // 关键：弹窗只控制 enabled / scale，写入前先读已存设置再覆盖这两个字段，
  // 避免把完整设置页才有的 corner/margin/opacity/blocklist 冲掉。
  function savePartial() {
    chrome.storage.sync.get([STORAGE_KEY], (res) => {
      const base = { ...DEFAULT_SETTINGS, ...(res[STORAGE_KEY] ?? {}) };
      base.enabled = enabledEl.checked;
      base.scale = parseFloat(scaleEl.value);
      chrome.storage.sync.set({ [STORAGE_KEY]: base });
    });
  }

  enabledEl.addEventListener("change", savePartial);
  scaleEl.addEventListener("input", () => {
    setScaleOut();
    savePartial();
  });

  openBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});
