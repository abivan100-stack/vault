/**
 * Sends an organisation's excursion alert to Telegram.
 *
 * The bot token is the whole reason this runs on a server. It belongs to the
 * deployment, not to any member, and a token shipped to a browser is a token
 * anyone can use to impersonate the bot — so it lives here as a secret and the
 * client never sees it.
 *
 * Authorisation is not re-implemented. The caller's own JWT is forwarded to
 * PostgREST, so the read of `telegram_links` runs under that caller's RLS: a
 * user who is not a member of the organisation reads zero rows and no message
 * is sent. There is nothing to get wrong twice.
 *
 * Deploy:
 *   supabase secrets set TELEGRAM_BOT_TOKEN=<from @BotFather>
 *   supabase functions deploy telegram-alert
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

type AlertRequest = {
  orgId: string;
  /** Box id, so the message names the shipment rather than a uuid. */
  box: string;
  route: string;
  celsius: number;
  corridor: string;
  /** Ledger sequence and digest of the EXCURSION_OPEN entry. */
  sequence: number;
  hash: string;
  at: string;
  /** Chats a previous attempt already delivered to. */
  skipChatIds?: string[];
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/**
 * Telegram's MarkdownV2 reserves a long list of punctuation, and an unescaped
 * one is a 400 rather than a stray character. Escaping is cheaper than
 * discovering which of a shipment's fields contains a hyphen.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (match) => `\\${match}`);
}

function buildMessage(alert: AlertRequest): string {
  const when = new Date(alert.at).toISOString().replace("T", " ").slice(0, 19);
  return [
    `🚨 *Excursion* — ${escapeMarkdown(alert.box)}`,
    "",
    `Reading: *${escapeMarkdown(alert.celsius.toFixed(1))} °C* (corridor ${escapeMarkdown(alert.corridor)})`,
    `Route: ${escapeMarkdown(alert.route)}`,
    `Recorded: ${escapeMarkdown(when)} UTC`,
    `Ledger: entry \\#${alert.sequence} · \`${alert.hash.slice(0, 16)}\``,
    "",
    escapeMarkdown("An investigation is open until someone resolves it in Vault."),
  ].join("\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "POST only" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    // Configuration, not a client mistake — say so plainly rather than
    // returning a success the caller will read as "delivered".
    return json({ error: "TELEGRAM_BOT_TOKEN is not set on this project" }, 503);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "missing Authorization header" }, 401);

  let alert: AlertRequest;
  try {
    alert = await request.json();
  } catch {
    return json({ error: "body must be JSON" }, 400);
  }
  // Every field below is read by buildMessage. Checking only two of them
  // turned a malformed body into an unhandled 500 instead of a 400.
  if (
    typeof alert?.orgId !== "string" ||
    !alert.orgId ||
    typeof alert.celsius !== "number" ||
    !Number.isFinite(alert.celsius) ||
    typeof alert.box !== "string" ||
    typeof alert.route !== "string" ||
    typeof alert.corridor !== "string" ||
    typeof alert.hash !== "string" ||
    // It lands inside a MarkdownV2 code span, where a backtick or backslash
    // would break the message for every linked chat. A digest is hex.
    !/^[0-9a-f]{16,}$/i.test(alert.hash) ||
    typeof alert.sequence !== "number" ||
    // A ledger sequence starts at 1. Anything else -- a negative, 1e21 --
    // renders punctuation into MarkdownV2 and Telegram rejects the message
    // for every linked chat.
    !Number.isSafeInteger(alert.sequence) ||
    alert.sequence < 1 ||
    typeof alert.at !== "string" ||
    Number.isNaN(new Date(alert.at).getTime())
  ) {
    return json(
      {
        error:
          "orgId, box, route and corridor must be strings, hash a hex digest, sequence a positive integer, celsius a finite number, and at a parseable timestamp",
      },
      400,
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authorization } } },
  );

  const { data: user } = await supabase.auth.getUser();
  if (!user?.user) return json({ error: "not authenticated" }, 401);

  // Sending an alert is an operator action. Membership alone is not enough:
  // a viewer could otherwise spoof excursions or flood the linked chats.
  const { data: permitted, error: roleError } = await supabase.rpc("has_at_least", {
    target_org: alert.orgId,
    minimum: "operator",
  });
  if (roleError) return json({ error: roleError.message }, 400);
  if (permitted !== true) return json({ error: "operator role required" }, 403);

  // Under the caller's RLS: a non-member sees no rows and sends no messages.
  const { data: links, error } = await supabase
    .from("telegram_links")
    .select("chat_id")
    .eq("org_id", alert.orgId);

  if (error) return json({ error: error.message }, 400);
  if (!links || links.length === 0) return json({ sent: 0, attempted: 0, reason: "no linked chats" });

  // A retry names the chats that already received this alert. Sending to them
  // again is how one Telegram outage becomes two messages for every chat that
  // was working.
  const skip = new Set(
    Array.isArray(alert.skipChatIds)
      ? alert.skipChatIds.filter((id): id is string => typeof id === "string")
      : [],
  );
  const targets = links.filter((link) => !skip.has(String(link.chat_id)));
  const skipped = links.length - targets.length;
  if (targets.length === 0) {
    return json({
      sent: 0,
      attempted: 0,
      skipped,
      linked: links.length,
      reason: "every linked chat already received this alert",
    });
  }

  const text = buildMessage(alert);
  const results = await Promise.all(
    targets.map(async (link) => {
      // One chat's network failure must not reject the batch. The other
      // chats have already been written to, and a rejection here would
      // report nothing and invite a retry that delivers them twice.
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: link.chat_id,
            text,
            parse_mode: "MarkdownV2",
            disable_notification: false,
          }),
        });
        return { chatId: link.chat_id, ok: response.ok, status: response.status };
      } catch (cause) {
        return {
          chatId: link.chat_id,
          ok: false,
          status: 0,
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }),
  );

  const sent = results.filter((result) => result.ok).length;
  // A partial failure is reported rather than swallowed, and a total one is
  // not dressed up as success: there were chats to deliver to and none of
  // them received it, so a caller reading response.ok must see a failure.
  return json(
    { sent, attempted: results.length, skipped, linked: links.length, results },
    sent === 0 ? 502 : 200,
  );
});
