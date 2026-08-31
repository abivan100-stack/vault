# Vault's backend

Vault runs without any of this. With no credentials configured the console
works exactly as it always has: the simulation runs, the ledger is written and
verified, reports export, and everything lives in one browser's
`localStorage`. That is not a degraded mode — it is the default, and the app
says so on its face.

What a backend adds is the one thing the local chain could never give itself:

- **An anchor.** `ledger_entries` has INSERT and SELECT policies and no UPDATE
  or DELETE policy at all. Under row-level security an operation with no policy
  is refused, so once an entry is synced, nobody using an API key can edit or
  remove it — whatever they do to their browser's storage. The app's own
  documentation says a chain kept in unauthenticated local storage can be
  replaced wholesale. This is what stops that.
- **People.** Organisations, invitations, and four roles with real
  consequences.
- **Alerts.** A Telegram message when the corridor breaks.

---

## 1. Create a project

Any Supabase project will do, including the free tier. From the dashboard,
note the **Project URL** and the **anon public** key under Settings → API.

## 2. Apply the schema

Paste `schema.sql` into the SQL Editor and run it, or:

```bash
supabase link --project-ref <ref>
psql "$(supabase db url)" -f supabase/schema.sql
```

Not `supabase db push` — that applies files under `supabase/migrations`, and
this project keeps one declarative `schema.sql` instead. `db push` would
report success while creating nothing.

The file is guarded throughout, so running it twice is a no-op rather than an
error. It creates the tables, the role helpers, the sign-up trigger and every
policy. Read the comment at the top before changing anything in it: three of
the decisions in there are load-bearing.

## 3. Point the app at it

```bash
cp .env.example .env.local
```

then fill in:

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon public key>
```

Restart `npm run dev`. The header changes from **Local only** to a **Sign in**
link. Create an account, then create an organisation — you become its owner.

The anon key is meant to be public and is safe in the bundle: it grants
nothing that row-level security does not already allow. **The service-role key
must never go in a `VITE_` variable**, or in this repo at all.

## 4. Telegram alerts (optional)

### Make a bot

Message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the
prompts. It replies with a token that looks like `123456789:AA...`. That token
is the bot — treat it like a password.

### Deploy the functions

```bash
supabase secrets set TELEGRAM_BOT_TOKEN='123456789:AA...'
supabase secrets set TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 32)"

supabase functions deploy telegram-alert
supabase functions deploy telegram-webhook --no-verify-jwt
```

`telegram-alert` is called by the app with the signed-in user's JWT and reads
`telegram_links` under that user's own row-level security — a non-member reads
no rows and sends no messages. `telegram-webhook` is called by Telegram, so it
cannot verify a JWT; it is verified with the secret token instead, which is why
it needs `--no-verify-jwt` and why the secret must be a long random string.

### Register the webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d url="https://<ref>.supabase.co/functions/v1/telegram-webhook" \
  -d secret_token="<the TELEGRAM_WEBHOOK_SECRET you set>"
```

### Link a chat

In Vault, go to **Organisation → Excursion alerts**, mint a link code, and send
`/start <code>` to your bot from whichever chat should receive alerts — a
direct message, or a group the bot has been added to. The code is single-use
and expires in fifteen minutes.

If you would rather not run the webhook, paste a chat id directly in the same
panel. [@userinfobot](https://t.me/userinfobot) will tell you yours; group ids
are negative and usually start `-100`.

---

## Roles

| Role | Can |
| --- | --- |
| **Viewer** | Read the ledger, the monitor and the reports. Nothing else. |
| **Operator** | Everything a viewer can, plus open and edit shipments, record handoffs, resolve investigations, and sync this browser's entries. |
| **Admin** | Everything an operator can, plus invite and remove members, change roles, and manage alert destinations. |
| **Owner** | Everything, plus renaming and deleting the organisation. |

Two rules are enforced in the policies as well as in the UI, because either
one alone would be decorative:

- An admin cannot create an owner, and cannot change or remove one. Otherwise
  "admin" is a slower way of spelling "owner": promote a second account you
  control, and you have one.
- An invitation's role is applied by the database when the address signs up,
  never chosen by whoever accepts it.

`src/lib/roles.ts` is the client's copy of this table and exists only so the UI
can stop offering an action that would be refused. It is not the enforcement,
and `src/lib/roles.test.ts` pins it to the ranks in `schema.sql`.

## What syncs, and in which direction

Only one way: **browser → server**. There is no server-side sensor. The
readings are generated by the simulation, in a tab, so the browser is where
entries are made and the server's copy is an anchor rather than a source.

Entries are pushed by digest, and the table has `unique (org_id, hash)`, so a
repeated sync is a no-op rather than a duplicate. A row that comes back is put
through the same `isLedgerEntry` gate as anything read out of `localStorage`,
and the chain it forms is re-verified before anything calls it intact — being
harder to tamper with is not the same as being trusted unverified.

Excursion alerts are raised from the browser too, for the same reason.
Alerting from a database trigger would look more robust and would be an
illusion: with no browser open there are no readings, so there is nothing that
could have excursed and gone unreported.

## What this still does not prove

- The service-role key, and anyone with SQL access to the project, are outside
  every policy here. The append-only guarantee covers API callers, which is
  everybody using the app, and not the project's owner.
- Nothing is signed. A chain synced from a browser is a chain that browser
  composed, and the server takes its word for the contents.
- Verification remains structural. It says no retained entry was edited,
  removed or reordered. It says nothing about whether a reading was true.
