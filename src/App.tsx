import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import anime from "animejs";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  ChevronDown,
  CircleHelp,
  Database,
  HardDrive,
  Keyboard,
  Moon,
  Package,
  Search,
  Sun,
  Truck,
  TriangleAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { ColdChainProvider, useColdChain } from "@/context/ColdChainContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import LoadingScreen from "@/components/LoadingScreen";
import { useAnime } from "@/hooks/useAnime";
import {
  SEGMENT_INDICATOR,
  SEGMENT_MOVES,
  useSegmentedIndicator,
} from "@/hooks/useSegmentedIndicator";
import { LEDGER_INTERVAL_MS, SAMPLE_INTERVAL_MS, formatClock } from "@/lib/simulation";
import { formatEventLabel, type LedgerEntry } from "@/lib/ledger";
import { CHART_MIN_C, SAFE_MAX_C, SAFE_MIN_C } from "@/lib/chart";
import { fadeInUp, fadeOut, prefersReducedMotion } from "@/lib/motion";

/**
 * The prototype has no authentication. The operator block is clearly labelled
 * as demo data so it is never mistaken for a signed-in user.
 */
const DEMO_OPERATOR = {
  initials: "RK",
  name: "Raghav K.",
  role: "Demo operator",
} as const;

const NAV_ITEMS = [
  { to: "/monitor", label: "Monitor", icon: Activity },
  { to: "/ledger", label: "Ledger", icon: Database },
  { to: "/shipment", label: "Shipment", icon: Package },
] as const;

const PAGE_CONTAINER = "mx-auto w-full max-w-[1180px] px-5 sm:px-8";

// The active item's pill is drawn by the sliding indicator behind it, not by
// the item itself — otherwise two pills would exist during the transition.
// `relative z-10` keeps the label above that indicator.
function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    "relative z-10 inline-flex h-8 items-center gap-2 rounded-md px-3.5 text-[13.5px] font-medium transition-colors";
  return isActive ? `${base} text-ink` : `${base} text-ink-muted hover:text-ink`;
}

function mobileNavLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    "relative z-10 inline-flex h-8 flex-1 items-center justify-center gap-2 rounded-md text-[13.5px] font-medium transition-colors";
  return isActive ? `${base} text-ink` : `${base} text-ink-muted hover:text-ink`;
}

function notificationIcon(event: LedgerEntry["event"]) {
  if (event === "EXCURSION_OPEN" || event === "INVESTIGATION_OPEN") return TriangleAlert;
  if (event === "HANDOFF_INIT") return Truck;
  return ShieldCheck;
}

