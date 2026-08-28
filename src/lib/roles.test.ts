import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ORG_ROLES,
  can,
  canAssignRole,
  canOperate,
  canRemoveMember,
  hasAtLeast,
  parseRole,
  roleRank,
  type Capability,
} from "./roles";

describe("role ordering", () => {
  it("ranks the roles the way the database does", () => {
    // These ranks mirror public.role_rank in supabase/schema.sql. If they ever
    // disagree, the UI offers actions the server refuses.
    expect(ORG_ROLES.map(roleRank)).toEqual([1, 2, 3, 4]);
  });

  it("treats no membership as less than any role", () => {
    expect(hasAtLeast(null, "viewer")).toBe(false);
  });
});

describe("can", () => {
  it("lets a viewer do nothing but read", () => {
    const capabilities = Object.keys(CAPABILITIES) as Capability[];
    for (const capability of capabilities) {
      expect(can("viewer", capability), capability).toBe(false);
    }
  });

  it("lets an operator run shipments but not the organisation", () => {
    expect(can("operator", "editShipment")).toBe(true);
    expect(can("operator", "resolveInvestigation")).toBe(true);
    expect(can("operator", "manageMembers")).toBe(false);
    expect(can("operator", "manageAlerts")).toBe(false);
  });

  it("lets an admin manage people and alerts but not the organisation itself", () => {
    expect(can("admin", "manageMembers")).toBe(true);
    expect(can("admin", "manageAlerts")).toBe(true);
    expect(can("admin", "manageOrganisation")).toBe(false);
  });

  it("gives an owner everything", () => {
    const capabilities = Object.keys(CAPABILITIES) as Capability[];
    for (const capability of capabilities) {
      expect(can("owner", capability), capability).toBe(true);
    }
  });

  it("refuses everything to somebody with no membership", () => {
    expect(can(null, "appendLedger")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("stops an admin minting an owner", () => {
    // Otherwise "admin" is a slower way of spelling "owner": promote a second
    // account you control, and you have one.
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("owner", "owner")).toBe(true);
  });

  it("stops an operator handing out roles at all", () => {
    expect(canAssignRole("operator", "viewer")).toBe(false);
  });
});

describe("canRemoveMember", () => {
  it("stops an admin removing an owner", () => {
    expect(canRemoveMember("admin", "operator")).toBe(true);
    expect(canRemoveMember("admin", "owner")).toBe(false);
    expect(canRemoveMember("owner", "owner")).toBe(true);
  });
});

describe("canOperate", () => {
  it("allows everything when not signed in — no backend, or local-only", () => {
    // Vault must work with no backend configured at all, and this is the
    // path that keeps it working: nobody signed in means no organisation's
    // policy could ever apply, so nothing is refused.
    expect(
      canOperate("manageOrganisation", {
        signedIn: false,
        hasActiveOrg: false,
        membershipsUnknown: false,
        role: null,
      }),
    ).toBe(true);
  });

  it("refuses while a session is still being restored", () => {
    // The window between "a backend is configured" and "we know who this is"
    // is not the same as nobody being signed in, and reading it as such
    // offered every privileged action for the length of the restore.
    expect(
      canOperate("manageOrganisation", {
        signedIn: false,
        hasActiveOrg: false,
        membershipsUnknown: false,
        role: null,
        sessionResolving: true,
      }),
    ).toBe(false);
  });

  it("allows everything when signed in with no organisation to enforce against", () => {
    // A confirmed, empty membership list is not a failure — there is simply
    // no policy for it to defer to.
    expect(
      canOperate("manageOrganisation", {
        signedIn: true,
        hasActiveOrg: false,
        membershipsUnknown: false,
        role: null,
      }),
    ).toBe(true);
  });

  it("refuses everything when memberships could not be confirmed, even with an owner role cached", () => {
    // This pins the fail-closed fix: signed in, with a failed membership
    // query, must never fall back to "allowed" no matter what role happens
    // to be sitting in state — that fallback is exactly what let a
    // transient network or RLS failure offer every privileged action.
    expect(
      canOperate("manageOrganisation", {
        signedIn: true,
        hasActiveOrg: true,
        membershipsUnknown: true,
        role: "owner",
      }),
    ).toBe(false);
    expect(
      canOperate("appendLedger", {
        signedIn: true,
        hasActiveOrg: false,
        membershipsUnknown: true,
        role: null,
      }),
    ).toBe(false);
  });

  it("defers to the role once memberships are confirmed and an organisation is active", () => {
    expect(
      canOperate("manageMembers", {
        signedIn: true,
        hasActiveOrg: true,
        membershipsUnknown: false,
        role: "viewer",
      }),
    ).toBe(false);
    expect(
      canOperate("manageMembers", {
        signedIn: true,
        hasActiveOrg: true,
        membershipsUnknown: false,
        role: "admin",
      }),
    ).toBe(true);
  });
});

describe("parseRole", () => {
  it("defaults an unrecognised value to the least privileged role", () => {
    // A role arriving from the network is untrusted input, and the safe
    // failure is the one that grants nothing.
    expect(parseRole("superuser")).toBe("viewer");
    expect(parseRole(undefined)).toBe("viewer");
    expect(parseRole(4)).toBe("viewer");
    expect(parseRole("owner")).toBe("owner");
  });
});
