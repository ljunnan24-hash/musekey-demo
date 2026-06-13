# KeyJam · 笔记本就是吉他

把笔记本变成一把「自动挡吉他」—— **键盘就是扫弦**。

载入一首你自己拥有的歌,系统自动按小节把它切段,你**每按一下键 = 弹出一段**,用敲击的节奏去"演奏"这首歌的律动。可选**去人声**得到伴奏轨,方便跟唱。

> 完整产品需求见 [docs/PRD.md](docs/PRD.md);开发规范见 [CLAUDE.md](CLAUDE.md)。

## 运行

需要 Node 18+(自带 `fetch`)。**运行无第三方依赖**(devDependencies 仅供 lint/format)。

```bash
npm start          # = node server.js,打开 http://localhost:3000
npm run dev        # node --watch,改完自动重启
```

音频段模式**不需要任何 API key**;`.env` / DeepSeek 仅供仓库里闲置的"和弦实验接口",可忽略。

## 玩法

1. 点击开始 → **载入音频**(上传 / 拖入)或点 **示例曲**
2. 立体声文件可开 **「去人声」**(中置消除,得到粗略伴奏)
3. **按空格 / 任意字母键 / 点 SPACE 键帽** → 每下弹一段;`BPM ±` 微调切段,`SEG` 看进度

## 技术

- **前端** `index.html`:单文件,纯 Web Audio(解码 / 中置消除去人声 / 按段播放)+ Canvas(吉他弦背景 + 波形条)+ [`web-audio-beat-detector`](https://github.com/chrisguttandin/web-audio-beat-detector)(CDN)估 BPM。音频只在本地浏览器处理,不上传。
- **后端** `server.js`:零依赖 Node,静态托管。另有**闲置接口**:`/api/song`(公共版权曲库)、`/api/chords`(DeepSeek 和弦实验)。
- **资源**:`assets/demo-loop.wav`(`scripts/make-demo.js` 合成的原创免版税示例曲)、`assets/songs.json`(公共版权曲库)。

## 项目结构

```
.
├── index.html        # 前端单文件:UI + Web Audio + Canvas
├── server.js         # Node 后端:静态托管 + 闲置接口
├── assets/           # demo-loop.wav(原创示例) / songs.json(公共版权曲库)
├── scripts/          # make-demo.js(合成示例曲)
├── docs/PRD.md       # 产品需求文档
├── package.json · eslint.config.js · .prettierrc · .editorconfig · .env.example
└── CLAUDE.md · README.md
```

## 开发规范

- **格式化**:Prettier(2 空格、双引号、分号、行宽 110)。提交前 `npm run format`。
- **静态检查**:ESLint(`@eslint/js` recommended + Prettier 兼容)。`npm run lint`。
- **风格**:中文注释说明"为什么";前端纯浏览器 API,不引框架;后端零运行依赖。
- **密钥**:任何 key 只走服务端 `.env` / 环境变量,严禁写进前端或提交仓库。
- 启用 lint/format 需先 `npm install`(运行 `npm start` 不需要)。

## 版权

只用**用户合法拥有的音频**做本地处理;不抓取/下载/解密受版权保护的音乐,不爬谱站、不复现版权歌词。和弦数据仅来自公共版权曲库或用户粘贴。

## 路线图

- [x] 音频段触发(自动按小节切段 + 按键弹段)
- [x] 浏览器内去人声(中置消除)
- [x] 乐器风 UI(吉他弦 + 实体键帽)+ 原创示例曲
- [ ] 高质量人声分离(后端 Demucs/Spleeter 或付费 API)
- [ ] 手动打点分段 · 保存 / 分享创作
- [ ] 悬浮插件形态:边打字边演奏,角落辉光小宠物陪你工作

---
hackathon demo
