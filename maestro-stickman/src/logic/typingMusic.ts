const MIN_GAP_MS = 48;
const PENTA = ["C", "D", "E", "G", "A"] as const;
const ROWS = [
  { keys: "qwertyuiop", baseOctave: 5 },
  { keys: "asdfghjkl", baseOctave: 4 },
  { keys: "zxcvbnm", baseOctave: 3 },
] as const;

type AudioContextCtor = typeof AudioContext;
export type MusicStyle = "lofi" | "edm" | "jazz" | "ambient";

interface Envelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

interface StyleConfig {
  bpm: number;
  osc: OscillatorType;
  env: Envelope;
  volumeDb: number;
  delayTime: "8n." | "4n.";
  delayFB: number;
  delayWet: number;
}

const STYLE_CONFIGS: Record<MusicStyle, StyleConfig> = {
  lofi: {
    bpm: 78,
    osc: "triangle",
    env: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 1.2 },
    volumeDb: -6,
    delayTime: "8n.",
    delayFB: 0.28,
    delayWet: 0.25,
  },
  edm: {
    bpm: 128,
    osc: "sawtooth",
    env: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.6 },
    volumeDb: -4,
    delayTime: "8n.",
    delayFB: 0.15,
    delayWet: 0.15,
  },
  jazz: {
    bpm: 100,
    osc: "triangle",
    env: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
    volumeDb: -8,
    delayTime: "8n.",
    delayFB: 0.2,
    delayWet: 0.18,
  },
  ambient: {
    bpm: 60,
    osc: "sine",
    env: { attack: 0.2, decay: 0.5, sustain: 0.3, release: 2.5 },
    volumeDb: -10,
    delayTime: "4n.",
    delayFB: 0.35,
    delayWet: 0.3,
  },
};

const NOTE_OFFSET: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function getAudioContextCtor(): AudioContextCtor | null {
  const win = window as typeof window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function pentaNote(index: number, baseOctave: number): string {
  const octave = baseOctave + Math.floor(index / PENTA.length);
  return PENTA[((index % PENTA.length) + PENTA.length) % PENTA.length] + octave;
}

function noteToFrequency(note: string): number {
  const match = /^([A-G])(#?)(-?\d+)$/.exec(note);
  if (!match) return 261.63;
  const [, name, sharp, octave] = match;
  const midi = (Number(octave) + 1) * 12 + NOTE_OFFSET[name] + (sharp ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

function keyToFrequency(key: string): number | null {
  const lower = key.toLowerCase();
  for (const row of ROWS) {
    const index = row.keys.indexOf(lower);
    if (index >= 0) return noteToFrequency(pentaNote(index, row.baseOctave));
  }
  return null;
}

function noteDurationSeconds(config: StyleConfig): number {
  return 60 / config.bpm / 2;
}

function delaySeconds(config: StyleConfig): number {
  const beat = 60 / config.bpm;
  return config.delayTime === "4n." ? beat * 1.5 : beat * 0.75;
}

export class TypingMusic {
  private ctx: AudioContext | null = null;
  private delay: DelayNode | null = null;
  private feedback: GainNode | null = null;
  private wet: GainNode | null = null;
  private step = 0;
  private lastPlayedAt = 0;
  private style: MusicStyle = "lofi";

  setStyle(style: MusicStyle): void {
    this.style = style;
    this.step = 0;
    this.configureDelay();
  }

  async play(key = "", now = performance.now()): Promise<void> {
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    const AudioContextClass = getAudioContextCtor();
    if (!AudioContextClass) return;

    this.ctx ??= new AudioContextClass({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    this.configureDelay();

    const config = STYLE_CONFIGS[this.style];
    const fallbackIndex = this.step % PENTA.length;
    const fallbackOctave = this.step % 5 === 4 ? 3 : 4;
    const freq = keyToFrequency(key) ?? noteToFrequency(pentaNote(fallbackIndex, fallbackOctave));
    this.step = (this.step + 1) % 64;

    const start = this.ctx.currentTime;
    const duration = noteDurationSeconds(config);
    const releaseStart = start + duration;
    const end = releaseStart + config.env.release;
    const peak = dbToGain(config.volumeDb) * 0.18;
    const sustain = Math.max(0.0001, peak * config.env.sustain);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = config.osc;
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + config.env.attack);
    gain.gain.exponentialRampToValueAtTime(sustain, start + config.env.attack + config.env.decay);
    gain.gain.setValueAtTime(sustain, releaseStart);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    if (this.delay) gain.connect(this.delay);

    osc.start(start);
    osc.stop(end + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  private configureDelay(): void {
    if (!this.ctx) return;
    const config = STYLE_CONFIGS[this.style];

    if (!this.delay || !this.feedback || !this.wet) {
      this.delay = this.ctx.createDelay(2);
      this.feedback = this.ctx.createGain();
      this.wet = this.ctx.createGain();
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
      this.delay.connect(this.wet);
      this.wet.connect(this.ctx.destination);
    }

    const time = this.ctx.currentTime;
    this.delay.delayTime.setTargetAtTime(delaySeconds(config), time, 0.01);
    this.feedback.gain.setTargetAtTime(config.delayFB, time, 0.01);
    this.wet.gain.setTargetAtTime(config.delayWet * 0.22, time, 0.01);
  }
}

export const typingMusic = new TypingMusic();
