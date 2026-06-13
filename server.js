// KeyJam 极简后端:托管页面 + 把 /api/chords 转发给 DeepSeek(OpenAI 兼容)
// 运行:DEEPSEEK_API_KEY=sk-xxx node server.js   (需要 Node 18+,自带 fetch)
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const DIR = __dirname;

// 从 .env 读取环境变量(零依赖;不覆盖已存在的真实环境变量)
function loadEnv() {
  try {
    const txt = fs.readFileSync(path.join(DIR, ".env"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* 没有 .env 就忽略 */
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;
const KEY = process.env.DEEPSEEK_API_KEY;

// 公开/公共版权曲库(我们自己维护;只放词曲已进入公共领域的曲子)
let SONGS = [];
try {
  SONGS = JSON.parse(fs.readFileSync(path.join(DIR, "assets", "songs.json"), "utf8"));
} catch {
  SONGS = [];
}
const normKey = (s) => String(s || "").toLowerCase().replace(/[\s\-_·、,，.。'"《》]/g, "");
function searchSong(q) {
  const nq = normKey(q);
  if (!nq) return null;
  for (const s of SONGS) {
    const keys = [s.title, s.artist, ...(s.aliases || [])].map(normKey);
    if (keys.some((k) => k && (k.includes(nq) || nq.includes(k)))) return s;
  }
  return null;
}

const SYSTEM_PROMPT = [
  "你是吉他伴奏老师。给定歌名,输出该歌的「弹唱和弦谱」,必须是一个 JSON 对象,结构严格如下:",
  '{"title":"歌名","lines":[{"segments":[{"chord":"和弦符号","lyric":"该句歌词"}]}]}',
  "要求:",
  "- 用标准和弦符号(如 C, G, Am, F, Dm, G7, Cmaj7, F#m, Bb)。",
  "- 选一个适合人声弹唱的调,和弦进行常见、好听、好弹。",
  "- 把歌词切成短句,每个 segment 是一句歌词配它该扫的和弦;每个 line 放 2-4 个 segment;整首约 8-24 个 segment。",
  "- lyric 用歌曲原文(中文或英文)。不确定确切歌词时,给出合理的、能跟着唱的近似分句。",
  "- 只输出上述 JSON,不要任何额外文字、解释或 markdown 代码块。",
].join("\n");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(res, code, type, body) {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
};

// 从「网易云链接 / 分享文本 / 歌名」解析出准确的 { title, artist }
async function resolveSong(input) {
  let text = input;
  // 163cn.tv 短链 → 跟随重定向拿到真实 URL
  const short = input.match(/https?:\/\/163cn\.tv\/[A-Za-z0-9]+/);
  if (short) {
    try {
      const r = await fetch(short[0], { headers: UA, redirect: "follow" });
      text += " " + r.url;
    } catch {
      /* 短链解析失败就忽略 */
    }
  }
  // 提取歌曲 id 并抓取页面标题
  const idm = text.match(/(?:song\/|song\?id=|[?&]id=)(\d+)/);
  if (idm) {
    try {
      const r = await fetch("https://music.163.com/song?id=" + idm[1], { headers: UA });
      const html = await r.text();
      const tm = html.match(/<title>([^<]*)<\/title>/);
      if (tm) {
        // 形如「歌名 - 歌手 - 单曲 - 网易云音乐」
        const parts = tm[1].replace(/\s*-\s*网易云音乐\s*$/, "").split(" - ");
        const title = (parts[0] || "").trim();
        const artist = (parts[1] || "").replace(/单曲$/, "").trim();
        if (title) return { title, artist };
      }
    } catch {
      /* 抓取失败,落到下面的兜底 */
    }
  }
  // 兜底:从分享文本里抠《歌名》与「分享X的单曲」
  const nameM = input.match(/《([^》]+)》/);
  const artistM = input.match(/分享\s*(.+?)\s*的(?:单曲|歌曲)/);
  if (nameM) return { title: nameM[1].trim(), artist: artistM ? artistM[1].trim() : "" };
  return { title: input.trim(), artist: "" };
}

async function handleChords(req, res, body) {
  if (!KEY) {
    send(res, 500, "application/json", JSON.stringify({ error: "服务器未设置 DEEPSEEK_API_KEY 环境变量" }));
    return;
  }
  let input;
  try { input = (JSON.parse(body || "{}").song || "").trim(); } catch { input = ""; }
  if (!input) { send(res, 400, "application/json", JSON.stringify({ error: "缺少歌名或链接" })); return; }

  try {
    const { title, artist } = await resolveSong(input);
    const display = artist ? `《${title}》 - ${artist}` : `《${title}》`;
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: "歌曲:" + display + "\n给出这首歌的弹唱和弦谱,只返回 JSON。" },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      send(res, 502, "application/json", JSON.stringify({ error: "DeepSeek " + r.status + ": " + JSON.stringify(data).slice(0, 300) }));
      return;
    }
    let content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "{}";
    // 用解析出的准确标题覆盖,保证显示与原曲一致
    try {
      const j = JSON.parse(content);
      if (j && j.lines) { j.title = display; content = JSON.stringify(j); }
    } catch {
      /* 解析失败就原样透传 */
    }
    send(res, 200, "application/json; charset=utf-8", content);
  } catch (e) {
    send(res, 500, "application/json", JSON.stringify({ error: String(e) }));
  }
}

const server = http.createServer((req, res) => {
  // 在公开版权曲库里搜歌 → 返回和弦谱
  if (req.method === "GET" && req.url.startsWith("/api/song")) {
    const q = new URL(req.url, "http://localhost").searchParams.get("q") || "";
    const hit = searchSong(q);
    if (hit) {
      send(res, 200, "application/json; charset=utf-8",
        JSON.stringify({ title: hit.title, artist: hit.artist, lines: hit.lines }));
    } else {
      send(res, 404, "application/json; charset=utf-8",
        JSON.stringify({ error: "没找到这首歌的公开版权谱(流行歌通常没有;可粘贴自定义谱)" }));
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/chords") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => handleChords(req, res, body));
    return;
  }
  // 静态文件
  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  const fp = path.join(DIR, decodeURIComponent(urlPath));
  if (!fp.startsWith(DIR)) { send(res, 403, "text/plain", "forbidden"); return; }
  fs.readFile(fp, (err, buf) => {
    if (err) { send(res, 404, "text/plain", "not found"); return; }
    send(res, 200, TYPES[path.extname(fp).toLowerCase()] || "application/octet-stream", buf);
  });
});

server.listen(PORT, () => {
  console.log(`KeyJam → http://localhost:${PORT}   (DeepSeek key: ${KEY ? "已配置 ✓" : "未配置 ✗ — 设 DEEPSEEK_API_KEY"})`);
});