function NotificationsDialog({
  open,
  onOpenChange,
  entries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: LedgerEntry[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-line p-5">
          <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em]">
            Notifications
          </DialogTitle>
          <DialogDescription className="text-[13px] text-ink-muted">
            Corridor and handoff events, taken straight from the ledger.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[52vh] overflow-auto">
          {entries.length === 0 ? (
            <p className="p-5 text-[13px] text-ink-muted">
              Nothing yet. Excursions and handoffs will appear here as they are recorded.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((entry) => {
                const Icon = notificationIcon(entry.event);
                const isAlert = entry.event === "EXCURSION_OPEN" || entry.event === "INVESTIGATION_OPEN";
                return (
                  <li key={entry.hash} className="flex items-start gap-3 p-4">
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md ${
                        isAlert ? "bg-warning-soft text-warning" : "bg-success-soft text-success"
                      }`}
                    >
                      <Icon size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-ink">
                        {formatEventLabel(entry.event)}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
                        {entry.detail}
                      </p>
                      <p className="tabular mt-1 font-mono text-[11.5px] text-ink-subtle">
                        #{entry.sequence} · {formatClock(entry.at)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Headroom either side of the safe corridor. Derived rather than typed into the
 * copy, so the help text cannot drift away from the chart it describes.
 */
const CORRIDOR_HEADROOM_C = SAFE_MIN_C - CHART_MIN_C;

/** A keycap, sized to sit with 13px body text. */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11.5px] font-medium text-ink-muted">
      {children}
    </kbd>
  );
}

/** One help topic as a card — the same shell the landing page uses. */
function HelpSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-raised p-4">
      <div className="flex items-center gap-2.5">
        <Icon size={15} className="shrink-0 text-ink-subtle" aria-hidden="true" />
        <h3 className="text-[13.5px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:max-w-*` has to be respecified: the DialogContent primitive ships
          `sm:max-w-sm`, which quietly beat the unprefixed width this used to
          set and squeezed every paragraph into a six-word column. */}
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="flex-row items-start gap-3 border-b border-line px-5 py-4 pr-12">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
            <CircleHelp size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              How Vault works
            </DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              A local simulation — no sensor is attached and nothing leaves this browser.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* `min-h-0` lets the scroll region take whatever the flex column has
            left, instead of the fixed 58vh that stranded it mid-panel. */}
        <div className="scroll-slim min-h-0 flex-1 space-y-3.5 overflow-y-auto bg-surface p-4">
          <HelpSection icon={Activity} title="The simulation">
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              A temperature is generated every {SAMPLE_INTERVAL_MS / 1000} seconds inside the safe
              corridor, with headroom either side so excursions can be exercised. Status flips to{" "}
              <span className="font-medium text-ink">EXCURSION</span> the moment a reading leaves the
              corridor.
            </p>
            <dl className="mt-3.5 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {[
                { label: "Sample", value: `${SAMPLE_INTERVAL_MS / 1000} s` },
                { label: "Corridor", value: `${SAFE_MIN_C}–${SAFE_MAX_C} °C` },
                { label: "Headroom", value: `±${CORRIDOR_HEADROOM_C} °C` },
              ].map((fact) => (
                <div key={fact.label} className="bg-sunken px-3 py-2.5">
                  <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                    {fact.label}
                  </dt>
                  <dd className="tabular mt-1 font-mono text-[13px] font-medium text-ink">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </HelpSection>

          <HelpSection icon={Database} title="The ledger">
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
              Every {LEDGER_INTERVAL_MS / 1000} seconds the current reading is appended to a
              hash-chained ledger, as are shipment edits, excursions and handoffs. Each entry commits
              to its own contents and to the previous entry's digest, so the Ledger page can show
              whether any retained entry has been edited, removed or reordered.
            </p>
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning-soft p-3">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed text-ink-muted">
                <span className="font-medium text-ink">Tamper evidence, not tamper proofing.</span>{" "}
                The chain lives in this browser's storage with nothing signing it, so anyone able to
                write that storage could replace it wholesale.
              </p>
            </div>
          </HelpSection>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <HelpSection icon={HardDrive} title="What persists">
              <ul className="mt-2.5 space-y-2 text-[13px] leading-relaxed text-ink-muted">
                <li className="flex items-start gap-2">
                  <span
                    className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  <span>
                    Shipment record and ledger, saved to{" "}
                    <code className="font-mono text-[12.5px] text-ink">localStorage</code>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  <span>Theme preference.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span
                    className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-subtle"
                    aria-hidden="true"
                  />
                  <span>The live chart window does not — it restarts with the session.</span>
                </li>
              </ul>
            </HelpSection>

            <HelpSection icon={Keyboard} title="Shortcuts">
              <dl className="mt-2.5 space-y-3">
                <div>
                  <dt className="text-[13px] text-ink-muted">Command palette</dt>
                  <dd className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Kbd>⌘K</Kbd>
                    <span className="text-[11.5px] text-ink-subtle">or</span>
                    <Kbd>Ctrl K</Kbd>
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] text-ink-muted">Edit the shipment</dt>
                  <dd className="mt-1.5 font-mono text-[12px] text-ink-subtle">
                    Shipment → Manage
                  </dd>
                </div>
              </dl>
            </HelpSection>
          </div>
        </div>

        <div className="flex justify-end border-t border-line px-5 py-3.5">
          <Button onClick={() => onOpenChange(false)} className="h-9 px-5 text-sm">
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const commands = useMemo(
    () => [
      { label: "Go to Monitor", path: "/monitor", icon: Activity, keywords: "monitor temperature chart live" },
      { label: "Open Ledger", path: "/ledger", icon: Database, keywords: "ledger hash audit trail export" },
      { label: "Shipment overview", path: "/shipment", icon: Package, keywords: "shipment box batch route" },
      { label: "Manage shipment", path: "/shipment/manage", icon: Truck, keywords: "edit handoff new reset manage" },
    ],
    [],
  );

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter(
      (command) =>
        command.label.toLowerCase().includes(term) || command.keywords.includes(term),
    );
  }, [commands, query]);

  const go = useCallback(
    (path: string) => {
      navigate(path);
      onOpenChange(false);
      setQuery("");
    },
    [navigate, onOpenChange],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent className="max-w-[520px] gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Search and jump to a page.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={16} className="shrink-0 text-ink-subtle" aria-hidden="true" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches.length > 0) go(matches[0].path);
            }}
            placeholder="Jump to a page…"
            aria-label="Search commands"
            className="h-11 border-0 bg-transparent px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="p-2">
          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-muted">
              No command matches “{query}”.
            </p>
          ) : (
            matches.map((command) => (
              <button
                key={command.path}
                type="button"
                onClick={() => go(command.path)}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-sunken"
              >
                <command.icon size={15} className="text-ink-subtle" aria-hidden="true" />
                <span className="text-[13.5px] font-medium text-ink">{command.label}</span>
                <span className="ml-auto font-mono text-[12px] text-ink-subtle">{command.path}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Header({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  const { status, isMonitoring, unreadNotificationCount, notifications, markNotificationsRead } =
    useColdChain();
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Prefix match, mirroring NavLink's own default: /shipment/manage keeps the
  // Shipment segment active. The landing route matches nothing, and the
  // indicator hides rather than parking on an arbitrary item.
  const { pathname } = useLocation();
  const activeNav = NAV_ITEMS.find((item) => pathname.startsWith(item.to))?.to ?? "";
  const desktopNavRef = useRef<HTMLElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);
  const desktopNav = useSegmentedIndicator(desktopNavRef, activeNav);
  const mobileNav = useSegmentedIndicator(mobileNavRef, activeNav);

  // A single owner for ⌘K, so it can never stack a second dialog on top of an
  // open one. `event.key` is optional on some IME/Android events — guard it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (typeof event.key !== "string") return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      setHelpOpen(false);
      setNotificationsOpen(false);
      setCommandOpen((previous) => !previous);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const openNotifications = useCallback(() => {
    setNotificationsOpen(true);
    markNotificationsRead();
  }, [markNotificationsRead]);

  const liveState = !isMonitoring ? "paused" : status === "EXCURSION" ? "excursion" : "live";
  const liveLabel = liveState === "paused" ? "PAUSED" : liveState === "excursion" ? "EXCURSION" : "LIVE";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface shadow-e1 dark:bg-surface/85 dark:backdrop-blur-md">
      <div className={PAGE_CONTAINER}>
        <div className="grid h-16 grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1fr_auto_1fr]">
          {/* Brand */}
          <Link to="/" className="flex min-w-0 items-center gap-2.5 justify-self-start" aria-label="Vault home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-primary-foreground">
              <Package size={17} strokeWidth={2} aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-none">
              <span className="flex items-center gap-2">
                <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Vault</span>
                <span className="hidden rounded border border-line px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-subtle xl:inline">
                  Prototype
                </span>
              </span>
              <span className="mt-1 block truncate font-mono text-[11px] text-ink-subtle">
                Cold-chain 01
              </span>
            </span>
          </Link>

          {/* Primary nav */}
          <nav
            ref={desktopNavRef}
            className="relative hidden h-9 items-center gap-0.5 justify-self-center rounded-lg border border-line bg-sunken p-0.5 md:flex"
            aria-label="Primary"
          >
            <span
              aria-hidden="true"
              className={`${SEGMENT_INDICATOR} ${desktopNav.moves ? SEGMENT_MOVES : ""}`}
              style={desktopNav.indicatorStyle}
            />
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} data-segment={item.to} className={navLinkClass}>
                <item.icon size={15} aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-self-end">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden h-9 w-[190px] items-center gap-2 rounded-lg border border-line bg-raised px-2.5 text-left shadow-e1 transition-colors hover:border-line-strong lg:flex"
            >
              <Search size={15} className="shrink-0 text-ink-subtle" aria-hidden="true" />
              <span className="truncate whitespace-nowrap text-[13px] text-ink-subtle">Search</span>
              <span className="ml-auto shrink-0 whitespace-nowrap rounded border border-line px-1.5 font-mono text-[11px] leading-[18px] text-ink-subtle">
                ⌘K
              </span>
            </button>

            <span
              className="hidden h-9 items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-raised px-3 shadow-e1 sm:inline-flex"
              title="Local simulation — a reading every 2 seconds"
            >
              <span className="live-dot" data-state={liveState} />
              <span className="text-[12px] font-semibold tracking-[0.04em] text-ink">{liveLabel}</span>
              <span className="hidden font-mono text-[11.5px] text-ink-subtle 2xl:inline">
                local sim
              </span>
            </span>

            <div className="flex h-9 items-center rounded-lg border border-line bg-raised px-0.5 shadow-e1">
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleTheme}
                className="rounded-md text-ink-muted"
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
              </Button>
              {/* Purely visual spacing between three already-labelled icon
                  buttons. Base UI's Separator always sets role="separator" and
                  has no `decorative` opt-out, so hide it explicitly — otherwise
                  browse-mode users get two content-free stops. */}
              <Separator orientation="vertical" className="h-4" aria-hidden="true" />
              <Button
                variant="ghost"
                size="icon"
                onClick={openNotifications}
                className="relative rounded-md text-ink-muted"
                aria-label={
                  unreadNotificationCount > 0
                    ? `Notifications, ${unreadNotificationCount} unread`
                    : "Notifications"
                }
              >
                <Bell size={16} aria-hidden="true" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning ring-2 ring-raised" />
                )}
              </Button>
              {/* Purely visual spacing between three already-labelled icon
                  buttons. Base UI's Separator always sets role="separator" and
                  has no `decorative` opt-out, so hide it explicitly — otherwise
                  browse-mode users get two content-free stops. */}
              <Separator orientation="vertical" className="h-4" aria-hidden="true" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setHelpOpen(true)}
                className="rounded-md text-ink-muted"
                aria-label="How Vault works"
              >
                <CircleHelp size={16} aria-hidden="true" />
              </Button>
            </div>

            <div
              className="hidden items-center gap-2 border-l border-line pl-2 xl:flex"
              title="Demo account — this prototype has no authentication"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-sunken font-mono text-[12px] font-semibold text-ink-muted">
                {DEMO_OPERATOR.initials}
              </span>
              <span className="leading-none">
                <span className="block whitespace-nowrap text-[13px] font-medium text-ink">
                  {DEMO_OPERATOR.name}
                </span>
                <span className="mt-1 block whitespace-nowrap text-[11.5px] text-ink-subtle">
                  {DEMO_OPERATOR.role}
                </span>
              </span>
              <ChevronDown size={14} className="text-ink-subtle" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="border-t border-line bg-surface md:hidden">
        <nav
          ref={mobileNavRef}
          className={`${PAGE_CONTAINER} relative flex gap-1 py-2`}
          aria-label="Primary, mobile"
        >
          <span
            aria-hidden="true"
            className={`${SEGMENT_INDICATOR} ${mobileNav.moves ? SEGMENT_MOVES : ""}`}
            style={mobileNav.indicatorStyle}
          />
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} data-segment={item.to} className={mobileNavLinkClass}>
              <item.icon size={15} aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <NotificationsDialog
        open={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        entries={notifications}
      />
    </header>
  );
}

