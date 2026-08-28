import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, isBackendConfigured } from "@/lib/supabase";
import { parseRole, type OrgRole } from "@/lib/roles";

/**
 * Who is signed in, which organisation they are looking at, and what they may
 * do in it.
 *
 * Deliberately separate from `ColdChainContext`. The simulation, the ledger
 * and the shipment record work identically whether or not anybody is signed
 * in — that is the property that lets the console be opened and audited with
 * no backend at all — so identity is a layer beside them, never a prerequisite
 * underneath them.
 *
 * Everything here degrades to "not configured" rather than throwing. A build
 * with no credentials renders the same app; it simply never offers to sync.
 */

const ACTIVE_ORG_KEY = "vault:activeOrg";

export type Organisation = {
  id: string;
  name: string;
  role: OrgRole;
};

export type AuthStatus =
  /** No credentials in the build — there is nothing to sign in to. */
  | "UNCONFIGURED"
  /** Restoring a stored session; we do not yet know either way. */
  | "LOADING"
  | "SIGNED_OUT"
  | "SIGNED_IN";

type AuthValue = {
  status: AuthStatus;
  user: User | null;
  organisations: Organisation[];
  activeOrg: Organisation | null;
  /** The caller's role in `activeOrg`, or null when there isn't one. */
  role: OrgRole | null;
  /**
   * True when the caller is signed in but the last attempt to read their
   * memberships failed, so `organisations` cannot be trusted as "none". A
   * failed query and an empty result are different states — `null` is not
   * "the caller has no organisations", it is "we don't know" — and
   * `useCapability` must refuse rather than allow while this is true.
   */
  membershipsUnknown: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, displayName: string) => Promise<string | null>;
  signOut: () => Promise<string | null>;
  createOrganisation: (name: string) => Promise<string | null>;
  setActiveOrg: (id: string) => void;
  /** Re-reads memberships — after an invite is redeemed, or a role changes. */
  refreshOrganisations: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

function readStoredOrg(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

function writeStoredOrg(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(ACTIVE_ORG_KEY);
    else window.localStorage.setItem(ACTIVE_ORG_KEY, id);
  } catch {
    // Storage unavailable — the choice simply does not survive a reload.
  }
}

/**
 * Turns whatever went wrong into one sentence a person can act on.
 *
 * Supabase's auth errors are already reasonably worded; the value here is that
 * every call site gets a string or null, and never has to decide whether an
 * exception, an `error` field or a null `data` is the failure.
 */
function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Something went wrong. Try again.";
}

/**
 * Reads the caller's memberships. Pure I/O — it touches no React state, which
 * is what keeps `refreshOrganisations` free of a synchronous setState.
 *
 * RLS restricts the query to the caller's own rows, so there is no filter here
 * to forget: the policy is the filter.
 *
 * Returns `null` — not `[]` — when the query itself failed. Collapsing "the
 * membership query errored" into "this user has no organisations" is the
 * fail-open bug this return type exists to make impossible: an empty array
 * here used to mean either, and every capability check downstream treated
 * both as "no organisation, so nothing to enforce". `[]` remains a legitimate
 * result — no backend, or no user, or a query that genuinely came back empty
 * — it is specifically the error branch that must be distinguishable.
 */
