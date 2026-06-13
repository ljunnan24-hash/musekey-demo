"use strict";

const js = require("@eslint/js");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

module.exports = [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  prettier,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      // Node 内置 + 浏览器全局(含 Math/Promise/Float32Array 等 ES 内置)
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
