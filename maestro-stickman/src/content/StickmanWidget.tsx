import { useEffect, useRef, useState } from "react";
import { typingTracker } from "../logic/typingTracker";
import { typingMusic, type MusicStyle } from "../logic/typingMusic";
import { characterState, type CharacterState } from "../logic/characterState";

const KEYJAM_EVENT = "KEYJAM_MAESTRO_EVENT";
const KEYJAM_ACK = "KEYJAM_MAESTRO_ACK";
const KEYJAM_COMMAND = "MAESTRO_KEYJAM_COMMAND";
const TYPING_PULSE_EVENT = "MAESTRO_STICKMAN_TYPING_PULSE";
const STYLE_STORAGE_KEY = "maestro_stickman_music_style_v1";

const STYLE_LABELS: Record<MusicStyle, string> = {
  lofi: "Lo-fi",
  edm: "EDM",
  jazz: "Jazz",
  ambient: "Ambient",
};

interface KeyJamEvent {
  type?: string;
  version?: number;
  event?: "hello" | "start" | "stop" | "note" | "beat" | "style" | "pageEnabled";
  style?: MusicStyle;
  enabled?: boolean;
}

function isMusicStyle(value: unknown): value is MusicStyle {
  return value === "lofi" || value === "edm" || value === "jazz" || value === "ambient";
}

