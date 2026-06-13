"use strict";

const js = require("@eslint/js");
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
      globals: {
        process: "readonly",
        require: "readonly",
        module: "writable",
        __dirname: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        Buffer: "readonly",
        URL: "readonly",
      },
    },
  },
];
