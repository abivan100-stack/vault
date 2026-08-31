import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Check,
  CloudOff,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useOrganisationAdmin } from "@/hooks/useOrganisationAdmin";
import { useLedgerSyncState } from "@/hooks/useLedgerSync";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StatusPill from "@/components/StatusPill";
import { useToast } from "@/hooks/useToast";
import { ORG_ROLES, can, canAssignRole, canRemoveMember, roleDescription, roleLabel, type OrgRole } from "@/lib/roles";
import { BACKEND_UNCONFIGURED_MESSAGE } from "@/lib/supabase";
import { describeSync } from "@/lib/sync";

/**
 * The organisation: who is in it, what they may do, where its alerts go, and
 * whether this browser's ledger has reached it.
 *
 * The role controls are shown to everybody and enabled for the people who may
 * use them. Hiding them entirely would leave a viewer unable to see that
 * roles exist at all, which is worse: the point of a permission model is that
 * people can tell what it is.
 */

const SELECT_CLASS =
  "h-8 min-w-0 rounded-lg border border-input bg-raised px-2 text-[13px] text-ink transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-transparent";

function SyncPanel() {
  const { state, syncNow } = useLedgerSyncState();
  const busy = state.status === "SYNCING";

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
            state.status === "SYNCED"
              ? "bg-success-soft text-success"
              : state.status === "ERROR"
                ? "bg-warning-soft text-warning"
                : "bg-sunken text-ink-subtle"
          }`}
        >
          {state.status === "SYNCED" ? (
            <Check size={17} aria-hidden="true" />
          ) : state.status === "SYNCING" ? (
            <Loader2 size={17} className="animate-spin" aria-hidden="true" />
          ) : (
            <CloudOff size={17} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle>Ledger sync</CardTitle>
          <p className="mt-1 max-w-[64ch] text-[13px] leading-relaxed text-ink-muted">
            {describeSync(state)}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={syncNow}
          disabled={busy}
          className="h-9 shrink-0 gap-2 text-sm"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Sync now
        </Button>
      </div>
    </Card>
  );
}

function CreateOrganisation() {
  const { createOrganisation } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const message = await createOrganisation(name);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setName("");
    setError(null);
  };

  return (
    <Card className="p-5">
      <CardTitle>New organisation</CardTitle>
      <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-ink-muted">
        You become its owner. Everyone else joins by invitation, at the role you give them.
      </p>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Northern Cold Chain"
          aria-label="Organisation name"
          className="h-9 text-[13.5px]"
        />
        <Button type="submit" disabled={busy} className="h-9 shrink-0 gap-2 text-sm">
          <Plus size={15} aria-hidden="true" />
          Create
        </Button>
      </form>
      {error && <p className="mt-2 text-[13px] text-warning">{error}</p>}
    </Card>
  );
}

export default function OrganisationPage() {
  const { status, user, organisations, activeOrg, role, setActiveOrg, signOut, refreshOrganisations } =
    useAuth();
  const admin = useOrganisationAdmin(activeOrg?.id ?? null);
  const { toast, showToast } = useToast();

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("operator");
  const [chatId, setChatId] = useState("");
  const [chatLabel, setChatLabel] = useState("");
  const [mintedCode, setMintedCode] = useState<string | null>(null);

  if (status === "UNCONFIGURED") {
    return (
      <div className="mx-auto max-w-[560px] space-y-4 py-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-sunken text-ink-subtle">
          <CloudOff size={19} aria-hidden="true" />
        </span>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Running locally</h1>
        <p className="mx-auto max-w-[52ch] text-[13.5px] leading-relaxed text-ink-muted">
          {BACKEND_UNCONFIGURED_MESSAGE}
        </p>
        <p className="text-[13px] text-ink-subtle">
          The setup is in <code className="font-mono text-[12.5px]">supabase/README.md</code>: one
          project, one SQL file, two environment variables.
        </p>
        <Link to="/monitor" className={buttonVariants({ variant: "outline", size: "lg", className: "text-sm" })}>
          Back to the console
        </Link>
      </div>
    );
  }

  if (status === "LOADING") {
    return (
      <p className="py-16 text-center text-[13.5px] text-ink-muted">Restoring your session…</p>
    );
  }

  if (status === "SIGNED_OUT") {
    return (
      <div className="mx-auto max-w-[520px] space-y-4 py-6 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Not signed in</h1>
        <p className="mx-auto max-w-[48ch] text-[13.5px] leading-relaxed text-ink-muted">
          The console is running, and its ledger is in this browser. Sign in to put it into an
          organisation.
        </p>
        <Link to="/signin" className={buttonVariants({ size: "lg", className: "text-sm" })}>
          Sign in
        </Link>
      </div>
    );
  }

  const canManageMembers = can(role, "manageMembers");
  const canManageAlerts = can(role, "manageAlerts");

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    const message = await admin.invite(inviteEmail, inviteRole);
    if (message) {
      showToast(message, "error");
      return;
    }
    setInviteEmail("");
    showToast("Invitation recorded — it is redeemed when they sign up with that address");
  };

  const handleAddChat = async (event: FormEvent) => {
    event.preventDefault();
    const message = await admin.addTelegramChat(chatId, chatLabel);
    if (message) {
      showToast(message, "error");
      return;
    }
    setChatId("");
    setChatLabel("");
    showToast("Chat linked — excursions will be sent there");
  };

  const handleSignOut = async () => {
    const message = await signOut();
    if (message) showToast(message, "error");
  };

  const handleMint = async () => {
    const code = await admin.mintTelegramCode(chatLabel);
    if (!code) {
      showToast("Could not mint a code — admin or owner only", "error");
      return;
    }
    setMintedCode(code);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="mt-2 text-[21px] font-semibold tracking-[-0.02em] text-ink">
            Organisation
          </h1>
          <p className="mt-1 max-w-[56ch] text-[13.5px] text-ink-muted">
            Signed in as <span className="font-medium text-ink">{user?.email}</span>. Roles here
            are enforced by the database, not by this page — the controls simply stop offering what
            would be refused.
          </p>
        </div>
        <Button variant="outline" onClick={() => void handleSignOut()} className="h-9 shrink-0 text-sm">
          Sign out
        </Button>
      </header>

      {organisations.length === 0 ? (
        <CreateOrganisation />
      ) : (
        <>
          <Card className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                <Building2 size={17} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle>Active organisation</CardTitle>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {role ? roleDescription(role) : "No role."}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {role && <StatusPill tone="brand" size="sm">{roleLabel(role)}</StatusPill>}
                <select
                  value={activeOrg?.id ?? ""}
                  onChange={(event) => setActiveOrg(event.target.value)}
                  aria-label="Active organisation"
                  className={SELECT_CLASS}
                >
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <SyncPanel />

          {/* Members */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-5">
              <div>
                <CardTitle>Members</CardTitle>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {admin.members.length} {admin.members.length === 1 ? "person" : "people"} in{" "}
                  {activeOrg?.name}.
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  void admin.refresh();
                  void refreshOrganisations();
                }}
                className="h-8 gap-2 text-[13px]"
              >
                <RefreshCw size={14} aria-hidden="true" />
                Refresh
              </Button>
            </div>

            {admin.error ? (
              <p className="p-5 text-[13px] text-warning">{admin.error}</p>
            ) : admin.members.length === 0 ? (
              <p className="p-5 text-[13px] text-ink-muted">
                {admin.loading ? "Loading…" : "No members visible."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {admin.members.map((member) => {
                  const isSelf = member.userId === user?.id;
                  return (
                    <li key={member.userId} className="flex flex-wrap items-center gap-3 p-4">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sunken font-mono text-[12px] font-semibold text-ink-muted">
                        {(member.displayName ?? member.email).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-ink">
                          {member.displayName ?? member.email}
                          {isSelf && <span className="ml-2 text-[12px] text-ink-subtle">you</span>}
                        </p>
                        <p className="truncate text-[12.5px] text-ink-subtle">{member.email}</p>
                      </div>
                      <select
                        value={member.role}
                        aria-label={`Role for ${member.email}`}
                        // An admin may not touch an owner and may not mint
                        // one; the same rule the policy enforces.
                        disabled={!canManageMembers || !canRemoveMember(role, member.role)}
                        onChange={async (event) => {
                          const next = event.target.value as OrgRole;
                          const message = await admin.changeRole(member.userId, next);
                          showToast(
                            message ?? `${member.email} is now ${roleLabel(next).toLowerCase()}`,
                            message ? "error" : undefined,
                          );
                        }}
                        className={SELECT_CLASS}
                      >
                        {ORG_ROLES.map((option) => (
                          <option
                            key={option}
                            value={option}
                            disabled={!canAssignRole(role, option) && option !== member.role}
                          >
                            {roleLabel(option)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={isSelf ? "Leave organisation" : `Remove ${member.email}`}
                        disabled={!isSelf && (!canManageMembers || !canRemoveMember(role, member.role))}
                        onClick={async () => {
                          const message = await admin.removeMember(member.userId);
                          if (message) {
                            showToast(message, "error");
                            return;
                          }
                          await refreshOrganisations();
                          showToast(isSelf ? "You left the organisation" : "Member removed");
                        }}
                        className="rounded-md text-ink-subtle"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {canManageMembers && (
              <form onSubmit={handleInvite} className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                  aria-label="Invite by email"
                  className="h-9 text-[13.5px]"
                />
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as OrgRole)}
                  aria-label="Role for the invitation"
                  className={SELECT_CLASS}
                >
                  {ORG_ROLES.filter((option) => canAssignRole(role, option)).map((option) => (
                    <option key={option} value={option}>
                      {roleLabel(option)}
                    </option>
                  ))}
                </select>
                <Button type="submit" className="h-9 shrink-0 gap-2 text-sm">
                  <UserPlus size={15} aria-hidden="true" />
                  Invite
                </Button>
              </form>
            )}

            {admin.invites.length > 0 && (
              <div className="border-t border-line p-4">
                <p className="eyebrow">Pending invitations</p>
                <ul className="mt-2 space-y-1.5">
                  {admin.invites.map((pending) => (
                    <li key={pending.id} className="flex items-center gap-3 text-[13px]">
                      <span className="min-w-0 flex-1 truncate text-ink-muted">{pending.email}</span>
                      <StatusPill tone="neutral" size="sm">
                        {roleLabel(pending.role)}
                      </StatusPill>
                      <button
                        type="button"
                        // Withdrawing an invitation is an administrative
                        // mutation; RLS refuses it for a viewer, so the page
                        // should not offer it either.
                        disabled={!canManageMembers}
                        onClick={async () => {
                          const message = await admin.withdrawInvite(pending.id);
                          showToast(message ?? "Invitation withdrawn", message ? "error" : undefined);
                        }}
                        className="text-[12.5px] text-ink-subtle transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-subtle">
                  An invitation is redeemed the moment that address signs up — the role is applied
                  by the database, so it cannot be chosen by whoever accepts it.
                </p>
              </div>
            )}
          </Card>

          {/* Telegram */}
          <Card className="overflow-hidden">
            <div className="border-b border-line p-5">
              <CardTitle>Excursion alerts</CardTitle>
              <p className="mt-1 max-w-[66ch] text-[13px] leading-relaxed text-ink-muted">
                When the corridor breaks, Vault sends the reading, the shipment and the ledger
                digest to every chat linked here. The bot's token lives in the project's Edge
                Function secrets and never reaches this browser.
              </p>
            </div>

            {admin.telegramUnavailable ? (
              <p className="p-5 text-[13px] text-ink-muted">
                The linked chats could not be read, so this list is not a statement about what is
                linked. Excursions are recorded on the ledger either way.
              </p>
            ) : admin.telegramLinks.length === 0 ? (
              <p className="p-5 text-[13px] text-ink-muted">
                No chat is linked. Excursions are still recorded on the ledger — nobody is told
                about them.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {admin.telegramLinks.map((link) => (
                  <li key={link.id} className="flex items-center gap-3 p-4">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                      <Send size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-ink">{link.label ?? "Telegram chat"}</p>
                      <p className="tabular truncate font-mono text-[12px] text-ink-subtle">
                        {link.chatId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Unlink ${link.label ?? link.chatId}`}
                      disabled={!canManageAlerts}
                      onClick={async () => {
                        const message = await admin.removeTelegramChat(link.id);
                        showToast(message ?? "Chat unlinked", message ? "error" : undefined);
                      }}
                      className="rounded-md text-ink-subtle"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {canManageAlerts && (
              <div className="space-y-4 border-t border-line p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="chat-label">Label</Label>
                  <Input
                    id="chat-label"
                    value={chatLabel}
                    onChange={(event) => setChatLabel(event.target.value)}
                    placeholder="Depot duty phone"
                    className="h-9 text-[13.5px]"
                  />
                </div>

                <div className="rounded-lg border border-line bg-sunken p-3.5">
                  <p className="text-[13px] font-medium text-ink">Link a chat by code</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                    Mint a code, then send <code className="font-mono">/start &lt;code&gt;</code> to
                    the bot from the chat that should receive alerts. The code expires in fifteen
                    minutes and can be used once.
                  </p>
                  {mintedCode ? (
                    <div className="mt-3 flex items-center gap-2">
                      <code className="tabular flex-1 truncate rounded-md border border-line bg-raised px-2.5 py-1.5 font-mono text-[13px] text-ink">
                        /start {mintedCode}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Copy the start command"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(`/start ${mintedCode}`);
                            showToast("Copied — send it to the bot from the chat");
                          } catch {
                            showToast("Copy failed — select the text instead", "error");
                          }
                        }}
                        className="rounded-md"
                      >
                        <Copy size={15} aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleMint}
                      className="mt-3 h-9 gap-2 text-sm"
                    >
                      <Plus size={15} aria-hidden="true" />
                      Mint a link code
                    </Button>
                  )}
                </div>

                <form onSubmit={handleAddChat} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={chatId}
                    onChange={(event) => setChatId(event.target.value)}
                    placeholder="…or paste a chat id, e.g. -1001234567890"
                    aria-label="Telegram chat id"
                    className="h-9 text-[13.5px]"
                  />
                  <Button type="submit" variant="outline" className="h-9 shrink-0 gap-2 text-sm">
                    <Send size={15} aria-hidden="true" />
                    Link chat
                  </Button>
                </form>
              </div>
            )}
          </Card>

          <CreateOrganisation />
        </>
      )}

      {toast && (
        <p
          className={`text-[13px] ${toast.tone === "error" ? "text-warning" : "text-ink-muted"}`}
          role="status"
        >
          {toast.message}
        </p>
      )}
    </div>
  );
}
