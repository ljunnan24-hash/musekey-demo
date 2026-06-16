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
  oscillator: OscillatorType;
  backgroundOscillator: OscillatorType;
  backgroundChords: string[][];
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  gain: number;
  backgroundGain: number;
  delayFeedback: number;
  delayWet: number;
  noteLength: number;
}

interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}

interface Engine {
  context: AudioContext;
  master: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  background: GainNode;
}

const STYLE_CONFIGS: Record<MusicStyle, StyleConfig> = {
  lofi: {
    bpm: 78,
    oscillator: "triangle",
    backgroundOscillator: "sine",
    backgroundChords: [
      ["C3", "E3", "G3", "B3"],
      ["A2", "C3", "E3", "G3"],
      ["F2", "A2", "C3", "E3"],
      ["G2", "B2", "D3", "F3"],
    ],
    envelope: { attack: 0.006, decay: 0.18, sustain: 0.08, release: 0.22 },
    gain: 0.16,
    backgroundGain: 0.018,
    delayFeedback: 0.08,
    delayWet: 0.08,
    noteLength: 0.16,
  },
  edm: {
    bpm: 128,
    oscillator: "sawtooth",
    backgroundOscillator: "sawtooth",
    backgroundChords: [
      ["A2", "C3", "E3"],
      ["F2", "A2", "C3"],
      ["C3", "E3", "G3"],
      ["G2", "B2", "D3"],
    ],
    envelope: { attack: 0.003, decay: 0.08, sustain: 0.12, release: 0.11 },
    gain: 0.11,
    backgroundGain: 0.012,
    delayFeedback: 0.05,
    delayWet: 0.06,
    noteLength: 0.09,
  },
  jazz: {
    bpm: 100,
    oscillator: "triangle",
    backgroundOscillator: "triangle",
    backgroundChords: [
      ["D3", "F3", "A3", "C4"],
      ["G2", "B2", "D3", "F3"],
      ["C3", "E3", "G3", "B3"],
      ["A2", "C#3", "E3", "G3"],
    ],
    envelope: { attack: 0.012, decay: 0.16, sustain: 0.1, release: 0.2 },
    gain: 0.15,
    backgroundGain: 0.015,
    delayFeedback: 0.06,
    delayWet: 0.07,
    noteLength: 0.14,
  },
  ambient: {
    bpm: 60,
    oscillator: "sine",
    backgroundOscillator: "sine",
    backgroundChords: [
      ["C3", "E3", "G3", "B3"],
      ["E3", "G3", "B3", "D4"],
      ["A2", "C3", "E3", "G3"],
      ["F2", "A2", "C3", "E3"],
    ],
    envelope: { attack: 0.04, decay: 0.24, sustain: 0.18, release: 0.42 },
    gain: 0.1,
    backgroundGain: 0.014,
    delayFeedback: 0.1,
    delayWet: 0.1,
    noteLength: 0.24,
  },
};

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

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

function noteToFrequency(note: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) return 261.63;
  const [, name, octaveText] = match;
  const octave = Number(octaveText);
  const midi = (octave + 1) * 12 + NOTE_INDEX[name];
  return 440 * 2 ** ((midi - 69) / 12);
}

function delaySeconds(config: StyleConfig): number {
  const beat = 60 / config.bpm;
  return Math.min(beat * 0.75, 0.2);
}

function getAudioContext(): typeof AudioContext | null {
  const win = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext ?? win.webkitAudioContext ?? null;
}

export class TypingMusic {
  private engine: Engine | null = null;
  private activeVoices = new Set<Voice>();
  private backgroundTimer: number | null = null;
  private backgroundStep = 0;
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

    const engine = this.engine ?? this.buildEngine();
    if (!engine) return;
    if (engine.context.state === "suspended") {
      await engine.context.resume().catch(() => {});
    }
    this.ensureBackground(engine);

