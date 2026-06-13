# KeyJam · 打字即作曲

把键盘变成乐器 —— **你不可能弹错**。

随便敲字母键就能出旋律:每个音都被锁进 C 大调五声音阶、吸附到 16 分音符,背景跑着 lo-fi 和弦与鼓点,所以**乱敲也不跑调、不脱拍**。目标是把做音乐的门槛降到最低:你只要有审美,就能慢慢做出自己的曲子。

一把「自动挡吉他 + 卡拉OK」:选一首想唱的歌,系统给出和弦谱,你**单键扫弦**(空格/任意字母键/点扫弦钮),每扫一下前进一个和弦、永远弹出正确的和弦,跟着歌词边弹边唱。

## 运行
需要 Node 18+(自带 `fetch`)。运行本身**无第三方依赖**(devDependencies 仅供 lint/format)。

```bash
cp .env.example .env      # 然后在 .env 里填 DEEPSEEK_API_KEY
npm start                 # = node server.js,打开 http://localhost:3000
```

也可以不写 `.env`,临时用环境变量:`DEEPSEEK_API_KEY=sk-xxx npm start`。
不设 key 也能跑——只是 AI 导入不可用,默认精校曲《小星星》照常弹唱。

开发时用 `npm run dev`(`node --watch`,改完自动重启)。

## 玩法
- 点击开始 → 跟着高亮的和弦,按 **空格** 扫弦,开口唱
- 输入框打歌名 → **AI 生成和弦**(后端转发 DeepSeek)→ 自动载入新歌

## 技术
- 前端:单文件 `index.html` + [Tone.js](https://tonejs.github.io/)(CDN);通用和弦解析器(任意和弦名→音);Canvas 极光 + 扫弦辉光
- 后端:`server.js` 零依赖 Node,托管页面 + `/api/chords` 转发 DeepSeek(OpenAI 兼容,`response_format: json_object`),key 只在服务端

## 项目结构
```
.
├── index.html        # 前端单文件:UI + Tone.js 音频 + Canvas 视觉 + 和弦解析
├── server.js         # Node 后端:静态托管 + /api/chords → DeepSeek
├── .env.example      # 环境变量样例(复制为 .env)
├── package.json      # 脚本与开发依赖
├── eslint.config.js  # ESLint 扁平配置
├── .prettierrc       # Prettier 规则
├── .editorconfig     # 编辑器统一(缩进/换行/编码)
└── README.md
```

## 开发规范
- **格式化**:Prettier(2 空格、双引号、分号、行宽 110)。提交前 `npm run format`。
- **静态检查**:ESLint(`@eslint/js` recommended + Prettier 兼容)。`npm run lint`。
- **风格**:中文注释说明"为什么",命名用小驼峰;前端纯浏览器 API,不引框架。
- **密钥**:任何 key 只走服务端环境变量 / `.env`,严禁写进前端或提交仓库。
- 启用 lint/format 需先 `npm install`(仅装开发依赖;运行 `npm start` 不需要)。

## 路线图
- [x] 单键扫弦弹唱 + 歌词/和弦卡拉OK高亮
- [x] 通用和弦解析(任意调/任意和弦)
- [x] AI 导入(后端 → DeepSeek 出和弦谱)
- [ ] 保存 + 分享创作
- [ ] 悬浮插件形态:边打字边演奏,角落的辉光小宠物陪你工作

---
hackathon demo
