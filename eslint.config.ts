import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow `const { omitted, ...rest } = obj` to drop a key without a lint error.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
  {
    // Plain JS files in the repo are Node scripts and configs.
    files: ["**/*.{mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
    ],
  },
]);