# Vault — Cold-chain Integrity Console

A production-style, dark/light-ready console for monitoring a vaccine cold-chain. It simulates a live temperature corridor locally (no sensor or hardware required), records every reading into an immutable, hashed ledger, and tracks a single shipment's box, batch, route and doses — from loading bay to last-mile handoff.

Built as a frontend prototype. Simulation runs entirely in the browser; shipment state persists to `localStorage`, and the ledger is verifiable and exportable.

## Stack

- **React 18** + **TypeScript 5**
- **Vite 6** with `@vitejs/plugin-react`
- **Tailwind CSS v4** + **shadcn/ui** (Base UI primitives)
- **react-router-dom v6** for routing
- **anime.js** for fluid, tasteful entrance/transition animations
- **lucide-react** for consistent iconography (no emoji/glyph hacks)
- **Geist** variable font, DM Sans / Space Mono fallbacks

## Getting started

```bash
npm install
npm run dev        # start Vite dev server
npm run build      # typecheck + production build
npm run lint       # eslint
npm run preview    # preview the production build
```

## Routes

| Route                | Page               | Purpose                                                       |
| -------------------- | ------------------ | ------------------------------------------------------------- |
| `/`                  | Landing            | Clean hero + VAULT preview + "WHY VAULT" feature cards         |
| `/monitor`           | Monitor            | Live temperature gauge, status, interactive history chart      |
| `/ledger`            | Ledger             | Append-only hashed table, search, copy hash, full trail, CSV   |
| `/shipment`          | Shipment overview  | One-box, one-batch record: field log meta + route corridor     |
| `/shipment/manage`   | Manage shipment    | The only place to mutate — edit, copy, handoff, new shipment   |
| anything else        | —                  | Redirects to `/shipment`                                       |

## How the simulation works

- A temperature reading is generated **every 2 seconds** within the **2–8 °C** corridor, clamped to **1.5–8.5 °C** so excursions can be exercised for testing.
- The live reading drives the Monitor gauge and the interactive history chart (hover a dot for the precise °C).
- Status flips to **EXCURSION** whenever the reading leaves 2–8 °C and back to **SAFE** inside it.
- Readings persist to `localStorage` under **`vault:fieldLog`**; the shipment log, batch and chart reset on **New Shipment**.
- Dark/light preference is saved under **`vault:theme`** (system default on first run).
- Press **`⌘K` / `Ctrl+K`** anywhere to open the command palette; use the **help (?) icon** for a 60-second tour.

## Architecture

```
src/
  App.tsx                  App shell: SaaS header, command palette, help dialog, layout + theme
  main.tsx                 Router setup
  styles.css               Tailwind v4 + Vault theme tokens (light/dark) + reusable classes
  context/ColdChainContext Cold-chain state: live temp, status, field-log meta, actions
  pages/
    LandingPage.tsx
    MonitorPage.tsx
    LedgerPage.tsx
    ShipmentPage.tsx
    ShipmentManagePage.tsx
  components/
    LoadingScreen.tsx      Premium app load-in
    ui/                    shadcn/ui primitives (button, card, dialog, input, badge, …)
  lib/                     Utilities (e.g. cn/class-merge)
```

## Design language

- Calm, confident and readable — not flashy. No rotating orbits or hype; clarity first.
- **Readable typography throughout**: no minuscule 7px labels; micro-labels are 10px+, body/cards 12–16px, headings large but restrained.
- Consistent `--teal` / `--safe` color tokens that flip cleanly between light and dark.
- All controls are real components (Buttons, Cards, Badges, Dialogs) — nothing hand-rolled or amateur.

## What was implemented recently

- **Production SaaS header** — sticky blurred bar with brand mark + PROTOTYPE pill, centered segmented pill nav, search / `⌘K` command palette, live-status chip, theme + notification + help group, account block, and a dedicated mobile nav row.
- **Premium loading screen** — animated mark, shimmer + spring, seamless hand-off into the app in both themes.
- **Readable, user-friendly pages** — landing, monitor, ledger and shipment overview rebuilt as production SaaS layouts instead of floating amateur cards.
- **Functional interactivity** — Shipment page is fully CRUD via the Manage workspace (copy / handoff / new shipment, persisted), the ledger opens a full trail dialog with search + CSV export, and the monitor chart is interactive.
- **App-wide typography scale-up** — bumped every font size and icon by a consistent factor; the smallest visible text is now a legible 10px with no clipping or overflow.
- **Layout hygiene** — removed dead space inside the shipment FIELD LOG card so the two-column layout is clean and balanced.