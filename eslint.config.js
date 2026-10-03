// ESLint flat config. Import boundaries (X-03): agent has no signing, credential, log or rail code (I4);
// verifier reaches core only through @wally/core/verify plus type imports; harness uses package exports.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const RULE = "@typescript-eslint/no-restricted-imports";
const NO_DEEP = { regex: "^@wally/[^/]+/src(/|$)", message: "Import @wally packages through their exports map, not src/." };
const NO_RELATIVE_PACKAGES = {
  regex: "(^|/)(packages|apps)/|^(\\.\\./)+(core|rail-sim|agent|harness|web|verifier)(/|$)",
  message: "Do not reach into another package by relative path; import it by package name.",
};
const I4 = "packages/agent must not import rail-sim, signing, credential, log or orchestrator code (I4).";
const AGENT_PATTERNS = [
  NO_DEEP,
  NO_RELATIVE_PACKAGES,
  { regex: "^@wally/rail-sim(/.*)?$", message: I4 },
  { regex: "^@wally/core/(crypto|vc|log|orchestrator|verify)(/.*)?$", message: I4 },
  { regex: "(^|/)rail-sim(/|$)", message: I4 },
];
const AGENT_SRC_PATTERNS = [
  ...AGENT_PATTERNS,
  { regex: "^@wally/core/testing(/.*)?$", message: "Fakes are for tests; agent src must not import @wally/core/testing." },
];
const VERIFIER_PATTERNS = [
  NO_DEEP,
  NO_RELATIVE_PACKAGES,
  {
    regex: "^@wally/(?!core/(verify|generated|ports)$)",
    message: "apps/verifier may import only @wally/core/verify (and types from generated or ports).",
  },
  { regex: "^@wally/core/(generated|ports)$", allowTypeImports: true, message: "apps/verifier may import these as types only." },
];

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-pages/**",
      "**/coverage/**",
      "packages/core/src/generated/schemas.ts",
      "services/**",
      ".worktrees/**",
      ".data/**",
      // Capacitor shells (apps/mobile): generated native projects and the web copy they ship.
      "apps/mobile/ios/**",
      "apps/mobile/android/**",
      "apps/mobile/www/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-explicit-any": "error",
      [RULE]: ["error", { patterns: [NO_DEEP] }],
    },
  },
  { files: ["apps/*/src/**", "apps/mobile/native/**"], languageOptions: { globals: { ...globals.browser } } },
  { files: ["packages/agent/**/*.{ts,tsx}"], rules: { [RULE]: ["error", { patterns: AGENT_PATTERNS }] } },
  { files: ["packages/agent/src/**/*.{ts,tsx}"], rules: { [RULE]: ["error", { patterns: AGENT_SRC_PATTERNS }] } },
  { files: ["apps/verifier/**/*.{ts,tsx}"], rules: { [RULE]: ["error", { patterns: VERIFIER_PATTERNS }] } },
  { files: ["packages/harness/**/*.{ts,tsx}"], rules: { [RULE]: ["error", { patterns: [NO_DEEP, NO_RELATIVE_PACKAGES] }] } },
);
