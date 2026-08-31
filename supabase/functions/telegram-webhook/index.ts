/**
 * Turns `/start <code>` in Telegram into a linked chat.
 *
 * Nobody should have to look up their own numeric chat id. An admin mints a
 * short-lived code in Vault, sends it to the bot, and this redeems it — the
 * chat id arrives in the update, so it never has to be typed.
 *
 * This is a public endpoint (Telegram calls it, unauthenticated), which forces
 * two things:
 *
 * - It is verified with the secret token Telegram echoes in
 *   `X-Telegram-Bot-Api-Secret-Token`. Without that, anyone who learns the URL
 *   can post fabricated updates and redeem codes they guessed.
 * - It uses the service-role key, because redeeming a code is exactly the
 *   operation no ordinary caller is allowed to perform. Everything it touches
 *   is scoped by the code itself.
 *
 * Deploy:
 *   supabase secrets set TELEGRAM_BOT_TOKEN=<from @BotFather>
 *   supabase secrets set TELEGRAM_WEBHOOK_SECRET=<any long random string>
 *   supabase functions deploy telegram-webhook --no-verify-jwt
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *     -d url="https://<project>.supabase.co/functions/v1/telegram-webhook" \
 *     -d secret_token="<TELEGRAM_WEBHOOK_SECRET>"
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id: number; title?: string; username?: string; type?: string };
  };
};

async function reply(botToken: string, chatId: number, text: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!botToken || !webhookSecret) {
    return new Response("not configured", { status: 503 });
  }

  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret) {
    // Deliberately terse: an attacker probing this learns only that it exists.
    return new Response("forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const chat = update.message?.chat;
  const text = update.message?.text?.trim() ?? "";
  // Telegram always expects 200: a non-2xx makes it retry the same update.
  if (!chat) return new Response("ok");

  const match = text.match(/^\/start(?:@\w+)?\s+(\S+)$/);
  if (!match) {
    // Only answer something that was actually addressed to the bot. In a
    // group the bot sees every message, and instructing the room each time
    // somebody speaks would make it unusable.
    const addressed = chat.type === "private" || /^\/start(?:@\w+)?\b/.test(text);
    if (addressed) {
      await reply(
        botToken,
        chat.id,
        "Send /start followed by the link code from Vault (Organisation → Alerts) to receive this organisation's excursion alerts here.",
      );
    }
    return new Response("ok");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const code = match[1];
  // Claim and link in one transaction. See redeem_telegram_link_code in
  // schema.sql: false means no live code matched, an error means the write
  // failed and the code has not been spent.
  const { data: linked, error } = await supabase.rpc("redeem_telegram_link_code", {
    link_code: code,
    chat: String(chat.id),
    chat_label: chat.title ?? chat.username ?? `chat ${chat.id}`,
  });

  if (error) {
    // A non-2xx asks Telegram to deliver this update again, and the code was
    // not spent, so the retry can still succeed. Stay silent: replying here
    // would send one failure message per attempt, and the user would see
    // those alongside the success when a retry finally works.
    console.error(`telegram-webhook: redeeming a code for chat ${chat.id} failed: ${error.message}`);
    return new Response("redeem failed", { status: 500 });
  }

  // An expired code is treated exactly like an unknown one, so the reply
  // cannot be used to confirm that a guessed code was once real.
  if (linked !== true) {
    await reply(botToken, chat.id, "That code is not valid, or it has expired. Mint a new one in Vault.");
    return new Response("ok");
  }

  // The link is persisted and the code is spent, so a failed confirmation is
  // not a reason to fail the webhook -- the retry would find the code gone
  // and tell the user it was invalid. Record it instead.
  const confirmed = await reply(
    botToken,
    chat.id,
    "Linked. Excursion alerts for this organisation will arrive here. Remove the link from Vault under Organisation → Alerts.",
  );
  if (!confirmed) {
    console.error(
      `telegram-webhook: linked chat ${chat.id}, but the confirmation message could not be delivered`,
    );
  }
  return new Response("ok");
});
