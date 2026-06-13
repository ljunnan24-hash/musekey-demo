// 生成一段原创、免版税的【立体声】示例音频(自己合成 → 无版权问题)。
// 编排:中置一条"主唱式"旋律 + 两侧声相铺开的乐队(鼓/贝斯/和弦)。
// 这样「去人声」(左−右中置消除)会把中置旋律抵消、保留乐队 → 真实演示去人声。
// 运行:node scripts/make-demo.js  →  写出 assets/demo-loop.wav
const fs = require("node:fs");
const path = require("node:path");

const SR = 44100;
const BPM = 120;
const beat = 60 / BPM; // 0.5s
const bar = beat * 4; // 2s
const bars = 8;
const N = Math.floor(SR * bar * bars);
const L = new Float32Array(N);
const R = new Float32Array(N);

// 等功率声相:pan -1=左, 0=中, +1=右
function panGains(pan, gain) {
  const a = ((pan + 1) * Math.PI) / 4;
  return [gain * Math.cos(a), gain * Math.sin(a)];
}
function addTone(freq, start, len, gain, pan) {
  const [gl, gr] = panGains(pan, gain);
  const s = Math.floor(start * SR), e = Math.min(N, Math.floor((start + len) * SR));
  for (let i = s; i < e; i++) {
    const t = (i - s) / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t / (len * 0.5));
    const tri = (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * freq * t));
    L[i] += tri * env * gl; R[i] += tri * env * gr;
  }
}
function addNoise(start, len, gain, pan) {
  const [gl, gr] = panGains(pan, gain);
  const s = Math.floor(start * SR), e = Math.min(N, Math.floor((start + len) * SR));
  for (let i = s; i < e; i++) {
    const t = (i - s) / SR, v = (Math.random() * 2 - 1) * Math.exp(-t / (len * 0.4));
    L[i] += v * gl; R[i] += v * gr;
  }
}
function addKick(start, gain, pan) {
  const [gl, gr] = panGains(pan, gain);
  const len = 0.18, s = Math.floor(start * SR), e = Math.min(N, Math.floor((start + len) * SR));
  for (let i = s; i < e; i++) {
    const t = (i - s) / SR, f = 110 * Math.exp(-t / 0.03) + 45, v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.12);
    L[i] += v * gl; R[i] += v * gr;
  }
}

const CH = { C: [261.63, 329.63, 392.0], Am: [220.0, 261.63, 329.63], F: [174.61, 220.0, 261.63], G: [196.0, 246.94, 293.66] };
const ROOT = { C: 65.41, Am: 55.0, F: 43.65, G: 49.0 };
const prog = ["C", "Am", "F", "G", "C", "Am", "F", "G"];

for (let b = 0; b < bars; b++) {
  const t0 = b * bar, ch = prog[b], tones = CH[ch];
  // 乐队:声相铺开(避开正中,才能在 L−R 后存活)
  tones.forEach((f, k) => addTone(f, t0, bar, 0.045, k === 0 ? -0.6 : k === 1 ? 0.6 : -0.45)); // 和弦
  addTone(ROOT[ch], t0, beat * 0.9, 0.17, -0.3); // 贝斯
  addTone(ROOT[ch], t0 + 2 * beat, beat * 0.9, 0.17, -0.3);
  addKick(t0, 0.85, -0.15); addKick(t0 + 2 * beat, 0.85, -0.15);
  addNoise(t0 + beat, 0.12, 0.11, 0.25); addNoise(t0 + 3 * beat, 0.12, 0.11, 0.25); // 军鼓
  for (let h = 0; h < 8; h++) addNoise(t0 + h * (beat / 2), 0.022, 0.028, h % 2 ? 0.45 : -0.45); // 踩镲

  // 中置"主唱式"旋律(去人声会把它抵消)—— 和弦音高八度的小动机
  for (let k = 0; k < 4; k++) addTone(tones[k % 3] * 2, t0 + k * beat, beat * 0.85, 0.16, 0);
}

// 联合归一化(L、R 用同一系数,保持平衡)
let peak = 0;
for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = peak > 0 ? 0.9 / peak : 1;

// 交错写 16-bit 立体声 PCM
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i] * norm)), r = Math.max(-1, Math.min(1, R[i] * norm));
  pcm.writeInt16LE(Math.round(l * 32767), i * 4);
  pcm.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}

const h = Buffer.alloc(44);
h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); // 2 声道
h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
h.write("data", 36); h.writeUInt32LE(pcm.length, 40);

const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
const fp = path.join(dir, "demo-loop.wav");
const buf = Buffer.concat([h, pcm]);
fs.writeFileSync(fp, buf);
console.log("wrote", fp, (buf.length / 1024).toFixed(0) + "KB (立体声)");
