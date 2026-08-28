-- Vault — Supabase schema.
--
-- Run this once against a fresh project (SQL Editor, or `supabase db push`).
-- It is written to be re-runnable: every statement is guarded, so applying it
-- twice is a no-op rather than an error.
--
-- Three things drive the design.
--
-- 1. THE LEDGER IS APPEND-ONLY, AND HERE THAT IS ENFORCED RATHER THAN ASSUMED.
--    `ledger_entries` has INSERT and SELECT policies and deliberately has no
--    UPDATE or DELETE policy at all. With RLS enabled, an operation with no
--    policy is denied — so nobody holding an anon or authenticated key can
--    edit or remove an entry that has already been written, whatever they do
--    to their browser's storage. This is the server-side anchor the app's own
--    documentation says a local chain cannot have. It does NOT make the
--    browser copy authoritative, and it does not stop a project owner with the
--    service-role key or SQL access from doing as they please.
--
-- 2. MEMBERSHIP DECIDES EVERYTHING, AND IS READ THROUGH A SECURITY DEFINER
--    FUNCTION. A policy on `memberships` that selects from `memberships`
--    recurses forever; `public.role_in()` breaks that cycle by running as its
--    owner with RLS bypassed. It is the only place the role lookup happens.
--
-- 3. ROLES ARE ORDERED. owner > admin > operator > viewer, and
--    `public.has_at_least()` compares them, so a policy says what it means:
--    "operator or above" rather than a list of role names that has to be
--    updated in fifteen places when a role is added.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('viewer', 'operator', 'admin', 'owner');
  end if;
end
$$;

/**
 * Rank of a role, for "at least" comparisons.
 *
 * The enum's own ordering would work, but only as long as nobody ever inserts
 * a value in the middle of it. An explicit rank makes the ordering a decision
 * rather than a side effect of the declaration order.
 */
create or replace function public.role_rank(role public.org_role)
returns int
language sql
immutable
as $$
  select case role
    when 'viewer' then 1
    when 'operator' then 2
    when 'admin' then 3
    when 'owner' then 4
  end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete restrict
);

/**
 * One row per signed-up user. Auth lives in `auth.users`, which client code
 * cannot query; this is the readable half — the part a member list needs.
 */
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships (user_id);

/**
 * An invitation to an email address that may not have signed up yet.
 *
 * Membership needs a user id, and you cannot have one for somebody who has
 * never logged in. Invites hold the intent until they do; the trigger on
 * profile creation below redeems them.
 */
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'viewer',
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Redemption matches on lower(email), so uniqueness has to as well. A
-- case-sensitive constraint lets "Ada@example.com" and "ada@example.com" both
-- exist for one organisation, and the sign-up trigger then applies whichever
-- role it happens to read first and deletes both.
create unique index if not exists invites_org_email_idx
  on public.invites (org_id, lower(email));

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  log_id text not null,
  box text not null,
  product text not null,
  batch text not null,
  doses text not null,
  corridor text not null,
  route text not null,
  started_at timestamptz not null,
  handed_off_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  updated_at timestamptz not null default now()
);

create index if not exists shipments_org_idx on public.shipments (org_id, started_at desc);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  -- Restrict, not cascade. The ledger is the audit trail; deleting an
  -- organisation must not be a way to erase it. An organisation that still
  -- has entries cannot be deleted at all.
  org_id uuid not null references public.organisations (id) on delete restrict,
  shipment_id uuid references public.shipments (id) on delete set null,
  sequence integer not null check (sequence >= 1),
  event text not null,
  at timestamptz not null,
  detail text not null,
  prev_hash text not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- The digest commits to the entry's contents AND its predecessor, so within
  -- one organisation it is already unique. Making the database say so turns a
  -- re-sync into an idempotent no-op instead of a duplicate.
  unique (org_id, hash),
  -- One organisation, one chain. Two browsers each holding a local ledger
  -- would otherwise both sync an entry at sequence 4, and the server copy
  -- would fork: two entries claiming the same position, which no ordered
  -- chain can represent. The database refuses the second, and the client
  -- surfaces the refusal as a failed sync rather than a silent divergence.
  unique (org_id, sequence)
);

