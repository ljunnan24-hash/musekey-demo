import type { TypingLevel } from "./typingTracker";

const MIN_GAP_MS = 48;
export const LOCAL_AUDIO_STORAGE_KEY = "maestro_stickman_local_audio_v1";
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
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  gain: number;
  delayFeedback: number;
  delayWet: number;
  noteLength: number;
}

interface LocalAudioSettings {
  enabled?: boolean;
  name?: string;
  dataUrl?: string;
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
}

const STYLE_CONFIGS: Record<MusicStyle, StyleConfig> = {
  lofi: {
    bpm: 78,
    oscillator: "triangle",
    envelope: { attack: 0.006, decay: 0.18, sustain: 0.08, release: 0.22 },
    gain: 0.09,
    delayFeedback: 0.08,
    delayWet: 0.08,
    noteLength: 0.16,
  },
  edm: {
    bpm: 128,
    oscillator: "sawtooth",
    envelope: { attack: 0.003, decay: 0.08, sustain: 0.12, release: 0.11 },
    gain: 0.07,
    delayFeedback: 0.05,
    delayWet: 0.06,
    noteLength: 0.09,
  },
  jazz: {
    bpm: 100,
    oscillator: "triangle",
    envelope: { attack: 0.012, decay: 0.16, sustain: 0.1, release: 0.2 },
    gain: 0.085,
    delayFeedback: 0.06,
    delayWet: 0.07,
    noteLength: 0.14,
  },
  ambient: {
    bpm: 60,
    oscillator: "sine",
    envelope: { attack: 0.04, decay: 0.24, sustain: 0.18, release: 0.42 },
    gain: 0.065,
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
  private localAudio: HTMLAudioElement | null = null;
  private localAudioLoaded = false;
  private localAudioEnabled = false;
  private localAudioConfigured = false;
  private localQuietTimer: number | null = null;
  private step = 0;
  private lastPlayedAt = 0;
  private style: MusicStyle = "lofi";

  setStyle(style: MusicStyle): void {
    if (this.style === style) return;
    this.style = style;
    this.step = 0;
    this.rebuildEngine();
  }

  preloadLocalAudio(): void {
    if (!this.localAudioLoaded) {
      void this.loadLocalAudio();
    }
  }

  resetLocalAudio(): void {
    if (this.localQuietTimer) {
      window.clearTimeout(this.localQuietTimer);
      this.localQuietTimer = null;
    }
    this.localAudio?.pause();
    this.localAudio = null;
    this.localAudioLoaded = false;
    this.localAudioEnabled = false;
    this.localAudioConfigured = false;
  }

  async play(key = "", level: TypingLevel = "slow", now = performance.now()): Promise<void> {
    if (now - this.lastPlayedAt < MIN_GAP_MS) return;
    this.lastPlayedAt = now;

    const localBackingHandled = await this.ensureLocalAudio(level);
    if (localBackingHandled) return;

    const engine = this.engine ?? this.buildEngine();
    if (!engine) return;
    if (engine.context.state === "suspended") {
      await engine.context.resume().catch(() => {});
    }

    const note = keyToNote(key) ?? pentaNote(this.step % PENTA.length, this.step % 5 === 4 ? 3 : 4);
    this.step = (this.step + 1) % 64;
    this.playVoice(engine, note);
  }

  private async ensureLocalAudio(level: TypingLevel): Promise<boolean> {
    if (!this.localAudioLoaded) {
      await this.loadLocalAudio();
    }
    if (!this.localAudioConfigured) return false;
    if (!this.localAudio || !this.localAudioEnabled) return true;

    this.localAudio.volume = volumeForLevel(level);
    if (this.localQuietTimer) window.clearTimeout(this.localQuietTimer);
    this.localQuietTimer = window.setTimeout(() => {
      if (this.localAudio) this.localAudio.volume = volumeForLevel("none");
    }, 1300);
    if (this.localAudio.paused) {
      await this.localAudio.play().catch(() => {});
    }
    return true;
  }

  private async loadLocalAudio(): Promise<void> {
    this.localAudioLoaded = true;
    const got = (await chrome.storage.local
      .get([LOCAL_AUDIO_STORAGE_KEY])
      .catch(() => ({}))) as Record<string, unknown>;
    const settings = got[LOCAL_AUDIO_STORAGE_KEY] as LocalAudioSettings | undefined;
    if (!settings?.enabled || !settings.dataUrl) {
      this.localAudioConfigured = !!settings?.enabled && !!settings?.dataUrl;
      this.localAudioEnabled = false;
      this.localAudio = null;
      return;
    }

    const audio = new Audio(settings.dataUrl);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.18;
    audio.load();
    this.localAudio = audio;
    this.localAudioConfigured = true;
    this.localAudioEnabled = true;
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

    master.gain.value = 0.78;
    master.connect(context.destination);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(context.destination);

    this.engine = { context, master, delay, delayFeedback, delayWet };
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

function volumeForLevel(level: TypingLevel): number {
  switch (level) {
    case "fast":
      return 0.78;
    case "normal":
      return 0.46;
    case "slow":
      return 0.22;
    case "none":
    default:
      return 0.08;
  }
}

export const typingMusic = new TypingMusic();
