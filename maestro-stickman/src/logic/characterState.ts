import type { TypingLevel } from "./typingTracker";

export type CharacterState =
  | "idle"
  | "typing_slow"
  | "typing_normal"
  | "typing_fast"
  | "resting"
  | "sleeping"
  | "clicked"
  | "annoyed";

/** 与 .riv 约定的 character_state 数值输入映射 */
export const STATE_NUMBER: Record<CharacterState, number> = {
  idle: 0,
  typing_slow: 1,
  typing_normal: 2,
  typing_fast: 3,
  resting: 4,
  sleeping: 5,
  clicked: 6,
  annoyed: 7,
};

const SLEEP_AFTER_S = 20; // 空闲超过 20s → sleeping
const REST_AFTER_S = 5; // 空闲超过 5s → resting
const BURST_WINDOW_MS = 2000; // 2 秒窗口
const BURST_COUNT = 5; // 5 次 → annoyed
const TRANSIENT_MS = 800; // clicked / annoyed 持续 800ms

/** 由打字等级 + 空闲秒数推导「常态」状态（不含点击瞬时态） */
export function computeBaseState(level: TypingLevel, idleSeconds: number): CharacterState {
  switch (level) {
    case "slow":
      return "typing_slow";
    case "normal":
      return "typing_normal";
    case "fast":
      return "typing_fast";
    case "none":
    default:
      break;
  }
  if (idleSeconds > SLEEP_AFTER_S) return "sleeping";
  if (idleSeconds > REST_AFTER_S) return "resting";
  return "idle";
}

interface Transient {
  state: "clicked" | "annoyed";
  until: number; // 过期时间戳
}

/** 在常态之上叠加点击瞬时态（clicked / annoyed） */
export class CharacterStateController {
  private clicks: number[] = [];
  private transient: Transient | null = null;

  /** 点击事件：2 秒内满 5 次 → annoyed，否则 clicked。每次点击刷新 800ms 倒计时。 */
  onClick(now = Date.now()): void {
    this.clicks.push(now);
    const cutoff = now - BURST_WINDOW_MS;
    while (this.clicks.length && this.clicks[0] < cutoff) this.clicks.shift();

    const burst = this.clicks.length >= BURST_COUNT;
    this.transient = { state: burst ? "annoyed" : "clicked", until: now + TRANSIENT_MS };
  }

  /** 当前应呈现的状态：瞬时态未过期则覆盖常态，否则按打字/空闲推导 */
  getState(level: TypingLevel, idleSeconds: number, now = Date.now()): CharacterState {
    if (this.transient && now >= this.transient.until) this.transient = null;
    if (this.transient) return this.transient.state;
    return computeBaseState(level, idleSeconds);
  }
}

/** 页面级单例 */
export const characterState = new CharacterStateController();
