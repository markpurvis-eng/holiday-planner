# AGENTS.md

## Architecture

Holiday Planner is a client-only Vite + React + TypeScript single-page app, deployed
as a static site on Netlify. There are no Netlify Functions and no Netlify DB —
all backend needs (database, auth, file storage) are served by an existing Supabase
project, per an explicit user requirement. The frontend talks to Supabase directly
from the browser using the public anon key (`@supabase/supabase-js`), relying on
Postgres row-level security for access control rather than a server-side API layer.

Routing is client-side (`react-router-dom`), so `netlify.toml` includes a catch-all
`/* -> /index.html` redirect. The app is registered as an installable PWA via
`vite-plugin-pwa` (autoUpdate service worker, web manifest with standalone display).

## Key directories

- `src/lib/` — `supabaseClient.ts` (client init), `auth.tsx` (AuthContext +
  ProtectedRoute), `types.ts` (data model types), `api.ts` (CRUD helpers per table),
  `format.ts` (currency formatting — see "Currency-aware money display" below)
- `src/pages/` — one file per route: Login, Dashboard, TripDetail, Upload, AddLink,
  Settings
- `src/components/` — shared presentational pieces: TripCard, BottomNav, TabBar,
  DocumentGroup, LoadingSpinner
- `supabase/schema.sql` — hand-written SQL schema, RLS policies, and storage bucket
  setup. Must be run manually in the Supabase SQL editor; nothing in this repo can
  execute it automatically (see "Non-obvious decisions" below). Written to be
  idempotent so it's safe to re-run after pulling schema changes.

## Conventions

- No comments in code unless something is genuinely non-obvious.
- Single shared auth account for the whole household — there is no per-user data
  ownership, so RLS policies are permissive (`FOR ALL TO authenticated USING (true)`)
  rather than scoped by `auth.uid()`.
- Data access goes through `src/lib/api.ts` helper functions, not ad-hoc
  `supabase.from(...)` calls scattered through components.
- Mobile-first layout: a single max-width column with a fixed bottom nav
  (Trips / Upload / Link / Settings), Tailwind utility classes only, no CSS modules.

## Non-obvious decisions

- **Supabase instead of Netlify DB**: the user has an existing Supabase project they
  want to keep using for auth/DB/storage. Netlify DB / Drizzle was explicitly ruled
  out for this project even though it's the more typical Netlify-native path.