/*
 * An entry and the shipment it cites belong to the same organisation.
 *
 * The foreign key only proves the shipment exists somewhere. Without this an
 * operator could file an entry under their own organisation against another
 * tenant's shipment id, and the audit trail would cross a tenant boundary.
 */
create or replace function public.assert_ledger_shipment_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.shipment_id is not null
    and not exists (
      select 1
      from public.shipments
      where id = new.shipment_id and org_id = new.org_id
    )
  then
    raise exception 'a ledger entry and its shipment must share an organisation';
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_entries_shipment_org on public.ledger_entries;
create trigger ledger_entries_shipment_org
  before insert or update on public.ledger_entries
  for each row execute function public.assert_ledger_shipment_org();

create index if not exists ledger_entries_org_idx
  on public.ledger_entries (org_id, sequence desc);
-- Paste-a-digest lookup: the app searches by prefix, which needs a text
-- pattern index rather than the plain b-tree the unique constraint gives.
create index if not exists ledger_entries_hash_prefix_idx
  on public.ledger_entries (org_id, hash text_pattern_ops);

/**
 * Where an organisation's excursion alerts are delivered.
 *
 * A chat id, not a bot token: the token belongs to the deployment and lives in
 * the Edge Function's secrets, never in a table any member can read.
 */
create table if not exists public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  chat_id text not null,
  label text,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete restrict,
  unique (org_id, chat_id)
);

/**
 * Short-lived codes that connect a Telegram chat to an organisation.
 *
 * Nobody should have to find their numeric chat id by hand. An admin mints a
 * code here, sends `/start <code>` to the bot, and the webhook turns that into
 * a `telegram_links` row. The code is the secret, so it expires — a link code
 * that lives forever is a standing invitation to receive another
 * organisation's excursion alerts.
 */
create table if not exists public.telegram_link_codes (
  code text primary key,
  org_id uuid not null references public.organisations (id) on delete cascade,
  label text,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);

/*
 * Redeem a link code and create the link, or do neither.
 *
 * Splitting these across two round trips forced a choice between spending the
 * code before the link was certain, and leaving it live long enough for a
 * second chat to claim it. In one function they share a transaction: the
 * delete returns the row, and if the insert then fails the delete is rolled
 * back with it and the code is still good. Returns false when no live code
 * matched; raises when the write itself failed, so the caller can tell a bad
 * code from a broken database.
 */
