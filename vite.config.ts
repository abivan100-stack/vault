import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src"),
    },
  },
  test: {
    // Scoped to this project's source. Without an explicit include, vitest
    // walks the whole tree and picks up the test files of any sibling git
    // worktree checked out under .claude/, reporting their results as ours.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**"],
  },
});
