// 生成一段原创、免版税的示例音频(我们自己合成 → 无版权问题),供 app 演示用。
// 运行:node scripts/make-demo.js  →  写出 assets/demo-loop.wav
const fs = require("node:fs");
const path = require("node:path");

const SR = 44100;
const BPM = 120;
const beat = 60 / BPM; // 0.5s
const bar = beat * 4; // 2s
const bars = 8;
const N = Math.floor(SR * bar * bars);
const out = new Float32Array(N);

function addTone(freq, start, len, gain) {
  const s = Math.floor(start * SR);
  const e = Math.min(N, Math.floor((start + len) * SR));
  for (let i = s; i < e; i++) {
    const t = (i - s) / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t / (len * 0.5));
    // 三角波(柔和)
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
    out[i] += tri * env * gain;
  }
}
function addNoise(start, len, gain) {
  const s = Math.floor(start * SR);
  const e = Math.min(N, Math.floor((start + len) * SR));
  for (let i = s; i < e; i++) {
    const t = (i - s) / SR;
    out[i] += (Math.random() * 2 - 1) * Math.exp(-t / (len * 0.4)) * gain;
  }
}
function addKick(start, gain) {
  const len = 0.18;
  const s = Math.floor(start * SR);
  const e = Math.min(N, Math.floor((start + len) * SR));
  for (let i = s; i < e; i++) {
    const t = (i - s) / SR;
    const f = 110 * Math.exp(-t / 0.03) + 45;
    out[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.12) * gain;
  }
}

const CH = {
  C: [261.63, 329.63, 392.0],
  Am: [220.0, 261.63, 329.63],
  F: [174.61, 220.0, 261.63],
  G: [196.0, 246.94, 293.66],
};
const ROOT = { C: 65.41, Am: 55.0, F: 43.65, G: 49.0 };
const prog = ["C", "Am", "F", "G", "C", "Am", "F", "G"];

for (let b = 0; b < bars; b++) {
  const t0 = b * bar;
  const ch = prog[b];
  for (const f of CH[ch]) addTone(f, t0, bar, 0.05); // 和弦铺底
  addTone(ROOT[ch], t0, beat * 0.9, 0.18); // 贝斯根音(1拍)
  addTone(ROOT[ch], t0 + 2 * beat, beat * 0.9, 0.18); // (3拍)
  addKick(t0, 0.9);
  addKick(t0 + 2 * beat, 0.9);
  addNoise(t0 + beat, 0.12, 0.12); // 军鼓 2、4拍
  addNoise(t0 + 3 * beat, 0.12, 0.12);
  for (let h = 0; h < 8; h++) addNoise(t0 + h * (beat / 2), 0.025, 0.03); // 8分踩镲
}

// 归一化
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
const norm = peak > 0 ? 0.9 / peak : 1;
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, out[i] * norm));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}

// WAV 头(单声道 16bit)
const h = Buffer.alloc(44);
h.write("RIFF", 0);
h.writeUInt32LE(36 + pcm.length, 4);
h.write("WAVE", 8);
h.write("fmt ", 12);
h.writeUInt32LE(16, 16);
h.writeUInt16LE(1, 20);
h.writeUInt16LE(1, 22);
h.writeUInt32LE(SR, 24);
h.writeUInt32LE(SR * 2, 28);
h.writeUInt16LE(2, 32);
h.writeUInt16LE(16, 34);
h.write("data", 36);
h.writeUInt32LE(pcm.length, 40);

const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
const fp = path.join(dir, "demo-loop.wav");
const buf = Buffer.concat([h, pcm]);
fs.writeFileSync(fp, buf);
console.log("wrote", fp, (buf.length / 1024).toFixed(0) + "KB");