function Layout({ isDark, onToggleTheme }: { isDark: boolean; onToggleTheme: () => void }) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // One restrained fade per route change. Header chrome is deliberately not
  // animated — it persists, so animating it on every mount reads as noise.
  // Targets the <main> node directly via ref, never a CSS selector.
  useAnime(mainRef, fadeInUp, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Header isDark={isDark} onToggleTheme={onToggleTheme} />

      <main ref={mainRef} className={`${PAGE_CONTAINER} page-content flex-1 py-8`}>
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div
          className={`${PAGE_CONTAINER} flex flex-col gap-1 py-5 text-[12.5px] text-ink-subtle sm:flex-row sm:items-center sm:justify-between`}
        >
          <span>Vault — frontend prototype, local simulation.</span>
          <span className="font-mono">Build 0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // index.html has already applied the class before first paint; read it back
    // so React starts in agreement with the DOM.
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  // One piece of state, three stages. Two booleans that had to agree meant a
  // synchronous setState inside an effect to keep them in sync.
  const [loader, setLoader] = useState<"visible" | "fading" | "gone">("visible");

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", isDark);
    root.style.colorScheme = isDark ? "dark" : "light";
    try {
      window.localStorage.setItem("vault:theme", isDark ? "dark" : "light");
    } catch {
      // Storage unavailable — the theme still applies for this session.
    }
  }, [isDark]);

  const finishLoading = useCallback(() => {
    // This is the ONLY reason a reduced-motion viewer doesn't hang on the
    // splash screen forever: useAnime never starts the animation below when
    // reduced motion is on, so its `complete` callback — the other path to
    // "gone" — never fires. Going straight to "gone" here is not optional.
    setLoader(prefersReducedMotion() ? "gone" : "fading");
  }, []);

  const loadingScreenRef = useRef<HTMLDivElement>(null);

  // Gated on `loader === "fading"`, so this can't be expressed as a plain
  // `useAnime(ref, params, deps)` call — that hook always animates once its
  // ref resolves to a node, and the node exists (mounted) well before this
  // ever needs to fire. Ref-based like useAnime (never a selector), same
  // remove-before-run/cleanup contract, but with an explicit gate.
  useEffect(() => {
    if (loader !== "fading") return undefined;
    const node = loadingScreenRef.current;
    if (!node) return undefined;

    anime.remove(node);

    if (prefersReducedMotion()) {
      // Defensive only: `finishLoading` already routes reduced-motion
      // straight to "gone" without ever setting "fading", so this branch
      // should be unreachable. If it ever were reached, the node must not be
      // left invisible.
      anime.set(node, { opacity: 1 });
      return undefined;
    }

    anime({ ...fadeOut, targets: node, complete: () => setLoader("gone") });
    return () => anime.remove(node);
  }, [loader]);

  const toggleTheme = useCallback(() => setIsDark((previous) => !previous), []);

  return (
    <>
      {loader !== "gone" && <LoadingScreen ref={loadingScreenRef} onFinished={finishLoading} />}
      <ColdChainProvider>
        <Layout isDark={isDark} onToggleTheme={toggleTheme} />
      </ColdChainProvider>
    </>
  );
}