create or replace function public.redeem_telegram_link_code(
  link_code text,
  chat text,
  chat_label text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  claimed public.telegram_link_codes;
begin
  delete from public.telegram_link_codes
  where code = link_code and expires_at > now()
  returning * into claimed;

  if claimed.code is null then
    return false;
  end if;

  insert into public.telegram_links (org_id, chat_id, label, created_by)
  values (claimed.org_id, chat, coalesce(claimed.label, chat_label), claimed.created_by)
  on conflict (org_id, chat_id) do update set label = excluded.label;

  return true;
end;
$$;

-- Only the webhook may call this, and it calls it with the service-role key.
-- Revoking without granting would make every redemption a permission error.
revoke all on function public.redeem_telegram_link_code(text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_telegram_link_code(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Membership helpers
--
-- SECURITY DEFINER and a pinned search_path: these run as the function owner
-- with RLS bypassed, which is exactly what breaks the memberships-policy
-- recursion, and exactly why they must not be able to resolve an unqualified
-- name to something an attacker planted on the search path.
-- ---------------------------------------------------------------------------

create or replace function public.role_in(target_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select role from public.memberships
  where org_id = target_org and user_id = auth.uid();
$$;

create or replace function public.has_at_least(target_org uuid, minimum public.org_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(
    public.role_rank(public.role_in(target_org)) >= public.role_rank(minimum),
    false
  );
$$;

/*
 * Does the organisation still have an owner other than this member? Security
 * definer, because a policy on `memberships` cannot itself read `memberships`
 * without recursing.
 */
create or replace function public.has_another_owner(target_org uuid, excluding uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.memberships
    where org_id = target_org
      and role = 'owner'
      and user_id <> excluding
  );
$$;

/** Every organisation the caller belongs to, in any role. */
create or replace function public.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Sign-up plumbing
-- ---------------------------------------------------------------------------

/**
 * Mirrors a new auth user into `profiles` and redeems any invitation waiting
 * on their email address.
 *
 * Redeeming here rather than in the client is what makes an invite
 * trustworthy: the client never gets to choose which organisation or which
 * role it lands in.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  -- Not every auth method supplies an address -- anonymous sign-in, phone
  -- OTP, some OAuth providers. This runs inside the auth.users insert, so a
  -- not-null violation here would roll the whole sign-up back.
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;

  -- Invites are deliberately NOT redeemed here. This fires when the account
  -- is created, which is before the address has been confirmed, so redeeming
  -- now would hand the role to whoever typed the address. accept_pending_
  -- invites() does it after sign-in, once the address is confirmed.
  return new;
end;
$$;

/*
 * Redeem invites for the caller.
 *
 * The trigger above only runs when an account is created, so an invite sent
 * to somebody who already has one would never have become a membership. The
 * client calls this after sign-in. It reads the address from the caller's own
 * JWT rather than an argument, so it cannot be used to claim somebody else's
 * invite, and it insists the address is confirmed.
 */
create or replace function public.accept_pending_invites()
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  confirmed timestamptz;
  redeemed integer;
begin
  if caller is null then
    return 0;
  end if;

  select email, email_confirmed_at into caller_email, confirmed
  from auth.users
  where id = caller;

  if caller_email is null or confirmed is null then
    return 0;
  end if;

  insert into public.memberships (org_id, user_id, role)
  select invite.org_id, caller, invite.role
  from public.invites as invite
  where lower(invite.email) = lower(caller_email)
  on conflict (org_id, user_id) do nothing;

  get diagnostics redeemed = row_count;

  delete from public.invites where lower(email) = lower(caller_email);

  return redeemed;
end;
$$;

revoke all on function public.accept_pending_invites() from public, anon;
grant execute on function public.accept_pending_invites() to authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/**
 * Creates an organisation and makes the caller its owner, in one transaction.
 *
 * Two statements from the client could not do this: the INSERT policy on
 * `memberships` requires the caller to already be an admin of the
 * organisation, and immediately after creating one they are nothing at all.
 */
create or replace function public.create_organisation(name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.organisations (name, created_by)
  values (name, auth.uid())
  returning id into new_id;

  insert into public.memberships (org_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.shipments enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.telegram_links enable row level security;

-- organisations ------------------------------------------------------------

drop policy if exists "read own organisations" on public.organisations;
create policy "read own organisations" on public.organisations
  for select to authenticated
  using (id in (select public.my_org_ids()));

drop policy if exists "owners rename" on public.organisations;
create policy "owners rename" on public.organisations
  for update to authenticated
  using (public.has_at_least(id, 'owner'))
  with check (public.has_at_least(id, 'owner'));

/*
 * An owner may delete an organisation that has no ledger.
 *
 * This policy grants the permission; the ledger's foreign key withholds it
 * once there is anything to keep. That reference is ON DELETE RESTRICT on
 * purpose -- the ledger is the audit trail, and deleting the organisation
 * must not be a way to erase it -- so an organisation that has recorded
 * anything cannot be deleted, and the attempt fails on the constraint rather
 * than quietly taking the evidence with it. Retiring such an organisation is
 * a rename, not a delete.
 */
drop policy if exists "owners delete" on public.organisations;
create policy "owners delete" on public.organisations
  for delete to authenticated
  using (public.has_at_least(id, 'owner'));

-- Creation goes through create_organisation(), never a direct insert.

-- profiles -----------------------------------------------------------------

drop policy if exists "read profiles of co-members" on public.profiles;
create policy "read profiles of co-members" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships as m
      where m.user_id = profiles.id and m.org_id in (select public.my_org_ids())
    )
  );

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- memberships --------------------------------------------------------------

drop policy if exists "read memberships of own organisations" on public.memberships;
create policy "read memberships of own organisations" on public.memberships
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

drop policy if exists "admins add members" on public.memberships;
create policy "admins add members" on public.memberships
  for insert to authenticated
  with check (
    public.has_at_least(org_id, 'admin')
    -- Adding somebody straight to owner would let an admin promote
    -- themselves through a second account, exactly as with invites.
    and (role <> 'owner' or public.has_at_least(org_id, 'owner'))
  );

/**
 * An admin can change roles, but cannot touch an owner and cannot mint one —
 * otherwise "admin" is just a slower way of spelling "owner". Both halves are
 * needed: USING guards the row as it stands, WITH CHECK guards what it becomes.
 */
drop policy if exists "admins change roles" on public.memberships;
create policy "admins change roles" on public.memberships
  for update to authenticated
  using (
    public.has_at_least(org_id, 'admin')
    and (role <> 'owner' or public.has_at_least(org_id, 'owner'))
    -- The last owner cannot be demoted, by themselves or anyone else. An
    -- ownerless organisation cannot appoint one, so it would be stranded.
    and (role <> 'owner' or public.has_another_owner(org_id, user_id))
  )
  with check (
    public.has_at_least(org_id, 'admin')
    and (role <> 'owner' or public.has_at_least(org_id, 'owner'))
  );

/*
 * The real last-owner guard.
 *
 * The policies below refuse the obvious cases, but two owners stepping down
 * at the same moment each see the other still in place, both pass, and the
 * organisation is left with none. Taking a row lock on the organisation
 * serialises membership changes within it, so the second transaction reads
 * the first one's result instead of a stale snapshot.
 */
create or replace function public.assert_owner_remains()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  target uuid := coalesce(old.org_id, new.org_id);
  org_present boolean;
  owners integer;
begin
  select true into org_present
  from public.organisations
  where id = target
  for update;

  -- The organisation itself is being deleted and these rows are going with
  -- it. That is a cascade, not a demotion.
  if org_present is null then
    return null;
  end if;

  select count(*) into owners
  from public.memberships
  where org_id = target and role = 'owner';

  if owners = 0 then
    raise exception 'an organisation must keep at least one owner';
  end if;

  return null;
end;
$$;

/*
 * A membership's organisation and subject are fixed when it is created.
 *
 * The update policy can test the row before and after, but not that a column
 * survived unchanged -- an admin could otherwise repoint a membership at
 * another organisation or another user, which is a way of granting access
 * that never passes through the invite path.
 */
create or replace function public.pin_membership_identity()
returns trigger
language plpgsql
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'memberships.org_id cannot be changed';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'memberships.user_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_pin_identity on public.memberships;
create trigger memberships_pin_identity
  before update on public.memberships
  for each row execute function public.pin_membership_identity();

drop trigger if exists memberships_keep_an_owner on public.memberships;
create trigger memberships_keep_an_owner
  after update or delete on public.memberships
  for each row execute function public.assert_owner_remains();

drop policy if exists "admins remove members, anyone may leave" on public.memberships;
create policy "admins remove members, anyone may leave" on public.memberships
  for delete to authenticated
  using (
    -- The last owner may not leave, and may not be removed. An organisation
    -- without an owner cannot promote one, so it would be stranded.
    (role <> 'owner' or public.has_another_owner(org_id, user_id))
    and (
      user_id = auth.uid()
      or (
        public.has_at_least(org_id, 'admin')
        and (role <> 'owner' or public.has_at_least(org_id, 'owner'))
      )
    )
  );

-- invites ------------------------------------------------------------------

drop policy if exists "admins read invites" on public.invites;
create policy "admins read invites" on public.invites
  for select to authenticated
  using (public.has_at_least(org_id, 'admin'));

drop policy if exists "admins send invites" on public.invites;
create policy "admins send invites" on public.invites
  for insert to authenticated
  with check (
    public.has_at_least(org_id, 'admin')
    and invited_by = auth.uid()
    -- Inviting somebody straight to owner would let an admin promote
    -- themselves via a second account.
    and (role <> 'owner' or public.has_at_least(org_id, 'owner'))
  );

drop policy if exists "admins withdraw invites" on public.invites;
create policy "admins withdraw invites" on public.invites
  for delete to authenticated
  using (public.has_at_least(org_id, 'admin'));

-- shipments ----------------------------------------------------------------

drop policy if exists "members read shipments" on public.shipments;
create policy "members read shipments" on public.shipments
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

drop policy if exists "operators open shipments" on public.shipments;
create policy "operators open shipments" on public.shipments
  for insert to authenticated
  with check (public.has_at_least(org_id, 'operator') and created_by = auth.uid());

drop policy if exists "operators update shipments" on public.shipments;
create policy "operators update shipments" on public.shipments
  for update to authenticated
  using (public.has_at_least(org_id, 'operator'))
  with check (public.has_at_least(org_id, 'operator'));

/*
 * A policy can test the row before and the row after, but not that a column
 * survived the update unchanged. An operator who belongs to two
 * organisations passes both halves while moving a shipment between them, so
 * the invariant lives in a trigger instead.
 */
create or replace function public.pin_shipment_identity()
returns trigger
language plpgsql
as $$
begin
  if new.org_id is distinct from old.org_id then
    raise exception 'shipments.org_id cannot be changed';
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'shipments.created_by cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_pin_identity on public.shipments;
create trigger shipments_pin_identity
  before update on public.shipments
  for each row execute function public.pin_shipment_identity();

-- Shipments are not deletable by anyone: the ledger refers to them, and an
-- audit trail pointing at a record that has been removed is not a trail.

-- ledger_entries -----------------------------------------------------------

drop policy if exists "members read the ledger" on public.ledger_entries;
create policy "members read the ledger" on public.ledger_entries
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

drop policy if exists "operators append to the ledger" on public.ledger_entries;
create policy "operators append to the ledger" on public.ledger_entries
  for insert to authenticated
  with check (public.has_at_least(org_id, 'operator') and created_by = auth.uid());

-- NO update policy and NO delete policy, on purpose. See the note at the top
-- of this file: with RLS on, an operation without a policy is refused, and
-- that refusal is what makes this table append-only for every API caller.

-- telegram_links -----------------------------------------------------------

drop policy if exists "members read alert targets" on public.telegram_links;
create policy "members read alert targets" on public.telegram_links
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

drop policy if exists "admins manage alert targets" on public.telegram_links;
create policy "admins manage alert targets" on public.telegram_links
  for insert to authenticated
  with check (public.has_at_least(org_id, 'admin') and created_by = auth.uid());

drop policy if exists "admins remove alert targets" on public.telegram_links;
create policy "admins remove alert targets" on public.telegram_links
  for delete to authenticated
  using (public.has_at_least(org_id, 'admin'));

-- telegram_link_codes ------------------------------------------------------

alter table public.telegram_link_codes enable row level security;

drop policy if exists "admins mint link codes" on public.telegram_link_codes;
create policy "admins mint link codes" on public.telegram_link_codes
  for insert to authenticated
  with check (public.has_at_least(org_id, 'admin') and created_by = auth.uid());

drop policy if exists "admins read their own link codes" on public.telegram_link_codes;
create policy "admins read their own link codes" on public.telegram_link_codes
  for select to authenticated
  using (created_by = auth.uid() and public.has_at_least(org_id, 'admin'));

drop policy if exists "admins revoke link codes" on public.telegram_link_codes;
create policy "admins revoke link codes" on public.telegram_link_codes
  for delete to authenticated
  using (public.has_at_least(org_id, 'admin'));

-- The webhook redeems codes with the service-role key, which bypasses RLS.
-- No policy grants redemption to an ordinary caller, so a member cannot claim
-- somebody else's code by reading it back out of the table.

-- ---------------------------------------------------------------------------
-- Convenience views
-- ---------------------------------------------------------------------------

/**
 * The member list, with the profile joined on.
 *
 * security_invoker means the view is read under the caller's own RLS rather
 * than the definer's — without it this would hand every member list to
 * everybody.
 */
create or replace view public.org_members
with (security_invoker = true) as
  select
    m.org_id,
    m.user_id,
    m.role,
    m.created_at,
    p.email,
    p.display_name
  from public.memberships as m
  join public.profiles as p on p.id = m.user_id;
