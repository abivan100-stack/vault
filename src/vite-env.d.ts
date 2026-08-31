/// <reference types="vite/client" />

/**
 * The build-time configuration Vault reads.
 *
 * Declared explicitly rather than left to `vite/client`'s index signature, so
 * a typo in a variable name is a compile error instead of `undefined` at
 * runtime — which, for a URL, means a client that fails every request.
 *
 * Both are optional: with neither set, the app runs entirely in the browser
 * exactly as it always has. See `src/lib/supabase.ts`.
 */
interface ImportMetaEnv {
  /** e.g. `https://<project>.supabase.co`. */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * The anon key, which is meant to be public: it grants nothing that
   * row-level security does not already allow. The service-role key must
   * never appear here.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
