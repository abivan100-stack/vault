import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BACKEND_UNCONFIGURED_MESSAGE } from "@/lib/supabase";

/**
 * Sign in, or create an account.
 *
 * One page with a mode toggle rather than two routes: the fields are almost
 * the same, and a person who mistyped their password on the wrong form should
 * not have to navigate to fix it.
 *
 * Nothing here gates the console. Vault runs without an account — the link
 * back to the local ledger is not a courtesy, it is the honest description of
 * what the app does when nobody signs in.
 */

type Mode = "signin" | "signup";

export default function SignInPage() {
  const { status, signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unconfigured = status === "UNCONFIGURED";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    let message: string | null;
    try {
      message =
        mode === "signin"
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, displayName.trim());
    } catch (cause) {
      // Without this the button stays disabled with no explanation and the
      // only way out of the form is a reload.
      message = cause instanceof Error ? cause.message : "Something went wrong. Try again.";
    } finally {
      setBusy(false);
    }

    if (message) {
      setError(message);
      return;
    }
    if (mode === "signup") {
      // Whether a confirmation email is required is a project setting, so the
      // copy covers both rather than asserting one. If the project confirms
      // accounts on creation there is already a session, and the effect below
      // navigates instead -- which is why this does not claim the account is
      // waiting to be signed in to.
      setNotice(
        "Account created. If this project requires email confirmation, follow the link sent to you, then sign in.",
      );
      setMode("signin");
      return;
    }
    navigate("/organisation");
  };

  // A project that auto-confirms signs the account in as it creates it. That
  // arrives as a status change rather than a return value, and without this
  // it left a signed-in person sitting on the sign-in form being told to sign
  // in.
  useEffect(() => {
    if (status === "SIGNED_IN") navigate("/organisation", { replace: true });
  }, [status, navigate]);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 py-6">
      <header className="text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand-ink">
          <Lock size={19} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-ink">
          {mode === "signin" ? "Sign in to Vault" : "Create a Vault account"}
        </h1>
        <p className="mx-auto mt-2 max-w-[38ch] text-[13.5px] leading-relaxed text-ink-muted">
          An account puts this browser's ledger into an organisation, where it can be shared,
          controlled by role, and — once written — no longer edited through the app.
        </p>
      </header>

      {unconfigured ? (
        <Card className="p-5">
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {BACKEND_UNCONFIGURED_MESSAGE}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-subtle">
            See <code className="font-mono text-[12.5px]">supabase/README.md</code> for the setup,
            which takes a project, one SQL file and two environment variables.
          </p>
          {/* A Link wearing the button's classes: Base UI's Button asserts a
              native <button> underneath, and this is navigation. */}
          <Link
            to="/monitor"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "mt-4 w-full text-sm",
            })}
          >
            Back to the console
          </Link>
        </Card>
      ) : (
        <Card className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="display-name">Name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  placeholder="Raghav K."
                  className="h-9 text-[13.5px]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="h-9 text-[13.5px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                // Only when choosing a password. Applying it to sign-in would
                // lock out any account whose password predates the rule.
                minLength={mode === "signup" ? 8 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="h-9 text-[13.5px]"
              />
              {mode === "signup" && (
                <p className="text-[11.5px] text-ink-subtle">At least 8 characters.</p>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-warning-line bg-warning-soft p-2.5 text-[13px] text-warning dark:border-warning/40">
                {error}
              </p>
            )}
            {notice && (
              <p className="rounded-lg border border-line bg-sunken p-2.5 text-[13px] text-ink-muted">
                {notice}
              </p>
            )}

            <Button type="submit" disabled={busy} className="h-9 w-full gap-2 text-sm">
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-4 border-t border-line pt-4 text-center text-[13px] text-ink-muted">
            {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              disabled={busy}
              className="font-medium text-brand-ink transition-colors hover:text-brand"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </Card>
      )}

      <p className="text-center text-[12.5px] text-ink-subtle">
        <Link to="/monitor" className="hover:text-ink-muted">
          Continue without an account
        </Link>{" "}
        — the console runs locally, and the ledger stays in this browser.
      </p>
    </div>
  );
}
