// 设置契约：内容脚本（TS，被打进 content.js）使用。
// 注意：public/options.js、public/popup.js 是原生 JS，各自复制一份 STORAGE_KEY + DEFAULT_SETTINGS，
// 字段名/类型必须与此处逐字一致（文件顶部有同步注释）。

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface Settings {
  enabled: boolean; // 总开关
  scale: number; // 0.5–2.0，作用于基础 160px
  corner: Corner; // 贴哪个角
  margin: number; // px，距所选边的距离
  opacity: number; // 0.1–1
  blocklist: string[]; // glob 模式，每条一行
}

export const STORAGE_KEY = "maestro_stickman_settings_v1";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  scale: 1,
  corner: "bottom-right",
  margin: 24,
  opacity: 1,
  blocklist: [],
};

const CORNERS: readonly Corner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

/** 把任意对象规整成合法 Settings：缺省补默认，越界 clamp，非法值回默认。 */
function normalize(raw: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  if (typeof s.enabled !== "boolean") s.enabled = DEFAULT_SETTINGS.enabled;
  s.scale = clamp(Number(s.scale), 0.5, 2) ?? DEFAULT_SETTINGS.scale;
  s.opacity = clamp(Number(s.opacity), 0.1, 1) ?? DEFAULT_SETTINGS.opacity;
  s.margin = Math.max(0, Number(s.margin) || 0);
  if (!isFinite(s.margin)) s.margin = DEFAULT_SETTINGS.margin;
  if (!CORNERS.includes(s.corner as Corner)) s.corner = DEFAULT_SETTINGS.corner;
  s.blocklist = Array.isArray(s.blocklist)
    ? s.blocklist.filter((x) => typeof x === "string")
    : [];
  return s as Settings;
}

function clamp(v: number, lo: number, hi: number): number | null {
  if (!isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, v));
}

/** 读出当前设置（缺省/越界自动归一）。空 storage → 全默认。 */
export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.sync.get([STORAGE_KEY]);
  return normalize(got[STORAGE_KEY] as Partial<Settings> | undefined);
}

/** 订阅设置变更，仅响应 sync 区下本 key 的 newValue。返回取消订阅函数。 */
export function subscribe(cb: (s: Settings) => void): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    area: string,
  ) => {
    if (area !== "sync") return;
    const change = changes[STORAGE_KEY];
    if (!change) return;
    cb(normalize(change.newValue as Partial<Settings> | undefined));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/** 把一条 glob 模式编译成正则（全匹配）。纯域名自动补路径。 */
function compilePattern(p: string): RegExp | null {
  const pat = p.trim().toLowerCase();
  if (!pat) return null;
  const hasWildcard = pat.includes("*");
  const hasSlash = pat.includes("/");
  // 转义正则元字符，再把字面 \* 还原成 .*
  const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const tail = hasWildcard || hasSlash ? "" : "(/.*)?$"; // 纯域名 → 匹配任意路径
  try {
    return new RegExp("^" + escaped + tail + "$");
  } catch {
    return null;
  }
}

/** url 是否命中 blocklist。匹配 hostname+pathname（小写）；解析失败→不拦。 */
export function isBlocked(url: string, blocklist: string[]): boolean {
  if (!blocklist || blocklist.length === 0) return false;
  let hostPath: string;
  try {
    const u = new URL(url);
    hostPath = (u.hostname + u.pathname).toLowerCase();
  } catch {
    return false;
  }
  for (const raw of blocklist) {
    const re = compilePattern(raw);
    if (re && re.test(hostPath)) return true;
  }
  return false;
}

/** 把 Settings 映射成 host 的 4 个边距（未用的边置 "" 以便切角时彻底迁移）。 */
export function cornerInsets(
  corner: Corner,
  margin: number,
): { top: string; right: string; bottom: string; left: string } {
  const m = `${margin}px`;
  const e = "";
  switch (corner) {
    case "top-left":
      return { top: m, right: e, bottom: e, left: m };
    case "top-right":
      return { top: m, right: m, bottom: e, left: e };
    case "bottom-left":
      return { top: e, right: e, bottom: m, left: m };
    case "bottom-right":
    default:
      return { top: e, right: m, bottom: m, left: e };
  }
}
