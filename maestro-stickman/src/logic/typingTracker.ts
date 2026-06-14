// 只追踪按键「时间戳」，绝不读取/保存按键内容（隐私要求）。
export type TypingLevel = "none" | "slow" | "normal" | "fast";

const WINDOW_MS = 3000; // 滚动窗口：最近 3 秒
const IDLE_MS = 1200; // 超过 1.2s 无按键 → none
const SLOW_BELOW = 1.5; // keys/sec < 1.5 → slow
const FAST_AT = 4; // keys/sec >= 4 → fast

export class TypingTracker {
  private stamps: number[] = [];
  private last = Date.now();

  /** 记录一次按键（只存时间戳） */
  record(now = Date.now()): void {
    this.last = now;
    this.stamps.push(now);
    // 防止数组无限增长（理论上窗口已够短，这里再加一道保险）
    if (this.stamps.length > 256) this.stamps.splice(0, this.stamps.length - 256);
  }

  /** 最近 WINDOW_MS 内的按键数（时间戳单调递增，从尾部往前数） */
  private recentCount(now: number): number {
    const cutoff = now - WINDOW_MS;
    let n = 0;
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      if (this.stamps[i] >= cutoff) n++;
      else break;
    }
    return n;
  }

  /** keys per second（3 秒窗口） */
  speed(now = Date.now()): number {
    return this.recentCount(now) / (WINDOW_MS / 1000);
  }

  /** 距离上次按键的秒数 */
  idleSeconds(now = Date.now()): number {
    return (now - this.last) / 1000;
  }

  /** 当前打字等级 */
  level(now = Date.now()): TypingLevel {
    // 从没按过键就不是在打字（否则刚加载的头 1.2s 会误判成 slow）
    if (this.stamps.length === 0) return "none";
    if (now - this.last > IDLE_MS) return "none";
    const kps = this.speed(now);
    if (kps < SLOW_BELOW) return "slow";
    if (kps < FAST_AT) return "normal";
    return "fast";
  }
}

/** 页面级单例 */
export const typingTracker = new TypingTracker();

/** 判断事件目标是否为可输入元素（仅 input / textarea / contenteditable） */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return target.isContentEditable;
}
