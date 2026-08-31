import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Refuse to build with a service-role key in the anon slot.
 *
 * A `VITE_` value is substituted into the bundle at build time, so by the
 * time any runtime check sees it the key is already in a file anybody can
 * read. Detecting it in the app is a useful warning and nothing more -- this
 * is the only place the mistake can still be prevented rather than reported.
 */
function refuseServiceRoleKey(mode: string): void {
  const key = loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_ANON_KEY;
  const payload = key?.split(".")[1];
  if (!payload) return;
  try {
    const decoded = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    if (JSON.parse(decoded)?.role !== "service_role") return;
  } catch {
    return;
  }
  throw new Error(
    "VITE_SUPABASE_ANON_KEY holds a service-role key. It bypasses every row-level-security policy and would be embedded in the bundle. Replace it with the anon public key, and rotate the one that was exposed.",
  );
}

export default defineConfig(({ mode }) => {
  refuseServiceRoleKey(mode);
  return {
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
  };
});