export default function StickmanWidget() {
  const [state, setState] = useState<CharacterState>("idle");
  const [keyJamConnected, setKeyJamConnected] = useState(false);
  const [pageEnabled, setPageEnabled] = useState(true);
  const [musicStyle, setMusicStyle] = useState<MusicStyle>("lofi");
  const [musicHitPhase, setMusicHitPhase] = useState<0 | 1 | 2>(0);
  const musicHitTimer = useRef<number | null>(null);
  const frameUpdate = useRef<number | null>(null);
  const pendingMusicHit = useRef(false);

  const refreshCharacterState = () => {
    const now = Date.now();
    const next = characterState.getState(
      typingTracker.level(now),
      typingTracker.idleSeconds(now),
      now,
    );
    setState((current) => (current === next ? current : next));
  };

  const scheduleWidgetPulse = (withMusicHit = false) => {
    pendingMusicHit.current = pendingMusicHit.current || withMusicHit;
    if (frameUpdate.current !== null) return;

    frameUpdate.current = window.requestAnimationFrame(() => {
      frameUpdate.current = null;
      refreshCharacterState();

      if (!pendingMusicHit.current) return;
      pendingMusicHit.current = false;
      setMusicHitPhase((phase) => (phase === 1 ? 2 : 1));
      if (musicHitTimer.current) window.clearTimeout(musicHitTimer.current);
      musicHitTimer.current = window.setTimeout(() => setMusicHitPhase(0), 150);
    });
  };

  useEffect(() => {
    let cancelled = false;
    chrome.storage.sync
      .get([STYLE_STORAGE_KEY])
      .then((got) => {
        const savedStyle = got[STYLE_STORAGE_KEY];
        if (cancelled || !isMusicStyle(savedStyle)) return;
        typingMusic.setStyle(savedStyle);
        setMusicStyle(savedStyle);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sendAck = () => {
      window.postMessage(
        { type: KEYJAM_ACK, version: 1, installed: true, connected: true },
        "*",
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source && event.source !== window) return;
      const data = event.data as KeyJamEvent;
      if (!data || data.type !== KEYJAM_EVENT || data.version !== 1) return;

      setKeyJamConnected((connected) => connected || true);
      const nextStyle = data.style;
      if (isMusicStyle(nextStyle)) {
        typingMusic.setStyle(nextStyle);
        setMusicStyle((style) => (style === nextStyle ? style : nextStyle));
      }
      const nextEnabled = data.enabled;
      if (typeof nextEnabled === "boolean") {
        setPageEnabled((enabled) => (enabled === nextEnabled ? enabled : nextEnabled));
      }

      switch (data.event) {
        case "hello":
        case "pageEnabled":
          sendAck();
          break;
        case "note":
          typingTracker.record();
          scheduleWidgetPulse(true);
          break;
        case "style":
        case "start":
          sendAck();
          break;
        default:
          break;
      }
    };
    const onTypingPulse = () => scheduleWidgetPulse(false);

    window.addEventListener("message", onMessage);
    window.addEventListener(TYPING_PULSE_EVENT, onTypingPulse);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener(TYPING_PULSE_EVENT, onTypingPulse);
      if (frameUpdate.current !== null) window.cancelAnimationFrame(frameUpdate.current);
      if (musicHitTimer.current) window.clearTimeout(musicHitTimer.current);
    };
  }, []);

  // 空闲计时（resting / sleeping）低频推进；输入和音乐 note 走 requestAnimationFrame 即时更新。
  useEffect(() => {
    const id = window.setInterval(() => {
      refreshCharacterState();
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const handleClick = () => {
    characterState.onClick();
    refreshCharacterState();
  };

  const selectStyle = (style: MusicStyle) => {
    setMusicStyle(style);
    typingMusic.setStyle(style);
    void chrome.storage.sync.set({ [STYLE_STORAGE_KEY]: style }).catch(() => {});
    if (keyJamConnected) {
      window.postMessage(
        { type: KEYJAM_COMMAND, version: 1, command: "setStyle", style },
        "*",
      );
    }
  };

  if (keyJamConnected && !pageEnabled) return null;

  // hasRiv === null（检测中）走 falsy 分支，先用占位顶上，避免空白
  return (
    <div
      className="maestro-stickman-widget"
      data-state={state}
      data-keyjam-connected={keyJamConnected ? "true" : "false"}
      data-music-style={musicStyle}
      data-music-hit-phase={musicHitPhase}
      role="button"
      tabIndex={0}
      aria-label={`Maestro Stickman (${state})`}
      onClick={handleClick}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none",
        // 兜底可见性：即使注入的 <style> 被宿主页抵消，这里也保证右下角有一个可见框
        background: "rgba(20,18,28,0.4)",
        borderRadius: "18px",
        border: "1px solid rgba(255,143,171,0.35)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
      }}
    >
      <FallbackStickman state={state} />
      <div className="maestro-style-bubble" role="dialog" aria-label="选择 Maestro 风格">
        <div className="bubble-title">
          {keyJamConnected ? "你想要我弹什么类型的歌？" : "你想让我弹什么风格？"}
        </div>
        <div className="bubble-actions">
          {(Object.keys(STYLE_LABELS) as MusicStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              className="bubble-style-button"
              data-active={musicStyle === style ? "true" : "false"}
              onClick={(event) => {
                event.stopPropagation();
                selectStyle(style);
              }}
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** SVG 小钢琴家 fallback：表情 + 双手弹琴 + 睡觉/点击/烦躁状态。
 *  动画完全由 CSS 按 [data-state] 驱动（见 widget.css）。 */
function FallbackStickman({ state }: { state: CharacterState }) {
  return (
    <>
      <svg
        className="stickman-svg"
        viewBox="0 0 160 160"
        role="img"
        aria-label={`Maestro stickman: ${state}`}
        style={{ width: "100%", height: "100%", display: "block", overflow: "visible" }}
      >
        <g className="fallback-scene">
          <g className="ambient-marks" aria-hidden="true">
            <circle className="spark spark-1" cx="38" cy="38" r="1.9" />
            <circle className="spark spark-2" cx="122" cy="50" r="1.7" />
            <path className="music-note note-1" d="M125 31v17c0 3-3 5-6 4s-4-4-2-6c1-2 4-3 6-2V32z" />
            <path className="music-note note-2" d="M37 57v15c0 3-3 5-6 4s-4-4-2-6c1-2 4-3 6-2V58z" />
          </g>

          <g className="stickman">
            <g className="legs">
              <line className="leg left-leg" x1="75" y1="101" x2="62" y2="118" />
              <line className="leg right-leg" x1="86" y1="101" x2="101" y2="118" />
            </g>
            <line className="body" x1="80" y1="66" x2="80" y2="104" />

            <g className="arm-group left-arm">
              <line className="upper-arm" x1="76" y1="76" x2="66" y2="94" />
              <line className="forearm left-forearm" x1="66" y1="94" x2="58" y2="124" />
            </g>
            <g className="arm-group right-arm">
              <line className="upper-arm" x1="84" y1="76" x2="94" y2="94" />
              <line className="forearm right-forearm" x1="94" y1="94" x2="102" y2="124" />
            </g>

            <g className="head-group">
              <circle className="head" cx="80" cy="42" r="28" />
              <g className="face face-idle">
                <circle cx="70" cy="41" r="2.5" />
                <circle cx="90" cy="41" r="2.5" />
                <path d="M73 53C77 56 83 56 87 53" />
              </g>
              <g className="face face-calm">
                <circle cx="70" cy="41" r="2.3" />
                <circle cx="90" cy="41" r="2.3" />
                <path d="M74 53C78 55 82 55 86 53" />
              </g>
              <g className="face face-happy">
                <path d="M67 39C70 37 73 37 76 39" />
                <path d="M84 39C87 37 90 37 93 39" />
                <circle cx="70" cy="43" r="2.4" />
                <circle cx="90" cy="43" r="2.4" />
                <path d="M72 54C77 59 84 59 89 54" />
              </g>
              <g className="face face-focused">
                <path d="M66 39L75 40" />
                <path d="M94 39L85 40" />
                <circle cx="70" cy="44" r="2.1" />
                <circle cx="90" cy="44" r="2.1" />
                <path d="M74 55C78 57 82 57 86 55" />
              </g>
              <g className="face face-resting">
                <path d="M66 42H75" />
                <path d="M85 42H94" />
                <path d="M74 55C78 53 82 53 86 55" />
              </g>
              <g className="face face-sleeping">
                <path d="M66 42H75" />
                <path d="M85 42H94" />
                <path d="M73 54H87" />
              </g>
              <g className="face face-clicked">
                <circle cx="70" cy="41" r="3.2" />
                <circle cx="90" cy="41" r="3.2" />
                <path d="M72 54C78 59 86 59 91 54" />
              </g>
              <g className="face face-annoyed">
                <path d="M64 38L76 43" />
                <path d="M96 38L84 43" />
                <circle cx="70" cy="46" r="2.3" />
                <circle cx="90" cy="46" r="2.3" />
                <path d="M73 58C78 55 83 55 88 58" />
              </g>
            </g>

            <g className="sleep-z" aria-hidden="true">
              <path d="M104 24H118L105 39H119" />
              <path d="M120 12H130L121 23H131" />
            </g>
          </g>

          <g className="bench" aria-hidden="true">
            <rect className="bench-seat" x="58" y="106" width="44" height="8" rx="4" />
            <line className="bench-leg" x1="65" y1="113" x2="61" y2="130" />
            <line className="bench-leg" x1="95" y1="113" x2="99" y2="130" />
          </g>

          <g className="piano">
            <rect className="piano-shadow" x="27" y="132" width="106" height="17" rx="7" />
            <rect className="piano-back" x="34" y="106" width="92" height="16" rx="5" />
            <rect className="piano-body" x="24" y="116" width="112" height="27" rx="7" />
            <rect className="piano-lip" x="31" y="120" width="98" height="4" rx="2" />
            <g className="piano-keys">
              <rect className="white-key key-1" x="35" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-2" x="47" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-3" x="59" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-4" x="71" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-5" x="83" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-6" x="95" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-7" x="107" y="127" width="9" height="11" rx="1" />
              <rect className="white-key key-8" x="119" y="127" width="9" height="11" rx="1" />
            </g>
            <g className="piano-black-keys" aria-hidden="true">
              <rect className="black-key" x="43" y="127" width="6" height="7" rx="1" />
              <rect className="black-key" x="55" y="127" width="6" height="7" rx="1" />
              <rect className="black-key" x="79" y="127" width="6" height="7" rx="1" />
              <rect className="black-key" x="91" y="127" width="6" height="7" rx="1" />
              <rect className="black-key" x="103" y="127" width="6" height="7" rx="1" />
            </g>
          </g>

          <g className="hands-front">
            <circle className="hand left-hand-front" cx="58" cy="124" r="5" />
            <circle className="hand right-hand-front" cx="102" cy="124" r="5" />
          </g>
        </g>
      </svg>
      <span className="state-chip">{state}</span>
    </>
  );
}
