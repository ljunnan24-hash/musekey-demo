/// <reference types="vite/client" />

// 内容脚本里把 CSS 当字符串内联注入页面（Vite 的 ?inline 查询）
declare module "*.css?inline" {
  const css: string;
  export default css;
}
