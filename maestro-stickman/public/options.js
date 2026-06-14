// 完整设置页逻辑。原生 JS（Vite 原样拷进 dist/，无打包）。
// ⚠️ 下面的 STORAGE_KEY / DEFAULT_SETTINGS 必须与 src/logic/settings.ts 逐字保持同步。
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

const $ = (id) => document.getElementById(id);
const els = {
  enabled: $("enabled"),
  scale: $("scale"),
  scaleOut: $("scaleOut"),
  corner: $("corner"),
  margin: $("margin"),
  opacity: $("opacity"),
  opacityOut: $("opacityOut"),
  blocklist: $("blocklist"),
  reset: $("reset"),
  saved: $("savedHint"),
};

let savedTimer = null;
function flashSaved() {
  els.saved.classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => els.saved.classList.remove("show"), 900);
}

// 从控件读出当前 Settings
function readControls() {
  return {
    enabled: els.enabled.checked,
    scale: parseFloat(els.scale.value),
    corner: els.corner.value,
    margin: parseInt(els.margin.value, 10) || 0,
    opacity: parseFloat(els.opacity.value),
    blocklist: els.blocklist.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

// 把 Settings 填进控件
function writeControls(s) {
  els.enabled.checked = !!s.enabled;
  els.scale.value = s.scale;
  els.scaleOut.textContent = Math.round(s.scale * 100) + "%";
  els.corner.value = s.corner;
  els.margin.value = s.margin;
  els.opacity.value = s.opacity;
  els.opacityOut.textContent = Math.round(s.opacity * 100) + "%";
  els.blocklist.value = (s.blocklist || []).join("\n");
}

function save() {
  const settings = readControls();
  chrome.storage.sync.set({ [STORAGE_KEY]: settings }, flashSaved);
}

function mergeDefaults(stored) {
  const s = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  if (typeof s.enabled !== "boolean") s.enabled = DEFAULT_SETTINGS.enabled;
  if (typeof s.scale !== "number") s.scale = DEFAULT_SETTINGS.scale;
  if (typeof s.opacity !== "number") s.opacity = DEFAULT_SETTINGS.opacity;
  if (typeof s.margin !== "number") s.margin = DEFAULT_SETTINGS.margin;
  if (!["top-left", "top-right", "bottom-left", "bottom-right"].includes(s.corner))
    s.corner = DEFAULT_SETTINGS.corner;
  if (!Array.isArray(s.blocklist)) s.blocklist = [];
  return s;
}

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get([STORAGE_KEY], (res) => {
    writeControls(mergeDefaults(res[STORAGE_KEY]));
  });

  // 任意控件变动 → 自动保存（实时同步到所有标签页）
  ["input", "change"].forEach((evt) => {
    document.addEventListener(evt, () => {
      els.scaleOut.textContent = Math.round(parseFloat(els.scale.value) * 100) + "%";
      els.opacityOut.textContent = Math.round(parseFloat(els.opacity.value) * 100) + "%";
      save();
    });
  });

  els.reset.addEventListener("click", () => {
    chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_SETTINGS }, () => {
      writeControls(DEFAULT_SETTINGS);
      flashSaved();
    });
  });
});
