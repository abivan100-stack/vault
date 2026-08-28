import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseRole, type OrgRole } from "@/lib/roles";

/**
 * The organisation's people and alert destinations.
 *
 * Every mutation here returns `string | null` — a message, or nothing — rather
 * than throwing or returning a boolean. The caller always has something to
 * show, and the failure that matters most is the one row-level security
 * produces when a member tries something their role does not allow: it comes
 * back as an ordinary error, and it should be readable, not a stack trace.
 *
 * Nothing in this file is the authority on who may do what. The policies in
 * `supabase/schema.sql` are; `src/lib/roles.ts` is the UI's copy of them, used
 * to stop offering an action that would be refused. This layer only carries
 * requests.
 */

export type Member = {
  userId: string;
  email: string;
  displayName: string | null;
  role: OrgRole;
};

export type Invite = {
  id: string;
  email: string;
  role: OrgRole;
};

export type TelegramLink = {
  id: string;
  chatId: string;
  label: string | null;
};

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Something went wrong. Try again.";
}

/** A code short enough to type into Telegram, random enough not to guess. */
function linkCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type OrganisationAdmin = {
  members: Member[];
  invites: Invite[];
  telegramLinks: TelegramLink[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** The linked-chat read was refused, so an empty list is not an answer. */
  telegramUnavailable: boolean;
  /** The invite read was refused, so an empty list is not an answer either. */
  invitesUnavailable: boolean;
  invite: (email: string, role: OrgRole) => Promise<string | null>;
  withdrawInvite: (id: string) => Promise<string | null>;
  changeRole: (userId: string, role: OrgRole) => Promise<string | null>;
  removeMember: (userId: string) => Promise<string | null>;
  addTelegramChat: (chatId: string, label: string) => Promise<string | null>;
  removeTelegramChat: (id: string) => Promise<string | null>;
  /** Mints a `/start` code for the bot, or returns null if it could not. */
  mintTelegramCode: (label: string) => Promise<string | null>;
};

type OrganisationSnapshot = {
  members: Member[];
  invites: Invite[];
  telegramLinks: TelegramLink[];
  error: string | null;
  /** The read was refused, so an empty list says nothing about the truth. */
  invitesUnavailable: boolean;
  telegramUnavailable: boolean;
};

const EMPTY_SNAPSHOT: OrganisationSnapshot = {
  members: [],
  invites: [],
  telegramLinks: [],
  error: null,
  invitesUnavailable: false,
  telegramUnavailable: false,
};

/**
 * Reads everything the page shows, in one pass. Pure I/O — no React state.
 *
 * The three reads are independent so that one being refused does not blank
 * the other two: a viewer cannot read `invites` by policy, and that must not
 * cost them the member list they are entitled to see.
 */
async function fetchOrganisation(orgId: string | null): Promise<OrganisationSnapshot> {
  if (!supabase || !orgId) return EMPTY_SNAPSHOT;

  const [memberResult, inviteResult, telegramResult] = await Promise.all([
    supabase.from("org_members").select("user_id, role, email, display_name").eq("org_id", orgId),
    supabase.from("invites").select("id, email, role").eq("org_id", orgId),
    supabase.from("telegram_links").select("id, chat_id, label").eq("org_id", orgId),
  ]);

  // Every query's failure is reported, not just the members'. A failed
  // Telegram read used to render as "No chat is linked", which is a
  // statement about the organisation rather than about the request.
  // Only a failed member read hides the page. A viewer whose invites query
  // is refused by policy still may -- and should -- see the member list;
  // treating any failure as fatal took that away from them.
  for (const [name, result] of [
    ["invites", inviteResult],
    ["telegram links", telegramResult],
  ] as const) {
    if (result.error) console.error(`reading ${name} failed: ${errorMessage(result.error)}`);
  }

  return {
    // Reported separately from `error`, which hides the page. A viewer whose
    // invites query is refused should still see the members they may read --
    // but the alerts card must not answer "nobody is linked" when the truth
    // is that nobody could read the list.
    invitesUnavailable: Boolean(inviteResult.error),
    telegramUnavailable: Boolean(telegramResult.error),
    error: memberResult.error ? errorMessage(memberResult.error) : null,
    members: memberResult.error
      ? []
      : (memberResult.data ?? []).map((row) => ({
          userId: String(row.user_id),
          email: String(row.email ?? ""),
          displayName: row.display_name === null ? null : String(row.display_name),
          role: parseRole(row.role),
        })),
    invites: inviteResult.error
      ? []
      : (inviteResult.data ?? []).map((row) => ({
          id: String(row.id),
          email: String(row.email),
          role: parseRole(row.role),
        })),
    telegramLinks: telegramResult.error
      ? []
      : (telegramResult.data ?? []).map((row) => ({
          id: String(row.id),
          chatId: String(row.chat_id),
          label: row.label === null ? null : String(row.label),
        })),
  };
}

export function useOrganisationAdmin(orgId: string | null): OrganisationAdmin {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [telegramUnavailable, setTelegramUnavailable] = useState(false);
  const [invitesUnavailable, setInvitesUnavailable] = useState(false);
  // Starts true: the first read is already in flight when the page mounts,
  // and an empty member list captioned "no members" would be a lie for as
  // long as it takes to answer.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Switching the active organisation re-runs the fetch effect below with a
  // new orgId, but `loading` was never reset to true for it -- the page kept
  // rendering the PREVIOUS org's members/invites/telegramLinks as though they
  // were the new org's real result, because the "loading" gate only checked
  // whether the very first fetch had ever finished. This is React's
  // documented pattern for resetting state when a prop changes ("adjusting
  // state during rendering"), rather than a setState call inside the effect
  // body, which would trigger an extra render for every fetch.
  const [orgIdForLoading, setOrgIdForLoading] = useState(orgId);
  if (orgId !== orgIdForLoading) {
    setOrgIdForLoading(orgId);
    setLoading(true);
    // Cleared as well as flagged. Leaving the lists in place showed one
    // organisation's members, invites and linked chats under another
    // organisation's name until the new read landed -- and a page that
    // renders before checking `loading` showed exactly that.
    setMembers([]);
    setInvites([]);
    setTelegramLinks([]);
    setTelegramUnavailable(false);
    setInvitesUnavailable(false);
    setError(null);
  }

  // The organisation a read was started for. A refresh from organisation A
  // must not apply its answer over organisation B after a switch.
  const refreshFor = useRef(orgId);
  useEffect(() => {
    refreshFor.current = orgId;
  }, [orgId]);

  const refresh = useCallback(async () => {
    // Everything is applied in one pass after the reads settle, so this never
    // sets state synchronously and the effect below can simply call it. It
    // also means the page never renders a half-updated organisation.
    let snapshot: OrganisationSnapshot;
    try {
      snapshot = await fetchOrganisation(orgId);
    } catch (cause) {
      // A rejection is not a snapshot, and leaving it uncaught left the page
      // loading for good. Scoped like the success path: this failure belongs
      // to the organisation that was selected when the read started.
      if (refreshFor.current !== orgId) return;
      setError(cause instanceof Error ? cause.message : "Could not load this organisation.");
      setLoading(false);
      return;
    }
    // The organisation may have changed while these reads were out; this
    // answer describes the previous one and must not overwrite the new.
    if (refreshFor.current !== orgId) return;
    setMembers(snapshot.members);
    setInvites(snapshot.invites);
    setTelegramLinks(snapshot.telegramLinks);
    setError(snapshot.error);
    setTelegramUnavailable(snapshot.telegramUnavailable);
    setInvitesUnavailable(snapshot.invitesUnavailable);
    setLoading(false);
  }, [orgId]);

  // Same shape as the effect in AuthContext, and for the same reason: the
  // snapshot arrives asynchronously from an external system, so it is
  // applied in the promise's callback. `refresh` is for the explicit
  // reloads after a mutation, which are event handlers rather than effects.
  useEffect(() => {
    let cancelled = false;
    fetchOrganisation(orgId)
      .then((snapshot) => {
        if (cancelled) return;
        setMembers(snapshot.members);
        setInvites(snapshot.invites);
        setTelegramLinks(snapshot.telegramLinks);
        setError(snapshot.error);
        setTelegramUnavailable(snapshot.telegramUnavailable);
        setInvitesUnavailable(snapshot.invitesUnavailable);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        // A transport rejection is not a snapshot. Without this it was an
        // unhandled rejection and the page stayed on its loading state for
        // good.
        if (cancelled) return;
        setMembers([]);
        setInvites([]);
        setTelegramLinks([]);
        setError(cause instanceof Error ? cause.message : "Could not load this organisation.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const currentUserId = useCallback(async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }, []);

  const invite = useCallback(
    async (email: string, role: OrgRole) => {
      if (!supabase || !orgId) return "No backend is configured.";
      const trimmed = email.trim().toLowerCase();
      if (!trimmed.includes("@")) return "That does not look like an email address.";

      const userId = await currentUserId();
      if (!userId) return "You are not signed in.";

      const { error: insertError } = await supabase
        .from("invites")
        .insert({ org_id: orgId, email: trimmed, role, invited_by: userId });
      if (insertError) return errorMessage(insertError);

      await refresh();
      return null;
    },
    [orgId, refresh, currentUserId],
  );

  const withdrawInvite = useCallback(
    async (id: string) => {
      if (!supabase) return "No backend is configured.";
      const { error: deleteError } = await supabase.from("invites").delete().eq("id", id);
      if (deleteError) return errorMessage(deleteError);
      await refresh();
      return null;
    },
    [refresh],
  );

  const changeRole = useCallback(
    async (userId: string, role: OrgRole) => {
      if (!supabase || !orgId) return "No backend is configured.";
      const { error: updateError } = await supabase
        .from("memberships")
        .update({ role })
        .eq("org_id", orgId)
        .eq("user_id", userId);
      if (updateError) return errorMessage(updateError);
      await refresh();
      return null;
    },
    [orgId, refresh],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!supabase || !orgId) return "No backend is configured.";
      const { error: deleteError } = await supabase
        .from("memberships")
        .delete()
        .eq("org_id", orgId)
        .eq("user_id", userId);
      if (deleteError) return errorMessage(deleteError);
      await refresh();
      return null;
    },
    [orgId, refresh],
  );

  const addTelegramChat = useCallback(
    async (chatId: string, label: string) => {
      if (!supabase || !orgId) return "No backend is configured.";
      const trimmed = chatId.trim();
      // Telegram chat ids are integers, negative for groups. Rejecting
      // anything else here saves a round trip and a confusing policy error.
      if (!/^-?\d+$/.test(trimmed)) return "A chat id is a number, e.g. 123456789 or -100123456789.";

      const userId = await currentUserId();
      if (!userId) return "You are not signed in.";

      const { error: insertError } = await supabase.from("telegram_links").insert({
        org_id: orgId,
        chat_id: trimmed,
        label: label.trim() || null,
        created_by: userId,
      });
      if (insertError) return errorMessage(insertError);
      await refresh();
      return null;
    },
    [orgId, refresh, currentUserId],
  );

  const removeTelegramChat = useCallback(
    async (id: string) => {
      if (!supabase) return "No backend is configured.";
      const { error: deleteError } = await supabase.from("telegram_links").delete().eq("id", id);
      if (deleteError) return errorMessage(deleteError);
      await refresh();
      return null;
    },
    [refresh],
  );

  const mintTelegramCode = useCallback(
    async (label: string) => {
      if (!supabase || !orgId) return null;
      const userId = await currentUserId();
      if (!userId) return null;

      const code = linkCode();
      const { error: insertError } = await supabase.from("telegram_link_codes").insert({
        code,
        org_id: orgId,
        label: label.trim() || null,
        created_by: userId,
      });
      return insertError ? null : code;
    },
    [orgId, currentUserId],
  );

  return useMemo(
    () => ({
      members,
      invites,
      telegramLinks,
      telegramUnavailable,
      invitesUnavailable,
      loading,
      error,
      refresh,
      invite,
      withdrawInvite,
      changeRole,
      removeMember,
      addTelegramChat,
      removeTelegramChat,
      mintTelegramCode,
    }),
    [
      members,
      invites,
      telegramLinks,
      telegramUnavailable,
      invitesUnavailable,
      loading,
      error,
      refresh,
      invite,
      withdrawInvite,
      changeRole,
      removeMember,
      addTelegramChat,
      removeTelegramChat,
      mintTelegramCode,
    ],
  );
}
