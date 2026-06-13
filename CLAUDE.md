# CLAUDE.md

给 AI 编码助手(和未来维护者)的**代码开发规范**。只讲怎么写代码、怎么跑、有哪些工程坑——不涉及产品方向(那些会变)。

---

## 代码库构成

- **`index.html`** —— 前端,单文件,纯浏览器,不引框架。UI + [Tone.js](https://tonejs.github.io/)(CDN)音频 + Canvas 视觉,逻辑写在内联 `<script>` 里。
- **`server.js`** —— 后端,零运行依赖的 Node(≥18,用内置 `http`/`fs` + 全局 `fetch`)。托管静态文件 + 提供 `POST /api/chords` 代理到外部 LLM(DeepSeek,OpenAI 兼容)。读 `.env`(自带零依赖解析)。

前后端交换的数据形状:
```json
{ "title": "…", "lines": [ { "segments": [ { "chord": "C", "lyric": "…" } ] } ] }
```

---

## 运行 / 命令

```bash
cp .env.example .env          # 在 .env 填 DEEPSEEK_API_KEY=sk-...
npm start                     # = node server.js → http://localhost:3000
npm run dev                   # node --watch,改完自动重启
npm run lint                  # ESLint(需先 npm install)
npm run format                # Prettier(需先 npm install)
```
- `npm start` **不需要** `npm install`(运行零依赖;devDependencies 只为 lint/format)。
- 必须经 **http://localhost:3000** 访问,不要 `file://` 直接开——前端要调 `/api/chords`。

---

## 项目结构

```
.
├── index.html        # 前端单文件
├── server.js         # Node 后端:静态托管 + /api/chords 代理
├── .env.example      # 环境变量样例(复制为 .env)
├── package.json      # 脚本与开发依赖
├── eslint.config.js  # ESLint 扁平配置
├── .prettierrc       # Prettier 规则
├── .editorconfig     # 编辑器统一
└── README.md
```

---

## 代码规范

- **格式**:Prettier —— 2 空格、双引号、分号、行宽 110。提交前 `npm run format`。
- **检查**:ESLint(`@eslint/js` recommended + Prettier 兼容),`npm run lint`。
- **命名**:小驼峰。
- **注释**:中文,解释"为什么"而非复述"是什么"。
- **风格一致**:贴合周围代码的缩进、命名、惯用法。
- **前端**:只用浏览器原生 API,不引框架/打包器/TypeScript。第三方库走 CDN `<script>`。
- **后端**:保持零运行依赖;只用 Node 内置模块 + 全局 `fetch`。
- **密钥**:任何 API key 只走服务端 `.env` / 环境变量,**严禁**出现在前端或提交进仓库(`.env` 已在 `.gitignore`)。
- **版权**:不要在代码里硬编流行歌的真实歌词(公共版权歌可以);版权内容应来自运行时的用户输入或外部 API,代码里只写管道。

---

## 工程坑(GOTCHAS)

1. **`Tone.Reverb` 会吞声**:乐器接到 Reverb 上,在它异步生成完脉冲响应前是**完全静音**的。
   → 发声乐器直连 `toDestination()`;要加混响就 `await reverb.ready`,或让干声并联直达输出。
2. **浏览器直连第三方 API 撞 CORS**:OpenAI/DeepSeek/Qwen 默认不允许网页直接调。
   → 凡是"调外部 API"的功能,一律走 `server.js` 后端代理,别在前端 `fetch` 第三方。
3. **结构化输出**:调 DeepSeek 用 `response_format: { type: "json_object" }`,且 system prompt 里必须出现 "JSON" 字样并写清结构,否则不保证可解析。
4. **`.env` 解析**:`server.js` 自己读 `.env`,不覆盖已存在的真实环境变量;没有 `.env` 时静默忽略。

---

## 开发流程

- **改完就跑**:每次改动后用 `npm start` / `npm run dev` 实测,别只看代码就断言"好了"。
- **小步、可回退**:一次推进一件事。
- **如实汇报**:测试失败就贴输出;跳过的步骤要说明;别假装跑过。
- **动大重构前先确认**(例:把 `index.html` 的 CSS/JS 拆成独立文件、引入构建工具),不要擅自破坏单文件前端的简单性。
