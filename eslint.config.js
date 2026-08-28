import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    // Flat-config ignore patterns are path globs: a bare "dist" matches only the
    // root one, so a nested build output (a git worktree under .claude, a
    // vendored package) would get linted as source.
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", ".claude/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // shadcn/ui primitives are generated and export their cva variants
    // alongside the component; a context module must export its provider and
    // its hook together. Both are known false positives for this rule.
    files: ["src/components/ui/**/*.tsx", "src/context/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["server/**/*.mjs"],
    languageOptions: {
      globals: { Buffer: "readonly", console: "readonly", fetch: "readonly", process: "readonly", URL: "readonly" },
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-console": "off" },
  },
);
