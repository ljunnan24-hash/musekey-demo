import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { copyFileSync, mkdirSync } from "node:fs";

// 相对当前模块的绝对路径（ESM 下没有 __dirname）
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Vite 会自动把 public/* 拷到 dist/；manifest.json 在仓库根，这里手动拷一份进 dist
function copyManifest() {
  return {
    name: "copy-manifest",
    closeBundle() {
      mkdirSync(here("./dist"), { recursive: true });
      copyFileSync(here("./manifest.json"), here("./dist/manifest.json"));
    },
  };
}

export default defineConfig({
  plugins: [react(), copyManifest()],
  build: {
    emptyOutDir: true,
    target: "es2020",
    // 内容脚本是单个 IIFE：把 React、Rive 运行时等所有依赖打进一个 content.js
    rollupOptions: {
      input: { content: here("./src/content/main.tsx") },
      output: {
        format: "iife",
        name: "MaestroStickman",
        entryFileNames: "content.js",
        inlineDynamicImports: true,
      },
    },
  },
});
