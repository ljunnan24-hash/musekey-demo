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
  noteLength: number;
}

const STYLE_CONFIGS: Record<MusicStyle, StyleConfig> = {
  lofi: {
    bpm: 78,
    melodyOsc: "triangle",
    melodyEnv: { attack: 0.005, decay: 0.18, sustain: 0.08, release: 0.24 },
    melodyVol: -8,
    delayTime: "8n.",
    delayFB: 0.08,
    delayWet: 0.08,
    noteLength: 0.16,
  },
  edm: {
    bpm: 128,
    melodyOsc: "sawtooth",
    melodyEnv: { attack: 0.002, decay: 0.08, sustain: 0.12, release: 0.12 },
    melodyVol: -9,
    delayTime: "8n.",
    delayFB: 0.05,
    delayWet: 0.06,
    noteLength: 0.09,
  },
  jazz: {
    bpm: 100,
    melodyOsc: "triangle",
    melodyEnv: { attack: 0.01, decay: 0.16, sustain: 0.1, release: 0.22 },
    melodyVol: -8,
    delayTime: "8n.",
    delayFB: 0.06,
    delayWet: 0.07,
    noteLength: 0.14,
  },
  ambient: {
    bpm: 60,
    melodyOsc: "sine",
    melodyEnv: { attack: 0.04, decay: 0.24, sustain: 0.18, release: 0.55 },
    melodyVol: -12,
    delayTime: "4n.",
    delayFB: 0.12,
    delayWet: 0.12,
    noteLength: 0.28,
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
  const musicalDelay = config.delayTime === "4n." ? beat * 1.5 : beat * 0.75;
  return Math.min(musicalDelay, 0.22);
}

export class TypingMusic {
  private engine: Engine | null = null;
  private step = 0;
  private lastPlayedAt = 0;
  private notesSinceRelease = 0;
  private style: MusicStyle = "lofi";
  private toneContextReady = false;

  setStyle(style: MusicStyle): void {
    if (this.style === style) return;
    this.style = style;
    this.step = 0;
    this.rebuildEngine();
  }

  async play(key = "", now = performance.now()): Promise<void> {
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    this.ensureToneContext();
    await Tone.start();
    const engine = this.engine ?? this.buildEngine();

    const note = keyToNote(key) ?? pentaNote(this.step % PENTA.length, this.step % 5 === 4 ? 3 : 4);
    this.step = (this.step + 1) % 64;
    this.notesSinceRelease += 1;
    if (this.notesSinceRelease >= 6) {
      engine.melody.releaseAll();
      this.notesSinceRelease = 0;
    }
    const velocity = 0.7 + Math.random() * 0.3;
    engine.melody.triggerAttackRelease(note, STYLE_CONFIGS[this.style].noteLength, undefined, velocity);
  }

  private ensureToneContext(): void {
    if (this.toneContextReady) return;
    Tone.setContext(
      new Tone.Context({
        clockSource: "timeout",
        latencyHint: "interactive",
        lookAhead: 0.02,
        updateInterval: 0.03,
      }),
    );
    this.toneContextReady = true;
  }

  private rebuildEngine(): void {
    if (!this.engine) return;
    this.disposeEngine();
    this.buildEngine();
  }

  private buildEngine(): Engine {
    const config = STYLE_CONFIGS[this.style];

    const dryGain = new Tone.Gain(config.melodyVol > -8 ? 0.65 : 0.75).toDestination();
    const ambienceGain = new Tone.Gain(0.38).toDestination();
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
