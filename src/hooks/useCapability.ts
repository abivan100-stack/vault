import { useAuth } from "@/context/AuthContext";
import { canOperate, roleLabel, type Capability } from "@/lib/roles";

export type CapabilityCheck = {
  allowed: boolean;
  /** Why not, phrased for a person. Null when allowed. */
  reason: string | null;
};

/**
 * Whether the current context permits an action.
 *
 * The subtlety is what counts as "no organisation". Vault runs perfectly well
 * with no backend and nobody signed in, and in that state there is no
 * organisation whose policy could refuse anything — so everything is allowed,
 * exactly as it was before any of this existed. Roles only start constraining
 * once the browser is acting on an organisation's behalf, which is also the
 * only moment the database would refuse the request anyway.
 *
 * Gating the local-only case instead would have been the worse mistake in
 * both directions: it would break the app for anyone who has not configured a
 * backend, and it would imply a permission model where none applies.
 *
 * A fourth state sits between those two, and it is the one that must refuse
 * rather than allow: signed in, but the membership query itself failed, so
 * `activeOrg` reads as null for the same reason "no organisations" would.
 * Collapsing "no memberships" and "couldn't read memberships" into the same
 * empty list is what let a transient failure open every privileged action —
 * `AuthContext` now tracks that failure explicitly as `membershipsUnknown`,
 * and the decision itself lives in `canOperate` so it has a test that pins
 * both directions.
 */
export function useCapability(capability: Capability): CapabilityCheck {
  const { status, activeOrg, role, membershipsUnknown } = useAuth();
  const signedIn = status === "SIGNED_IN";
  const sessionResolving = status === "LOADING";

  if (
    canOperate(capability, {
      signedIn,
      hasActiveOrg: activeOrg !== null,
      membershipsUnknown,
      role,
      sessionResolving,
    })
  ) {
    return { allowed: true, reason: null };
  }

  if (sessionResolving) {
    return { allowed: false, reason: "Still checking who you are signed in as." };
  }

  if (membershipsUnknown) {
    return {
      allowed: false,
      reason: "Could not confirm your role. Try again.",
    };
  }

  return {
    allowed: false,
    reason: `Your role in ${activeOrg!.name} is ${
      role ? roleLabel(role).toLowerCase() : "none"
    }, which cannot do this. An admin can change it.`,
  };
}