    const note = keyToNote(key) ?? pentaNote(this.step % PENTA.length, this.step % 5 === 4 ? 3 : 4);
    this.step = (this.step + 1) % 64;
    this.playVoice(engine, note);
  }

  private ensureBackground(engine: Engine): void {
    if (this.backgroundTimer !== null) return;
    this.playBackgroundChord(engine);
  }

  private playBackgroundChord(engine: Engine): void {
    if (engine.context.state === "closed") return;

    const config = STYLE_CONFIGS[this.style];
    const chord = config.backgroundChords[this.backgroundStep % config.backgroundChords.length];
    const start = engine.context.currentTime;
    const beat = 60 / config.bpm;
    const duration = Math.max(0.45, beat * 1.8);
    const end = start + duration;

    this.backgroundStep = (this.backgroundStep + 1) % config.backgroundChords.length;
    chord.forEach((note, index) => {
      const oscillator = engine.context.createOscillator();
      const gain = engine.context.createGain();
      const voice: Voice = { oscillator, gain };
      const voiceGain = config.backgroundGain / Math.sqrt(chord.length) / (index === 0 ? 1 : 1.25);

      oscillator.type = config.backgroundOscillator;
      oscillator.frequency.setValueAtTime(noteToFrequency(note), start);
      oscillator.detune.setValueAtTime((index - 1.5) * 3, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(voiceGain, start + 0.12);
      gain.gain.setValueAtTime(voiceGain, end - 0.16);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(engine.background);
      oscillator.start(start);
      oscillator.stop(end + 0.03);

      this.activeVoices.add(voice);
      oscillator.onended = () => {
        gain.disconnect();
        oscillator.disconnect();
        this.activeVoices.delete(voice);
      };
    });

    this.backgroundTimer = window.setTimeout(() => {
      this.backgroundTimer = null;
      if (this.engine === engine) this.playBackgroundChord(engine);
    }, beat * 2 * 1000);
  }

  private playVoice(engine: Engine, note: string): void {
    const config = STYLE_CONFIGS[this.style];
    const start = engine.context.currentTime;
    const releaseAt = start + config.noteLength;
    const end = releaseAt + config.envelope.release + 0.04;
    const oscillator = engine.context.createOscillator();
    const gain = engine.context.createGain();
    const voice: Voice = { oscillator, gain };

    oscillator.type = config.oscillator;
    oscillator.frequency.setValueAtTime(noteToFrequency(note), start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(config.gain, start + config.envelope.attack);
    gain.gain.linearRampToValueAtTime(
      Math.max(0.0001, config.gain * config.envelope.sustain),
      start + config.envelope.attack + config.envelope.decay,
    );
    gain.gain.setValueAtTime(Math.max(0.0001, config.gain * config.envelope.sustain), releaseAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(engine.master);
    gain.connect(engine.delay);
    oscillator.start(start);
    oscillator.stop(end);

    this.activeVoices.add(voice);
    oscillator.onended = () => {
      gain.disconnect();
      oscillator.disconnect();
      this.activeVoices.delete(voice);
    };
  }

  private rebuildEngine(): void {
    if (!this.engine) return;
    const context = this.engine.context;
    this.configureEngine(this.engine);
    if (context.state === "closed") this.engine = null;
  }

  private buildEngine(): Engine | null {
    const AudioContextCtor = getAudioContext();
    if (!AudioContextCtor) return null;

    const context = new AudioContextCtor({ latencyHint: "interactive" });
    const master = context.createGain();
    const delay = context.createDelay(0.5);
    const delayFeedback = context.createGain();
    const delayWet = context.createGain();
    const background = context.createGain();

    master.gain.value = 0.78;
    background.gain.value = 1;
    master.connect(context.destination);
    background.connect(context.destination);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(context.destination);

    this.engine = { context, master, delay, delayFeedback, delayWet, background };
    this.configureEngine(this.engine);
    return this.engine;
  }

  private configureEngine(engine: Engine): void {
    const config = STYLE_CONFIGS[this.style];
    const now = engine.context.currentTime;
    engine.delay.delayTime.setTargetAtTime(delaySeconds(config), now, 0.01);
    engine.delayFeedback.gain.setTargetAtTime(config.delayFeedback, now, 0.01);
    engine.delayWet.gain.setTargetAtTime(config.delayWet, now, 0.01);
  }
}

export const typingMusic = new TypingMusic();
