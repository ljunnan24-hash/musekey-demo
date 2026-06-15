import * as Tone from "tone";

const MIN_GAP_MS = 48;
const PENTA = ["C", "D", "E", "G", "A"] as const;
const ROWS = [
  { keys: "qwertyuiop", baseOctave: 5 },
  { keys: "asdfghjkl", baseOctave: 4 },
  { keys: "zxcvbnm", baseOctave: 3 },
] as const;

export type MusicStyle = "lofi" | "edm" | "jazz" | "ambient";

interface StyleConfig {
  bpm: number;
  melodyOsc: "triangle" | "sawtooth" | "sine";
  melodyEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  melodyVol: number;
  delayTime: "8n." | "4n.";
  delayFB: number;
  delayWet: number;
}

const STYLE_CONFIGS: Record<MusicStyle, StyleConfig> = {
  lofi: {
    bpm: 78,
    melodyOsc: "triangle",
    melodyEnv: { attack: 0.005, decay: 0.4, sustain: 0.15, release: 1.2 },
    melodyVol: -6,
    delayTime: "8n.",
    delayFB: 0.28,
    delayWet: 0.25,
  },
  edm: {
    bpm: 128,
    melodyOsc: "sawtooth",
    melodyEnv: { attack: 0.002, decay: 0.2, sustain: 0.3, release: 0.6 },
    melodyVol: -4,
    delayTime: "8n.",
    delayFB: 0.15,
    delayWet: 0.15,
  },
  jazz: {
    bpm: 100,
    melodyOsc: "triangle",
    melodyEnv: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.8 },
    melodyVol: -8,
    delayTime: "8n.",
    delayFB: 0.2,
    delayWet: 0.18,
  },
  ambient: {
    bpm: 60,
    melodyOsc: "sine",
    melodyEnv: { attack: 0.2, decay: 0.5, sustain: 0.3, release: 2.5 },
    melodyVol: -10,
    delayTime: "4n.",
    delayFB: 0.35,
    delayWet: 0.3,
  },
};

interface Engine {
  dryGain: Tone.Gain;
  delay: Tone.FeedbackDelay;
  ambienceGain: Tone.Gain;
  melody: Tone.PolySynth<Tone.Synth>;
}

function pentaNote(index: number, baseOctave: number): string {
  const octave = baseOctave + Math.floor(index / PENTA.length);
  return PENTA[((index % PENTA.length) + PENTA.length) % PENTA.length] + octave;
}

function keyToNote(key: string): string | null {
  const lower = key.toLowerCase();
  for (const row of ROWS) {
    const index = row.keys.indexOf(lower);
    if (index >= 0) return pentaNote(index, row.baseOctave);
  }
  return null;
}

function delaySeconds(config: StyleConfig): number {
  const beat = 60 / config.bpm;
  return config.delayTime === "4n." ? beat * 1.5 : beat * 0.75;
}

export class TypingMusic {
  private engine: Engine | null = null;
  private step = 0;
  private lastPlayedAt = 0;
  private style: MusicStyle = "lofi";

  setStyle(style: MusicStyle): void {
    if (this.style === style) return;
    this.style = style;
    this.step = 0;
    this.rebuildEngine();
  }

  async play(key = "", now = performance.now()): Promise<void> {
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    await Tone.start();
    const engine = this.engine ?? this.buildEngine();

    const note = keyToNote(key) ?? pentaNote(this.step % PENTA.length, this.step % 5 === 4 ? 3 : 4);
    this.step = (this.step + 1) % 64;
    const velocity = 0.7 + Math.random() * 0.3;
    engine.melody.triggerAttackRelease(note, "8n", undefined, velocity);
  }

  private rebuildEngine(): void {
    if (!this.engine) return;
    this.disposeEngine();
    this.buildEngine();
  }

  private buildEngine(): Engine {
    const config = STYLE_CONFIGS[this.style];

    const dryGain = new Tone.Gain(config.melodyVol > -8 ? 0.65 : 0.75).toDestination();
    const ambienceGain = new Tone.Gain(0.55).toDestination();
    const delay = new Tone.FeedbackDelay(delaySeconds(config), config.delayFB);
    delay.wet.value = config.delayWet;
    delay.connect(ambienceGain);

    const melody = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: config.melodyOsc as "triangle" | "sawtooth" | "sine" },
      envelope: config.melodyEnv,
      volume: config.melodyVol,
    });
    melody.connect(dryGain);
    melody.connect(delay);

    this.engine = { dryGain, delay, ambienceGain, melody };
    return this.engine;
  }

  private disposeEngine(): void {
    if (!this.engine) return;
    for (const node of Object.values(this.engine)) {
      try {
        node.dispose();
      } catch {
        // Best-effort cleanup; a stale audio node should not break typing.
      }
    }
    this.engine = null;
  }
}

export const typingMusic = new TypingMusic();