- **Schema not applied automatically**: only a Supabase anon (public) key was
  provided, not a service-role key or Supabase CLI access token, so migrations
  cannot be run from this environment. `supabase/schema.sql` is written to be
  idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`) and must be pasted into the Supabase SQL editor once by
  a human with dashboard access.
- **SVG-only app icon**: without a headless canvas/image library available, PNG
  icon generation wasn't practical. The manifest instead ships a single 512x512 SVG
  icon (`public/icon.svg`) reused for both `any` and `maskable` purposes. Chrome/
  Android generally accept SVG manifest icons for installability, but a real PNG
  icon set (192/512, proper maskable safe-zone padding) would be a worthwhile
  follow-up for pixel-perfect install prompts across all platforms.
- **Currency-aware money display**: `booking.cost` and `itinerary_item.cost` are
  bare `numeric` columns with no currency column on the itinerary side and a
  `booking.currency` column (default `'GBP'`) added after the initial release.
  `src/lib/format.ts` exports `formatMoney(amount, currency?)`, which maps a
  currency code to a symbol (£/$/€/etc.), falls back to a suffix format for
  currencies where a prefix symbol reads oddly (e.g. `1,234 VND` rather than
  `VND1,234`), and falls back to showing the raw currency code for anything
  unrecognized rather than silently assuming GBP. Always use this helper for
  displaying money — never hardcode a currency symbol.
- **Document/Link attachment levels**: both `document` and `link` can attach at
  the trip level, the booking level (`booking_id`), or the itinerary-item level
  (`itinerary_item_id`) — e.g. a restaurant confirmation screenshot attached to
  that one dinner reservation rather than the whole trip. The Upload and AddLink
  pages fetch the selected trip's bookings and itinerary items and expose an
  "Attach to" choice (Whole trip / A booking / An itinerary item) with a dependent
  dropdown. Exactly one of `booking_id` / `itinerary_item_id` is set at a time
  (never both); `trip_id` is always set regardless, so the trip's Documents/Links
  tabs keep showing everything for that trip.
- **Upload file type filter is per document-type**: the file `accept` attribute in
  Upload.tsx is keyed by the selected document type (`ACCEPT_BY_TYPE` in
  `src/pages/Upload.tsx`) — `photo` stays image-only (and hints the mobile camera
  via `capture="environment"`), while `confirmation` / `receipt` / `guide` also
  accept PDFs and Word docs, since those are just as likely to arrive as a PDF or
  `.docx` as a screenshot.

- **Bookings on the Itinerary tab, with time-of-day precision**:
  `src/lib/itineraryTimeline.ts` exports `mergeItineraryTimeline()`, the one
  canonical place that turns a booking's start/end dates into synthesized
  "begins"/"ends" timeline entries, interleaved chronologically with real
  `itinerary_item` rows. `Booking` stays the single source of truth for its
  own dates — nothing gets written into `itinerary_item`. Used by both
  `TripDetail.tsx`'s Itinerary tab (renders booking markers as small
  tap-to-jump cards that switch to the Bookings tab and highlight the
  underlying booking) and `shareItinerary.ts`'s `buildDayGroups()` (re-groups
  the same merged timeline by day and formats it to PDF text lines) — one
  merge, two presentations. Booking markers respect the "hide cancelled"
  setting but not the payment-status filter (a "trip begins" marker isn't a
  cost line the way itinerary items with a cost are).
  **`booking.start_time`/`end_time`** (nullable `time` columns, added
  alongside the existing `start_date`/`end_date`) hold the time-of-day when
  known. The sort in `mergeItineraryTimeline()` is a hybrid: an entry with a
  known time sorts chronologically alongside every other timed entry that
  day, regardless of kind (a booking end at 11:00 correctly sorts before a
  same-day booking start at 14:00). An entry with no known time falls back
  to a placeholder position — booking-start before the day's timed entries,
  booking-end after — since most existing bookings don't have a time
  backfilled yet. No further schema or sort-logic change needed as times get
  filled in; ordering just keeps improving. There's currently no in-app UI
  for editing a booking's start/end time — backfilling happens via direct
  SQL through the Supabase connector (same as the `destination_lat`/`lng`
  backfill).

- **Share itinerary (public PDF)**: `src/lib/shareItinerary.ts` builds a
  date-only day-grouped merge of a trip's non-cancelled bookings and
  itinerary items (booking start/end dates become "begins"/"ends" markers on
  their respective days; cancelled bookings and itinerary items are omitted
  entirely, not struck through) and renders it client-side to a PDF with
  `jspdf`. The PDF is uploaded to the public `itineraries` Storage bucket at
  a **stable per-trip path** (`<trip-id>.pdf`), so regenerating overwrites in
  place and any previously-shared link keeps working — `upsert: true` on the
  storage upload is required for this, unlike the random-path pattern used
  for `documents`. `trip.public_itinerary_generated_at` (null until first
  generated) gates whether the Share button appears in `TripDetail.tsx`.
  Deliberately excluded from the PDF: cost, currency, payment_status,
  reference/confirmation numbers, and `booking.check_in_details` (free text —
  could contain anything). The Share button uses the Web Share API where
  available, falling back to copying the link to the clipboard.
  **Bundle-size note**: `jspdf`'s default ES bundle unconditionally pulls in
  `html2canvas` + DOMPurify (~250KB gzipped) for its `.html()` plugin, which
  this feature never calls — a real cost on a mobile PWA, worth revisiting
  (e.g. `pdf-lib`, or a lighter jsPDF entry point) if install size becomes a
  problem.

- **Documents/Links grouped by attachment point**: `src/lib/attachmentGroups.ts`
  exports `buildAttachmentGroups()`, a small generic helper (works on
  `Document[]` or `Link[]`, since both share `booking_id`/`itinerary_item_id`)
  that splits a trip's documents/links into "Trip-level", one group per
  booking that has attachments, and one group per itinerary item that has
  attachments — rather than the flat, type-only list the Documents/Links
  tabs showed before. Each non-trip-level group carries an `onJump` callback
  that switches tabs and highlights the underlying booking/itinerary card
  (reuses the same `handleJumpTo()` the Itinerary tab's booking markers use).
  Documents still get their existing type-subgrouping (`DocumentGroup`)
  within each attachment group; Links don't have a type, so each group is
  just its own flat card list.

- **Costs tab, GBP roll-up**: `src/lib/fx.ts` (`fetchGbpRate()`, cached
  per-currency for the page's lifetime) wraps Frankfurter
  (`api.frankfurter.dev/v2/rate/{base}/{quote}`, free, no key). `src/lib/costs.ts`
  builds a unified `CostLine[]` from non-cancelled, cost-bearing bookings and
  itinerary items, and implements the confirmed rate-locking design: once a
  line is paid, its GBP rate is fetched once and stored
  (`fx_rate_to_gbp`/`fx_rate_locked_at` on both `booking` and
  `itinerary_item`) so the figure never recalculates; outstanding lines show
  a live "≈" rate fetched at render time. **Adaptation from the original
  design**: "lock the moment a line flips to paid" assumes an edit event to
  hook — there's no in-app edit screen yet (Missing Features #20), so
  `ensureLockedRates()` does the equivalent job lazily instead, locking any
  paid-but-unlocked line the first time the Costs tab notices it. This
  naturally covers the "archive safety net" from the design too, since
  archived trips go through the same check rather than needing separate
  handling. `src/components/CostsTab.tsx` renders Paid/Outstanding sections
  plus a Grand total, and a small inline rate-edit affordance per line for
  the manual-override case (a currency Frankfurter doesn't cover, or Mark's
  card's actual applied rate).

- **Total Costs dashboard, across all trips**: `src/pages/AllCosts.tsx`
  (route `/costs`, its own bottom-nav entry) lists every trip — active and
  archived, via the same unfiltered `getTrips()` — as a collapsible section.
  Deliberately collapsed by default and only rendered once expanded: mounting
  `CostsTab` triggers its lock-any-paid-but-unlocked-line pass (FX fetches +
  DB writes), so this avoids doing that for every trip on every visit, not
  just the ones actually being reviewed. Reuses `CostsTab` per trip rather
  than duplicating the Paid/Outstanding/Grand-total rendering — one component,
  used both per-trip (in `TripDetail`) and across all trips (here).
  **Receipt photo upload**: `CostsTab` now takes a `tripId` prop and a
  "📷 Add receipt" button per cost line, using the existing
  `uploadDocumentFile()`/`createDocument()` (type `receipt`, attached to the
  underlying booking/itinerary item) — the same infrastructure the
  Upload page and `AttachedItems` already use, so an uploaded receipt shows
  up everywhere those already surface attachments (the Documents tab's
  attachment groups, the booking/itinerary card itself). This page doesn't
  build its own receipts gallery on top of that.

- **Ad hoc expenses (tips, souvenirs, taxis, etc.)**: a new `expense` table
  (RLS matches every other table — `allow all for authenticated`), separate
  from `booking`/`itinerary_item` since these are recorded *after* they're
  paid, not planned then settled later — no outstanding/unpaid state, and
  the FX rate is locked at entry time (fetched immediately on save) rather
  than on a later transition. `src/pages/AddExpense.tsx` mirrors
  `AddLink.tsx`'s attach-mode picker (Trip / Booking / Itinerary item,
  trip-level by default) plus label/amount/currency/date-paid fields.
  `src/lib/costs.ts`'s `buildExpenseCostLines()` folds them into the same
  `CostLine[]` model `CostsTab` already uses for bookings/itinerary items —
  they always land in the Paid section, tagged with an "Ad hoc" badge to
  distinguish them at a glance. Deletable outright (unlike bookings/
  itinerary items) since they're user-entered app-native data with no
  external source to stay in sync with. The existing receipt-upload button
  works on expense lines too, but falls back to a trip-level attachment
  (an expense has no `document`/`link` attachment point of its own) —
  fine for now, but a known imprecision if expenses accumulate many
  receipts each.

- **Locked trip total cost, shown on the Dashboard card**: `trip.total_cost_gbp`/
  `total_cost_locked_at` (nullable — only set once Mark says a trip is
  complete). `TripCard.tsx` shows it whenever non-null, alongside the
  countdown badge. Deliberately **not** a live/computed-on-render figure —
  the whole point is showing a trip's cost with zero extra DB overhead
  (`getTrips()` already selects `*`, so this comes back for free) and a
  guarantee it won't shift once a trip is done. **Currently a
  conversational/manual operation, not an in-app action**: when Mark says
  a trip is locked in, the procedure is:
  1. Query all non-cancelled cost lines for the trip (`booking`,
     `itinerary_item`, `expense`), same shape as `buildCostLines()`/
     `buildExpenseCostLines()` in `src/lib/costs.ts`.
  2. Confirm every cost-bearing line (`cost`/`amount` not null) is
     `payment_status = 'paid'` (or an expense, which is always paid) **and**
     has `fx_rate_to_gbp` set. If anything's outstanding or unlocked, don't
     lock — say so rather than caching a partial figure. (An unlocked-but-
     paid line means Mark hasn't opened that trip's Costs tab since — that
     visit is what triggers `ensureLockedRates()` — so ask him to do that
     first, or fetch the missing rate(s) directly if reachable.)
  3. Sum `cost * fx_rate_to_gbp` across every line, write it to
     `total_cost_gbp`, stamp `total_cost_locked_at = now()`, and set
     `trip.status = 'past'` if it isn't already.
  If an expense gets added to an already-locked trip later, redo this same
  check-and-lock pass for that trip rather than leaving the cached total
  stale. **`CostsTab` takes a `locked` prop** (passed as
  `trip.total_cost_locked_at != null` from both `TripDetail` and
  `AllCosts`) that makes the whole tab read-only once true: hides "+ Add an
  ad hoc expense", hides the Delete button on expense lines, and replaces
  the per-line rate-edit affordance with plain read-only text — anything
  that could silently change the cached total is disabled, not just the
  one thing that was reported. Receipt upload stays enabled either way,
  since it doesn't affect the total. `AllCosts.tsx`'s collapsed trip row
  also shows the locked total next to the status, matching `TripCard`.
  **Bundling small ad hoc items**: `costs.ts`'s `groupCostLines()` is a
  pure display transform on top of the flat `CostLine[]` — it doesn't
  change what Paid/Outstanding/Grand total sum over, only how the Costs
  tab renders it. An expense attached to a booking/itinerary item nests
  under that line's own card as a collapsible "Ad hoc items" sub-total;
  every trip-level expense (attached to neither) collects into one
  collapsible "🧾 Ad hoc expenses" bundle card instead of N flat rows. The
  nested "Ad hoc items" toggle+list renders as trailing content *inside*
  the same card as its parent line (`renderLine()` takes an optional
  `extra` node for this), not a second box stacked underneath — nested
  child lines use a `variant: 'plain'` row (no shadow/ring of their own)
  rather than looking like mini-cards nested inside a card. **Persistent
  receipt indicator**: the "📷 Add receipt" flow originally only showed a
  transient "Receipt attached ✓" message for the rest of that session —
  once you navigated away, there was no trace anything was attached.
  `CostsTab` now fetches `Document[]` for the trip alongside everything
  else, and renders `AttachedItems` (the same component the Bookings/
  Itinerary tabs use) on every booking/itinerary_item line, matching by
  `booking_id`/`itinerary_item_id`. A newly-uploaded receipt is also
  pushed into local state immediately, so it appears without needing a
  reload. Uploaded receipts default their `title` to the file name,
  matching `Upload.tsx`'s own convention (previously left `null`, showing
  as a generic "Document"). **`document.expense_id`** (new column, added
  alongside `booking_id`/`itinerary_item_id`, which stay set too so the
  Documents tab's existing attachment grouping — which only knows about
  booking/itinerary attachment, not expenses — keeps working unchanged)
  links a receipt to the *specific* ad hoc expense it belongs to, not just
  the parent it's attached to. This is what lets a booking/itinerary
  line's own `AttachedItems` exclude expense-linked receipts (they'd
  otherwise show twice) while each ad hoc expense's own row shows just its
  receipt via `documents.filter(d => d.expense_id === line.id)` — and it
  fully resolves the earlier "trip-level expense receipts have nowhere
  unambiguous to show" limitation, since the link no longer depends on
  booking/itinerary attachment at all. **Zero-cost
  backfill**: if an expense attaches to a booking/itinerary item with no
  cost of its own (e.g. tipping the guide on a free walking tour),
  `AddExpense.tsx` gives that line a nominal `cost: 0, currency: 'GBP',
  payment_status: 'paid'` (rate pre-locked to 1) before creating the
  expense — otherwise there'd be no card for it to nest under, since the
  Costs tab only shows cost-bearing lines.

- **`schema.sql` audit (16 Sep 2026)**: found and fixed real drift beyond
  what earlier notes flagged — `booking.cancelled`/`destination_*`/
  `fx_rate_*`, the equivalent `itinerary_item` columns, and the entire
  `expense` table had been added live via direct migrations across this
  session but never backported to this file (a gap in my own process, not
  inherited). Also fixed a real ordering bug: the `start_time`/`end_time`
  ALTER statements sat *before* `create table booking`, which would fail
  on a fresh database. Reconciled the whole file column-by-column against
  `information_schema.columns` rather than patching just the one thing
  that prompted the check. **Found but unexplained**:
  `document.drive_file_id`/`storage_path`/`migrated_at` exist live but
  aren't created by anything in this repo or mentioned anywhere in this
  file — added to `schema.sql` as a faithful mirror of what's live, but
  their origin and purpose are unknown. Ask Mark before relying on or
  removing them.

- **Collapsible "details" text on Booking/Itinerary cards**: `expandedDetails`
  (a `Set<string>` keyed by booking/itinerary_item id — both are UUIDs from
  separate tables, so one Set safely covers either) tracks which cards have
  their free-text details expanded, defaulting to collapsed. Booking's
  `check_in_details` can run several lines, which was making every card
  that long regardless of whether the person wanted to read it right then.
  **Also surfaced `itinerary_item.status` for the first time** with the
  same toggle — that column existed in the data but was never rendered
  anywhere before this. Plain conditional rendering, no animation — a
  deliberately simpler mechanism than the auto-hiding-header attempt
  (tried and reverted, see the roadmap doc), since a card either shows its
  details paragraph or doesn't, with nothing to get wrong about scroll
  position or layout height in between.

## Ready to build / open items

- The installable icon is SVG-only (see above) — a real PNG icon set is a good
  follow-up, not required for functionality.
- The Documents/Links tabs on TripDetail still group everything by document type
  only (a flat, trip-wide index) rather than distinguishing trip-level items from
  booking/itinerary-attached ones. That distinction IS surfaced elsewhere though:
  `src/components/AttachedItems.tsx` renders, inline on each booking card
  (Bookings tab) and each itinerary item card (Itinerary tab), the documents/links
  whose `booking_id` / `itinerary_item_id` match that specific card — filtered
  client-side from the same `documents`/`links` arrays already fetched for the
  trip (no extra query). This was the actual point of the attachment feature:
  seeing what's attached to *that specific booking or reservation*, not just a
  flat unified list.
