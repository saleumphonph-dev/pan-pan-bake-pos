# Pan Pan Bake POS — Developer Onboarding

Read this file first before making any changes. It tells you everything about the project.

---

## What This App Is

A full Point-of-Sale (POS) system for **Pan Pan Bake**, a bakery in Laos.
Built with React 18 + Vite 5. No backend server — runs entirely in the browser.

**Owner:** P_sal (saleumphonph-dev)

---

## Live URLs

| | URL |
|---|---|
| Live app | https://saleumphonph-dev.github.io/pan-pan-bake-pos/ |
| GitHub repo | https://github.com/saleumphonph-dev/pan-pan-bake-pos |
| Supabase dashboard | https://supabase.com → project `bazhwlphoylyjnxqbdxf` |

---

## Local Setup

```bash
# Install dependencies
npm install

# Run locally (opens at http://localhost:3000)
npm run dev

# Build for production
npm run build
```

The project folder on the owner's Mac:
```
/Users/P_sal/Desktop/Pan Pan/Pan Pan Bake POS/PanPanBake_POS/
```

---

## Deployment

Hosted on **GitHub Pages**. Auto-deploys on every push to `main`:
```bash
git add .
git commit -m "your message"
git push origin main
# Live in ~60 seconds
```

The workflow file is at `.github/workflows/deploy.yml`.

> **Why GitHub Pages?** The Thai ISP blocks `*.vercel.app` and `*.netlify.app`
> via SNI filtering. `*.github.io` is not blocked.

---

## Login PINs

| Role | Lao Label | PIN |
|---|---|---|
| Owner | ເຈົ້າຂອງ | `556559` |
| Manager | ຜູ້ຈັດການ | `5555` |
| Cashier | ພະນັກງານ | `1234` |

To change PINs: search for `const ROLES` in `PanPanBake_POS.jsx`.

---

## Key Files

| File | Purpose |
|---|---|
| `src/PanPanBake_POS.jsx` | Entire app — all views, state, logic (~3000+ lines) |
| `src/lib/supabase.js` | Cloud sync functions (syncOrder, fetchSales, etc.) |
| `src/index.css` | Global styles + responsive breakpoints |
| `src/hooks/useWindowSize.js` | Viewport detection hook (mobile/tablet/desktop) |
| `vite.config.js` | Vite config — base path set to `/pan-pan-bake-pos/` |
| `public/manifest.json` | PWA manifest for Add to Home Screen |
| `.github/workflows/deploy.yml` | GitHub Actions auto-deploy pipeline |
| `.env` | Supabase keys (local only — never committed) |

---

## Architecture

```
Browser (React SPA)
  ├── localStorage  ← primary data store (works offline)
  └── Supabase      ← cloud sync (10s polling, fires on login)
```

- All data (sales, shifts, menu, settings) is saved to `localStorage` first
- On login and every 10 seconds, the app syncs with Supabase
- Cloud data wins on conflict; local-only rows (offline sales) are preserved
- This is how a sale on the cashier's tablet appears on the owner's Mac within ~10s

---

## App Views

| View key | What it is |
|---|---|
| `pos` | Main selling screen — product grid + cart |
| `history` | Past orders, void orders |
| `dashboard` | Revenue charts, top products (Recharts) |
| `shifts` | Open/close shift, cash counting |
| `admin` | Menu editor, settings, reset data |

View is controlled by `const [view, setView] = useState("pos")` in the App component.

---

## Layout / Responsive Design

Three layout modes controlled by the 📱📲💻 toggle in the nav bar:
- **Phone** (`mode === "phone"`) — fixed top bar + scrollable content + fixed bottom tab bar
- **Tablet** (`mode === "tablet"`) — left sidebar (70px) + split content area
- **Desktop** (`mode === "desktop"`) — left sidebar (70px) + wider content

Mode is saved to `localStorage` under key `"layoutMode"`. Default is `"auto"` (detects viewport).

> **Critical:** Layout switching uses two separate JSX return trees (phone vs tablet/desktop),
> NOT CSS class toggling. Do not revert to CSS-only layout switching — it caused nav button
> overflow bugs that were hard to fix.

---

## Cloud Sync (Supabase)

Environment variables needed (already set as GitHub Secrets for deploy):
```
VITE_SUPABASE_URL=https://bazhwlphoylyjnxqbdxf.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_vGZgP4q8UJZBhm-ZISIC4w_phyZNxGd
```

For local dev, create a `.env` file in the project root with these two lines.

Supabase tables: `sales`, `shifts`

---

## Known Gotchas / Things To Know

1. **Never define React components inside the App render body.**
   Doing so causes unmount/remount on every re-render (the polling sync triggers re-renders every 10s),
   which makes cart items disappear. Use JSX variables or define components outside App.

2. **CSS `!important` beats inline styles.** If you add a CSS rule with `!important` targeting
   a nav button, it will override the inline `width`/`height` styles and break the layout.
   Prefer inline styles for layout-critical sizing on nav buttons.

3. **Global button padding is reset to `0` in `index.css`** — this is intentional.
   Each button sets its own padding inline. Do not add global button padding back.

4. **The `base: '/pan-pan-bake-pos/'` in `vite.config.js` is required.**
   Without it, GitHub Pages will serve blank pages (assets 404).

5. **SPA routing on GitHub Pages** requires `dist/404.html` = `dist/index.html`.
   The deploy workflow does `cp dist/index.html dist/404.html` — do not remove this step.

---

## How To Make a Change

1. Open this folder in Claude Code
2. Tell Claude: *"Read ONBOARDING.md first"*
3. Describe what you want to change
4. Claude will edit the files
5. Test locally with `npm run dev`
6. Push: `git add . && git commit -m "your change" && git push origin main`
7. Wait ~60 seconds → live

---

## Build History (Summary)

| # | What was built |
|---|---|
| 1 | Core POS app — product grid, cart, shifts, sales history, dashboard, admin |
| 2 | Supabase cloud sync — real-time multi-device, 10s polling |
| 3 | GitHub Pages deployment — fixed Thai ISP TLS blocking issue |
| 4 | Production PINs set, demo hint removed from login |
| 5 | Owner-only Reset Test Data button (wipes sales/shifts, keeps menu) |
| 6 | Real-time sync + device-mode selector (📱📲💻) |
| 7 | Bug fix: cart items disappearing (inner component anti-pattern) |
| 8 | Bug fix: nav button overflow, qty button oval shape |
| 9 | PWA / Add to iPhone Home Screen (manifest + apple-touch-icon) |
| 10 | Numeric keypad for PIN input on mobile |
| 11 | Custom 🥐 croissant app icon (180/192/512px) |
