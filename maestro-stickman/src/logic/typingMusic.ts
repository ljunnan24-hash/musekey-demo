const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const MIN_GAP_MS = 48;

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  const win = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

export class TypingMusic {
  private ctx: AudioContext | null = null;
  private step = 0;
  private lastPlayedAt = 0;

  async play(now = performance.now()): Promise<void> {
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    const AudioContextClass = getAudioContextCtor();
    if (!AudioContextClass) return;

    this.ctx ??= new AudioContextClass({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    const start = this.ctx.currentTime;
    const freq = SCALE[this.step % SCALE.length] * (this.step % 5 === 4 ? 0.5 : 1);
    this.step = (this.step + 1) % 64;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export const typingMusic = new TypingMusic();