async function fetchOrganisations(user: User | null): Promise<Organisation[] | null> {
  if (!supabase || !user) return [];

  // Redeem any invite waiting on this address first. The sign-up trigger only
  // fires for brand-new accounts, so without this an invite sent to somebody
  // who already had one would never become a membership. It reads the address
  // from the caller's own token, returns 0 when there is nothing pending, and
  // is safe to call on every refresh.
  const { error: inviteError } = await supabase.rpc("accept_pending_invites");
  if (inviteError) {
    // Not fatal: the memberships they already hold still load.
    console.error(`accepting pending invites failed: ${inviteError.message}`);
  }

  const { data, error } = await supabase
    .from("memberships")
    .select("role, organisations ( id, name )")
    .order("created_at", { ascending: true });
  if (error || !data) return null;

  const next: Organisation[] = [];
  for (const row of data as unknown[]) {
    const record = row as { role?: unknown; organisations?: { id?: unknown; name?: unknown } | null };
    const org = record.organisations;
    if (!org || typeof org.id !== "string" || typeof org.name !== "string") {
      // Not skippable. A row we cannot read is a membership we cannot
      // account for, and a list missing one is not a shorter list -- it is
      // an answer nobody should authorise against. Report it as unknown,
      // the same as a failed query.
      console.error("a membership row could not be read; treating the list as unknown");
      return null;
    }
    // parseRole rather than a cast: a role is a privilege decision, and the
    // safe reading of an unrecognised one grants nothing.
    next.push({ id: org.id, name: org.name, role: parseRole(record.role) });
  }
  return next;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isBackendConfigured();
  const [status, setStatus] = useState<AuthStatus>(configured ? "LOADING" : "UNCONFIGURED");
  const [user, setUser] = useState<User | null>(null);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  // Separate from `organisations` rather than folded into it (e.g. as `null`)
  // so a stale render can never read "no organisations" out of a failed
  // fetch — the two pieces of state can only be read together, explicitly.
  const [membershipsUnknown, setMembershipsUnknown] = useState(false);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(() => readStoredOrg());

  const lastUserId = useRef<string | null>(null);
  // Set when restoring the session failed. It has to outlive applySession,
  // which would otherwise clear the flag on its way to SIGNED_OUT and hand
  // back the permissive reading of a state nobody could actually read.
  const restoreFailed = useRef(false);
  // Auth events before the restore resolves describe the same session it is
  // about to return. Applying them early moved status out of LOADING and
  // answered "signed out" while the answer was still unknown.
  const restored = useRef(false);
  // An auth event that arrives mid-restore is usually the restore describing
  // itself, but it can also be a real sign-in, sign-out, or a change from
  // another tab. Dropping it lost those; keeping the latest one and applying
  // it in place of the restore's own answer does not.
  const pendingSession = useRef<{ session: Session | null } | null>(null);
  // The identity a membership read belongs to. A response whose generation no
  // longer matches is answering a question nobody is asking any more.
  const generation = useRef(0);
  // Ordering between concurrent reads of the same identity. The generation
  // counter cannot separate those -- it only moves when the user does -- so an
  // older response could still land last and overwrite a newer list.
  const readSeq = useRef(0);

  const applySession = useCallback((session: Session | null) => {
    const nextUser = session?.user ?? null;

    // The identity changed, so anything derived from the previous one is now
    // wrong rather than merely stale. Dropping the list and marking
    // memberships unknown makes the window before the next fetch resolves
    // fail closed, instead of reading as "signed in, no organisation" —
    // which canOperate, correctly, treats as nothing to enforce against.
    if (nextUser?.id !== lastUserId.current) {
      lastUserId.current = nextUser?.id ?? null;
      // Bumped here, synchronously with the identity change itself, rather
      // than from an effect that runs after this render. In that gap a
      // response belonging to the previous session could still resolve,
      // match the old generation, and repopulate the list -- clearing
      // membershipsUnknown for a user it was never read for.
      generation.current += 1;
      setOrganisations([]);
      setMembershipsUnknown(nextUser !== null || restoreFailed.current);
    }

    setUser(nextUser);
    setStatus(nextUser ? "SIGNED_IN" : "SIGNED_OUT");
  }, []);

  // One subscription for the lifetime of the app. `onAuthStateChange` also
  // fires for the initial session, but not reliably before the first render,
  // so the explicit getSession below is what resolves LOADING.
  useEffect(() => {
    if (!supabase) return undefined;

    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Reported in the result rather than as a rejection, and just as
          // unknown either way. Resolve LOADING so nothing hangs, but raise
          // the flag so the answer is refusal rather than the permissive
          // reading of "signed out".
          console.error(`restoring the session failed: ${error.message}`);
          restored.current = true;
          // An event that landed while this was in flight is a real answer
          // and outranks the failure: losing it would represent a live
          // session as signed out until something else happened to fire.
          const held = pendingSession.current;
          pendingSession.current = null;
          restoreFailed.current = held === null;
          applySession(held ? held.session : null);
          if (!held) setMembershipsUnknown(true);
          return;
        }
        restored.current = true;
        // An event that landed while this was in flight is newer than this
        // result, so it wins.
        applySession(pendingSession.current ? pendingSession.current.session : (data?.session ?? null));
        pendingSession.current = null;
      })
      .catch((cause: unknown) => {
        // LOADING is resolved by this call alone. Leaving it unresolved on a
        // rejection would hang the header on a spinner with no way out; the
        // honest reading of "could not restore a session" is signed out.
        console.error(`restoring the session failed: ${String(cause)}`);
        if (cancelled) return;
        restored.current = true;
        const held = pendingSession.current;
        pendingSession.current = null;
        restoreFailed.current = held === null;
        applySession(held ? held.session : null);
        if (!held) setMembershipsUnknown(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Until the restore resolves, this is describing the very session it is
      // about to return -- and acting on it turns LOADING into SIGNED_OUT
      // before anyone has confirmed there is nobody signed in.
      if (!restored.current) {
        pendingSession.current = { session };
        return;
      }
      // A later event is a real answer, so a previous restore failure no
      // longer describes what we know.
      const recovering = restoreFailed.current;
      restoreFailed.current = false;
      applySession(session);
      // applySession only revisits the flag when the identity changes, and
      // after a failed restore the identity is already null -- so a null
      // event would leave the console refusing its own local-only actions
      // for the rest of the session.
      if (recovering && !session) setMembershipsUnknown(false);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [applySession]);

  const refreshOrganisations = useCallback(async () => {
    // Every branch here settles after an await, so this never sets state
    // synchronously — which is what lets the effect below simply call it. A
    // synchronous setState inside an effect body cascades an extra render,
    // and on a provider wrapping the whole app that is the whole app.
    const started = generation.current;
    readSeq.current += 1;
    const ticket = readSeq.current;

    // Unknown for the duration. The cached list is the previous answer to a
    // question being asked again, and authorising from it while the new one
    // is outstanding is the same fail-open in slower motion.
    //
    setMembershipsUnknown(true);
    let next: Organisation[] | null;
    try {
      next = await fetchOrganisations(user);
    } catch (cause) {
      // A rejection is a failed read like any other: unknown, not empty, and
      // certainly not "keep authorising with what we had".
      console.error(`reading memberships failed: ${String(cause)}`);
      next = null;
    }
    if (generation.current !== started || readSeq.current !== ticket) return;
    if (next === null) {
      // The query failed, not "came back empty" — leave the existing list
      // alone and only raise the flag. Clearing it here would recreate
      // finding 1 one layer up: a transient failure would present as zero
      // memberships instead of as "unknown".
      setMembershipsUnknown(true);
      return;
    }
    setMembershipsUnknown(false);
    setOrganisations(next);
  }, [user]);

  // Applied in the promise's callbacks rather than in the effect body: a
  // synchronous setState here cascades a render across a provider wrapping
  // the whole app, and this effect runs on every session change.
  //
  // Both guards are needed and they catch different things. `cancelled` ends
  // a response for an effect that has been torn down. The generation check
  // ends one whose identity changed since it was asked -- applySession moves
  // that counter synchronously, so it has already moved by the time a
  // response belonging to the previous user arrives, even though this
  // effect's cleanup has not run yet.
  useEffect(() => {
    let cancelled = false;
    const started = generation.current;
    // The same queue the manual refresh takes a ticket from. Two reads of the
    // same user -- one automatic, one from the Refresh button -- are not
    // separated by the generation counter, which only moves when the identity
    // does, so without this the older of the two could still land last.
    readSeq.current += 1;
    const ticket = readSeq.current;
    const stale = () =>
      cancelled || generation.current !== started || readSeq.current !== ticket;

    // Unknown until this read lands. The identity may be unchanged -- a token
    // refresh re-runs this -- but the role attached to it may not be, and the
    // previous answer must not authorise anything while a new one is out.
    void Promise.resolve().then(() => {
      if (!stale()) setMembershipsUnknown(true);
    });

    fetchOrganisations(user)
      .then((next) => {
        if (stale()) return;
        if (next === null) {
          setMembershipsUnknown(true);
          return;
        }
        // Not a flat false. This effect also runs for a null user, where the
        // read returns an empty list without asking anything -- and that
        // answer is in no position to clear a restore failure it knows
        // nothing about.
        setMembershipsUnknown(restoreFailed.current);
        setOrganisations(next);
      })
      .catch((cause: unknown) => {
        // Same reading as a returned error: unknown, so refuse rather than
        // keep authorising against whatever was last read.
        console.error(`reading memberships failed: ${String(cause)}`);
        if (!stale()) setMembershipsUnknown(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const setActiveOrg = useCallback((id: string) => {
    setActiveOrgId(id);
    writeStoredOrg(id);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return "No backend is configured.";
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? errorMessage(error) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (!supabase) return "No backend is configured.";
    const { error } = await supabase.auth.signUp({
      email,
      password,
      // The database trigger reads this to fill in the profile, and to redeem
      // any invitation waiting on the address.
      options: { data: { display_name: displayName } },
    });
    return error ? errorMessage(error) : null;
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return null;
    const { error } = await supabase.auth.signOut();
    // A failed sign-out leaves the session — and `status` — as SIGNED_IN.
    // Clearing `organisations` anyway used to fail open one layer up: signed
    // in with an empty list reads as "no organisation to enforce against", so
    // every capability came back allowed for a session that was never
    // actually terminated. Only clear state once sign-out really happened.
    if (error) return errorMessage(error);
    // Apply it here rather than waiting for onAuthStateChange. Between the
    // two, status still reads SIGNED_IN with an empty organisation list --
    // the one combination canOperate reads as "nothing to enforce against".
    applySession(null);
    setOrganisations([]);
    setMembershipsUnknown(false);
    // The organisation choice is not cleared: it is a preference, and it is
    // re-validated against the memberships of whoever signs in next.
    return null;
  }, [applySession]);

  const createOrganisation = useCallback(
    async (name: string) => {
      if (!supabase) return "No backend is configured.";
      const trimmed = name.trim();
      if (!trimmed) return "Give the organisation a name.";

      // A function rather than an insert: creating the organisation and the
      // owner membership has to happen together, and the membership policy
      // requires an admin role the creator does not have until it exists.
      const { data, error } = await supabase.rpc("create_organisation", { name: trimmed });
      if (error) return errorMessage(error);

      await refreshOrganisations();
      if (typeof data === "string") setActiveOrg(data);
      return null;
    },
    [refreshOrganisations, setActiveOrg],
  );

  // A remembered organisation the user has since been removed from simply
  // stops matching, and the first membership takes over. Correcting the
  // stored id in an effect would be a second source of truth for the same
  // decision, and a cascading render to maintain it.
  const activeOrg = useMemo(
    () => organisations.find((org) => org.id === activeOrgId) ?? organisations[0] ?? null,
    [organisations, activeOrgId],
  );

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      organisations,
      activeOrg,
      role: activeOrg?.role ?? null,
      membershipsUnknown,
      signIn,
      signUp,
      signOut,
      createOrganisation,
      setActiveOrg,
      refreshOrganisations,
    }),
    [
      status,
      user,
      organisations,
      activeOrg,
      membershipsUnknown,
      signIn,
      signUp,
      signOut,
      createOrganisation,
      setActiveOrg,
      refreshOrganisations,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
