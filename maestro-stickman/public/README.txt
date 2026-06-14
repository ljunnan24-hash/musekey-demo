把 Rive 动画文件放到这里：

    public/maestro_stickman.riv

约定：
- Artboard:        Stickman
- State Machine:   StickmanMachine
- Numeric Input:   character_state  (0..7，见 src/logic/characterState.ts)

文件放好后执行 `npm run build`，Vite 会自动把它拷到 dist/ 根目录，
manifest.json 的 web_accessible_resources 已经声明它，内容脚本会自动加载。
（没有这个文件时，扩展会显示 SVG 占位小人，一切照常运行。）
