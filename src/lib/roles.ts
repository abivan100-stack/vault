/**
 * What each role in an organisation may do.
 *
 * This is the client's copy of a decision the database also makes, and the
 * two are not redundant in the way that phrase usually implies: the row-level
 * security policies in `supabase/schema.sql` are the enforcement, and this is
 * the UI's ability to stop offering an action that would be refused. A viewer
 * should not be shown a Resolve button that fails.
 *
 * Because it is a copy, it must be a faithful one. Every capability below
 * names the policy it mirrors, and the ordering — viewer < operator < admin <
 * owner — matches `public.role_rank` exactly. If you change one, change both.
 */

export const ORG_ROLES = ["viewer", "operator", "admin", "owner"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

/** Ascending authority. Mirrors `public.role_rank`. */
const RANK: Record<OrgRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
  owner: 4,
};

export function roleRank(role: OrgRole): number {
  return RANK[role];
}

export function hasAtLeast(role: OrgRole | null, minimum: OrgRole): boolean {
  if (role === null) return false;
  return RANK[role] >= RANK[minimum];
}

/**
 * The things a person can do to a shipment, and the minimum role each needs.
 *
 * Read is absent on purpose: every member reads, so a capability for it would
 * only ever be checked to produce `true`.
 */
export const CAPABILITIES = {
  /** Append to the ledger — the readings sync, and so do manual events. */
  appendLedger: "operator",
  /** Open a new shipment. Mirrors "operators open shipments". */
  createShipment: "operator",
  /** Edit shipment fields, record a handoff. Mirrors "operators update shipments". */
  editShipment: "operator",
  /** Resolve an investigation — an append, and the one that matters most. */
  resolveInvestigation: "operator",
  /** Invite, remove, or change the role of a member. */
  manageMembers: "admin",
  /** Add or remove a Telegram chat that receives excursion alerts. */
  manageAlerts: "admin",
  /** Rename or delete the organisation itself. */
  manageOrganisation: "owner",
} as const satisfies Record<string, OrgRole>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: OrgRole | null, capability: Capability): boolean {
  return hasAtLeast(role, CAPABILITIES[capability]);
}

const ROLE_LABELS: Record<OrgRole, string> = {
  viewer: "Viewer",
  operator: "Operator",
  admin: "Admin",
  owner: "Owner",
};

export function roleLabel(role: OrgRole): string {
  return ROLE_LABELS[role];
}

const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  viewer: "Reads the ledger, the monitor and the reports. Changes nothing.",
  operator: "Runs shipments: opens them, edits them, records handoffs, resolves investigations.",
  admin: "Everything an operator does, plus members, roles and alert destinations.",
  owner: "Everything, plus renaming and deleting the organisation itself.",
};

export function roleDescription(role: OrgRole): string {
  return ROLE_DESCRIPTIONS[role];
}

/**
 * Whether `actor` may assign `target` to somebody.
 *
 * Mirrors the `with check` half of the "admins change roles" policy: an admin
 * may hand out anything up to admin, but only an owner can create another
 * owner. Without that rule, "admin" is a slower way of spelling "owner",
 * since an admin could promote a second account they control.
 */
export function canAssignRole(actor: OrgRole | null, target: OrgRole): boolean {
  if (!hasAtLeast(actor, "admin")) return false;
  if (target === "owner") return hasAtLeast(actor, "owner");
  return true;
}

/**
 * Whether `actor` may remove the membership of somebody holding `target`.
 *
 * A person may always leave, which is checked by the caller against user ids
 * — this only covers removing somebody else.
 */
export function canRemoveMember(actor: OrgRole | null, target: OrgRole): boolean {
  if (!hasAtLeast(actor, "admin")) return false;
  if (target === "owner") return hasAtLeast(actor, "owner");
  return true;
}

/** Coerces an untrusted role string, defaulting to the least privileged. */
export function parseRole(value: unknown): OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value)
    ? (value as OrgRole)
    : "viewer";
}

/**
 * Whether a capability is allowed, given what the caller's session actually
 * established.
 *
 * Three states get collapsed into "acting for an organisation or not" here,
 * and confusing two of them is exactly the bug this function exists to
 * prevent: running with no backend, or signed out, is "nothing to enforce" —
 * roles do not apply, so everything is allowed, same as before any of this
 * existed. Signed in with a confirmed, empty membership list is *also*
 * nothing to enforce — there is no organisation whose policy could refuse
 * anything. But signed in with memberships that could not be read (a failed
 * query) is neither of those: it means an organisation's policy might apply
 * and the client has no way to know what it says, and defaulting that case to
 * "allowed" is what let a transient network or RLS failure offer every
 * privileged action in the UI. Only that case must fail closed.
 */
export function canOperate(
  capability: Capability,
  options: {
    signedIn: boolean;
    hasActiveOrg: boolean;
    membershipsUnknown: boolean;
    role: OrgRole | null;
    /** A configured backend is still restoring a session. */
    sessionResolving?: boolean;
  },
): boolean {
  // First, and before the not-signed-in case. While a session is being
  // restored the answer is not "nobody is signed in" -- it is "we do not know
  // yet", and the two are only indistinguishable if you ask in that order.
  if (options.sessionResolving) return false;
  // Before the not-signed-in case, deliberately. This flag is only ever
  // raised once a backend is configured and a read of it failed, and
  // "signed out" is not a safe reading of "we could not find out".
  if (options.membershipsUnknown) return false;
  if (!options.signedIn) return true;
  if (options.membershipsUnknown) return false;
  if (!options.hasActiveOrg) return true;
  return can(options.role, capability);
}
