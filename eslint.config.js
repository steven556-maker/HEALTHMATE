import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "web/vendor", "node_modules", "test-results", "playwright-report", "**/.wrangler/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: globals.node } },
  { files: ["web/notify-sw.js"], languageOptions: { globals: globals.serviceworker } },
  { files: ["worker/src/**/*.js"], languageOptions: { globals: globals.serviceworker } },
);
