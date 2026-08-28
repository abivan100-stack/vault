import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase client, or null.
 *
 * Vault has always run entirely in the browser and it still does. The backend
 * is additive: with no credentials configured, `supabase` is null, every
 * call site takes its local-only path, and nothing about the console changes.
 * That is not a fallback bolted on afterwards — it is the reason the app can
 * be opened, demonstrated and audited without provisioning anything.
 *
 * The anon key is meant to be public. It grants nothing on its own: every
 * table is behind row-level security, and every policy resolves through the
 * caller's membership (see `supabase/schema.sql`). The keys that must never
 * reach a browser — the service role key, the Telegram bot token — live in
 * Edge Function secrets and appear nowhere in this bundle.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Whether both credentials are present and look like credentials.
 *
 * A half-configured `.env` — the URL filled in and the key left as a
 * placeholder — produces a client that fails every request with an opaque
 * error. Refusing to build one at all turns that into the honest state the UI
 * already knows how to show: not connected.
 */
export function isBackendConfigured(): boolean {
  if (typeof url !== "string" || typeof anonKey !== "string" || anonKey.length <= 20) {
    return false;
  }
  // A prefix test also accepts the bare string "http", which `createClient`
  // rejects by throwing while this module initialises -- the console would
  // fail to start rather than fall back to its local-only mode. Parse it.
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export const supabase: SupabaseClient | null = isBackendConfigured()
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The console is a single-page app with no OAuth redirect route, so
        // there is never a fragment for the client to try to interpret.
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * The message shown wherever a backend feature is offered but unavailable.
 *
 * One string rather than five, because the answer is always the same and the
 * fix is always the same.
 */
export const BACKEND_UNCONFIGURED_MESSAGE =
  "No backend is configured. Vault is running locally: the ledger lives in this browser only. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to connect one.";
