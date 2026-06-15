const MIN_GAP_MS = 48;

type AudioContextCtor = typeof AudioContext;
export type MusicStyle = "lofi" | "edm" | "jazz" | "ambient";

interface StyleConfig {
  osc: OscillatorType;
  scale: number[];
  gain: number;
  attack: number;
  duration: number;
}

const STYLE_CONFIGS: Record<MusicStyle, StyleConfig> = {
  lofi: {
    osc: "triangle",
    scale: [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
    gain: 0.045,
    attack: 0.008,
    duration: 0.18,
  },
  edm: {
    osc: "sawtooth",
    scale: [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 659.25],
    gain: 0.032,
    attack: 0.004,
    duration: 0.12,
  },
  jazz: {
    osc: "triangle",
    scale: [196.0, 233.08, 261.63, 293.66, 349.23, 392.0, 466.16, 523.25],
    gain: 0.04,
    attack: 0.01,
    duration: 0.2,
  },
  ambient: {
    osc: "sine",
    scale: [174.61, 196.0, 261.63, 293.66, 329.63, 392.0, 523.25, 587.33],
    gain: 0.035,
    attack: 0.03,
    duration: 0.42,
  },
};

function getAudioContextCtor(): AudioContextCtor | null {
  const win = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

export class TypingMusic {
  private ctx: AudioContext | null = null;
  private step = 0;
  private lastPlayedAt = 0;
  private style: MusicStyle = "lofi";

  setStyle(style: MusicStyle): void {
    this.style = style;
    this.step = 0;
  }

  async play(now = performance.now()): Promise<void> {
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    const AudioContextClass = getAudioContextCtor();
    if (!AudioContextClass) return;

    this.ctx ??= new AudioContextClass({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const config = STYLE_CONFIGS[this.style];
    const start = this.ctx.currentTime;
    const freq = config.scale[this.step % config.scale.length] * (this.step % 5 === 4 ? 0.5 : 1);
    this.step = (this.step + 1) % 64;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = config.osc;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(config.gain, start + config.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + config.duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + config.duration + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const typingMusic = new TypingMusic();
