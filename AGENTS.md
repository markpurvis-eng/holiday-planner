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
  filled in; ordering just keeps improving. A booking's start/end time can
  now be corrected in-app via `EditBooking.tsx` (see below); the initial
  backfill of existing bookings happened via direct SQL through the
  Supabase connector (same as the `destination_lat`/`lng` backfill), and
  the `destination_lat`/`lng` fields themselves still have no in-app edit
  UI.

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
  reference/confirmation numbers, and `booking.extracted_details` (free text —
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
  **FX editor with a fixed foreign amount (28 Sep 2026)**: the
  manual-override affordance above originally only let Mark edit the rate
  — fine for a card that states its applied rate, but Halifax credit card
  statements show only the foreign-currency amount and the GBP amount
  actually charged, never the rate itself, so there was no way to enter
  what the statement actually says. First attempt let all three of
  foreign amount / rate / GBP be edited, with whichever field wasn't one
  of the two most-recently-touched getting recomputed — technically
  correct but had a rough edge (editing only one field on first open did
  nothing, since there was no second edited field yet to compute from,
  which read as broken) and covered a case (correcting the foreign
  amount) Mark pointed out doesn't actually happen — he always knows
  exactly what he paid in the foreign currency, so it should be fixed,
  not one of the variables. Simplified: `CostsTab.tsx`'s edit form now
  shows the foreign amount read-only and has just two editable fields,
  rate and GBP, each recalculating the other directly
  (`computeFxFromRate()`/`computeRateFromGbp()`) — no ordering/tracking
  needed, and no "nothing happens on the first edit" gap, since either
  field alone is always enough to derive the other against the fixed
  foreign amount. `src/lib/costs.ts`'s `setManualFx(line, { cost, rate })`
  (added in the three-field attempt, to let a Costs-tab edit correct the
  underlying foreign-currency amount too, not just its GBP conversion)
  is kept as-is for that reason, but this editor now always passes
  `line.cost` back unchanged.

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
  their free-text details expanded, defaulting to collapsed. `extracted_details`
  can run several lines, which was making every card that long regardless
  of whether the person wanted to read it right then. When expanded, shows
  `extracted_details` followed by `notes` (see below) if present, with a
  small "Notes" label between them so the two don't blend together.
  **Also surfaced `itinerary_item.extracted_details` for the first time**
  (renamed from `status` — see below) with the same toggle — that column
  existed in the data but was never rendered anywhere before this. Plain
  conditional rendering, no animation — a deliberately simpler mechanism
  than the auto-hiding-header attempt (tried and reverted, see the roadmap
  doc), since a card either shows its details paragraph or doesn't, with
  nothing to get wrong about scroll position or layout height in between.

- **`extracted_details` / `notes` split (renamed 16 Sep 2026)**: `booking`'s
  former `check_in_details` and `itinerary_item`'s former `status` were both
  renamed to `extracted_details`, for clearer provenance — this is text
  extracted from a confirmation/source document, not anything Mark writes
  himself. A separate, new `notes` column on each table holds personal
  annotations. Kept deliberately apart rather than one shared field: the
  Gmail/Drive ingestion design (see the roadmap doc, and
  `Holiday_App_Architecture_Notes.md`) will eventually write freshly
  re-extracted text straight into `extracted_details` — if a personal note
  lived in the same field, that write would risk silently clobbering it.
  `itinerary_item.status`'s original intent (it read more like a workflow
  status than narrative text) is now moot, since it's the same field as
  `extracted_details` and used the same way as booking's.

- **Edit bookings/itinerary items**: `src/pages/EditBooking.tsx` and
  `src/pages/EditItineraryItem.tsx` (routes `/edit-booking`, `/edit-itinerary-item`,
  both `?id=<uuid>&trip=<tripId>`) are the first in-app way to change a
  booking/itinerary item after creation — until now everything went in via
  the retired Claude-for-Excel workflow or direct SQL. Added
  `getBooking(id)`/`getItineraryItem(id)` single-record fetches to `api.ts`
  (only list fetches existed before). Each screen edits every field the
  type has, including the new `notes` field. **FX-lock safety**: if the
  currency changes, or `payment_status` moves away from `'paid'`, and the
  line already had a locked `fx_rate_to_gbp`, both are cleared on save
  rather than left stale — a locked rate only makes sense for the
  currency/settled-state it was locked against; the Costs tab will fetch
  and lock a fresh one next time it notices the line is paid. **Trip-lock
  warning, not a hard block**: if the trip's `total_cost_gbp` is already
  locked, a banner explains that cost/currency/payment-status edits here
  won't update the cached total automatically — editing non-cost fields
  (provider name, dates, notes) on a locked/archived trip is still fully
  allowed, since blocking those too would be more restrictive than
  necessary. Entry point: a small "Edit" link at the bottom of each
  booking/itinerary card in `TripDetail.tsx`.

- **"What's next" / at-a-glance card on the Dashboard**: `src/lib/nextUp.ts`
  exports `findNextUp(bookings, itinerary)`, which reuses
  `mergeItineraryTimeline()` (see above) to find the single nearest
  upcoming booking-marker/itinerary-item, rather than reimplementing
  ordering. "Upcoming" heuristic: a future-dated entry always counts; a
  today-dated entry counts if it has no time (can't tell whether it's
  passed, so it stays visible for the rest of the day rather than the
  card going blank first thing in the morning) or its time hasn't arrived
  yet. `Dashboard.tsx` finds whichever trip is currently underway by date
  range (`start_date <= today <= end_date`), not the stored `status`
  column, which can lag behind (same reasoning as the Upload/Add Link
  trip default) — fetches that one trip's bookings/itinerary separately
  from the trip list itself (`getTrips()` doesn't include them), and
  renders `src/components/NextUpCard.tsx` above the trip list when
  there's a next-up entry. Tapping it navigates to
  `/trips/:id?tab=<bookings|itinerary>&highlight=<id>`, the same
  tab+highlight contract `TripDetail.tsx`'s own booking-marker cards use.
  No card is shown when no trip is currently underway, or the underway
  trip has nothing left upcoming.

- **"+" pre-filled ad hoc expense from a Costs-tab card**: `CostLine`
  (`src/lib/costs.ts`) carries a `date` field (`booking.start_date` /
  `itinerary_item.date`) purely so `CostsTab.tsx` can build the pre-fill
  link — not used anywhere else. Each booking/itinerary line's own
  top-level card (not the nested/bundle rows inside an "Ad hoc items"
  group, and not the trip-level "🧾 Ad hoc expenses" bundle, which has no
  single parent to pre-fill against) gets a "+ Add expense" link to
  `/add-expense?trip=<id>&booking=<id>|itinerary=<id>&date=<line.date>`,
  hidden when `locked`. `AddExpense.tsx` reads those three params to set
  its initial attach mode/target/date — the Trip/Booking/Itinerary
  attach-mode picker still renders as normal and stays fully editable, in
  case the guess needs correcting. `initializedTripRef` in `AddExpense.tsx`
  stops the existing "reset attach mode on trip change" effect from
  wiping out the preset the instant `tripId` is first set from the URL —
  only a trip switch the person makes *after* landing on the page resets
  attach mode, same as before presets existed.

- **Long-press delete for Documents/Links and ad hoc expenses (Missing
  Features #6)**: `src/lib/useLongPress.ts` (generic touch+mouse long-press
  detection, 500ms, cancels on movement) and `src/components/LongPressMenu.tsx`
  (wraps any children, shows a bottom action sheet on long-press) are the one
  shared implementation. Wrapping a child that's an `<a>` suppresses the
  anchor's own click/navigation via a capturing click handler on the wrapper
  once a long-press has fired, so a long-press doesn't also navigate when the
  finger/mouse lifts. Wired into: `DocumentGroup.tsx` (Documents tab grid
  cards), the flat Links-tab card list in `TripDetail.tsx`, and every
  `AttachedItems.tsx` instance (booking cards, itinerary cards, Costs tab
  lines) via its new optional `onDeleteDocument`/`onDeleteLink` props. Ad hoc
  expense lines on the Costs tab (`CostsTab.tsx`) had the app's only
  previously-visible "Delete" button — that's now the same long-press gesture
  on the whole card instead, removed once a trip is locked (unchanged
  behaviour, just a different trigger). New `deleteDocument()`/`deleteLink()`
  in `api.ts`: `deleteDocument()` also best-effort removes the underlying
  Storage object (parsed back out of the public URL) rather than leaving it
  orphaned the way a raw-SQL row delete did (see the roadmap's Fixed #21).
  **Deliberately excluded**: bookings/itinerary items (no real delete exists
  for these at all, by design — see the roadmap for why) and Trip Types in
  Settings. **Not built in this pass**: re-pointing an attachment at a
  different Trip/Booking/Itinerary item — the roadmap's original ask
  mentioned this alongside delete, but it needs its own attach-mode-picker UI
  inside the action sheet and was descoped to ship delete first; worth
  revisiting as a fast-follow on the same `LongPressMenu`.
  **Mobile/desktop native-gesture collision (v1.25.1 → v1.25.2)**: the
  finger/mouse that triggers a long-press is often still down at that exact
  screen spot when the action sheet mounts underneath it. v1.25.1 fixed the
  originally-pressed card (`cloneElement` applying `user-select:none` etc.
  directly onto it, since a `display:contents` wrapper doesn't reliably
  propagate that to the actual touched element on Android Chrome), but left
  the sheet itself unprotected — Android was then selecting the sheet's own
  "Delete" text, and Chrome/Windows was firing its native right-click context
  menu against the sheet. Both turned out to be the same bug from two
  angles: v1.25.2 applies the same `user-select`/`-webkit-touch-callout`/
  `touch-action` styles plus an `onContextMenu` preventDefault to the sheet's
  overlay, panel, and every button.

- **Trip-scoped Search page (28 Sep 2026)**: `src/pages/Search.tsx` (route
  `/search`, new 6th `BottomNav` entry) added to solve "a lot of scrolling to
  find a specific cost" — Mark first asked about search on the Costs tab
  alone, then a fully app-wide search-everything view, before settling on
  this middle ground: one trip at a time, reachable from anywhere.
  **Scope, deliberately not app-wide**: a trip `<select>` (from `getTrips()`)
  defaults to whatever trip Search was opened from, reusing the same
  `?trip=`-from-URL-or-path convention `BottomNav` already uses for
  Upload/Link — no new "current trip" concept needed. Search only fetches
  that one trip's `getBookings()`/`getItinerary()`/`getExpenses()` once a
  trip is picked; there's still no aggregate "all trips" fetch anywhere in
  the app outside `AllCosts.tsx`'s own per-trip fan-out, and this doesn't
  add one. Filtering is plain client-side substring matching, live as you
  type (no debounce needed — it's synchronous over already-loaded arrays).
  **Three result sections**: Bookings (`provider_name`) and Itinerary
  (`venue`, falling back to `type`) match on title only, not
  `confirmation_ref`/`extracted_details`/`notes` (Mark's choice — keeps
  results scannable, and "quickly find a card" was about the title you'd
  recognise at a glance). Both link straight to
  `/trips/:id?tab=<bookings|itinerary>&highlight=<id>`, reusing the exact
  tab+highlight contract `NextUpCard`/the itinerary booking-markers already
  established — no new jump mechanism. **Costs reuses
  `buildCostLines()`/`buildExpenseCostLines()`/`groupCostLines()` from
  `costs.ts` directly** rather than re-deriving its own notion of a "cost
  card", so a search matches exactly what the Costs tab itself would show
  as one card: the line's own label, or any ad hoc expense nested under it
  (e.g. searching "hockey" surfaces the "Causeway pub" expense attached to
  a hockey booking/itinerary card) — the trip-level "Ad hoc expenses"
  bundle is searched the same way, matching on its own lines even though
  it has no single parent card. Only the specific expense labels that
  matched are shown under a card's result (not every expense attached to
  it), so an unrelated nested expense doesn't clutter an otherwise-relevant
  hit. **Scroll-to/highlight added same day (v1.27.1)**: initially shipped
  without this (Mark's choice, to ship the rest of Search first) — see
  Missing Features #58 for why it was tricky: `CostsTab.tsx` loads its
  `CostLine[]` asynchronously (`getExpenses`/`ensureLockedRates`/live FX
  rates), well after `TripDetail`'s own generic highlight-scroll effect
  (which clears `?highlight=` from the URL ~2.5s after *it* mounts) would
  have already tried and found nothing. `CostsTab` now takes its own
  `highlightKey` prop, captured once into local state (`activeHighlight`)
  on mount rather than read live from the prop, so it survives the
  parent's URL cleanup finishing before this tab's own data has. A new
  `id="item-<key>"` anchor on every top-level line card and the trip-level
  bundle card (never on an individual nested expense — a Search hit's
  `CostMatch.key` is always the containing card's key, whether the match
  came from the card's own label or an expense nested/bundled under it)
  means the target card is always present in the DOM regardless of
  collapse state, so expanding whatever group contains the actual match
  and scrolling to the target's own id can happen in the same effect pass
  — no two-pass "expand, wait a render, retry" needed. Highlight ring
  fades ~2.5s after the scroll actually happens (not from mount), matching
  the Bookings/Itinerary convention. `Search.tsx`'s Costs result links now
  carry `&highlight=<match.key>` instead of just `?tab=costs`.
  `APP_VERSION` bumped to v1.27.1.
  **Camera receipt title fixed to "Receipt" (28 Sep 2026)**: the
  "📷 Add receipt" flow's uploaded document previously defaulted its
  title to `file.name`, matching `Upload.tsx`'s own convention — fine
  there, since that flow can take a file with a meaningful existing name,
  but this input always takes a fresh phone-camera photo
  (`capture="environment"`), so `file.name` was always the camera's own
  long numeric filename (e.g. `IMG_20260928_...jpg`), never anything
  worth preserving. `CostsTab.tsx`'s `handleReceiptFileChange` now hardcodes
  `title: 'Receipt'` instead. `APP_VERSION` bumped to v1.27.2.

- **Editable document title/rename (28 Sep 2026)**: Missing Features #54 —
  a document's display title (`document.title`) can now be corrected after
  upload without re-uploading the file, e.g. fixing a generic "Receipt" or
  a camera's raw filename once it's actually useful to tell several apart
  in the Documents tab. New `updateDocument(id, { title })` in `api.ts`.
  Added a "Rename" action alongside the existing "Delete" to every
  `LongPressMenu` document usage — `DocumentGroup.tsx` (Documents tab grid)
  and every `AttachedItems.tsx` instance (booking/itinerary cards, Costs
  tab lines) — both components take a new optional `onRename`/
  `onRenameDocument` prop, following the same optional-callback pattern
  `onDelete`/`onDeleteDocument` already used. **Input mechanism**:
  `window.prompt()`, matching the existing `window.confirm()` used for
  delete on the same menu, rather than introducing a new modal component
  for one text field — pre-filled with the current title, clearing it
  back to empty stores `null` (falls back to the type label/"Document",
  same as an unset title always has). `APP_VERSION` bumped to v1.27.3.

- **Fixed dd/mm/yyyy date format app-wide, no Settings toggle (28 Sep 2026)**:
  Missing Features #33, simplified — Mark's call was one fixed UK-convention
  format everywhere rather than a device-default-vs-override Settings
  chooser. `format.ts`'s `formatDate(dateStr, opts?)` already had two
  behaviours depending on whether a caller passed `opts`: most call sites
  already pass `{ day: 'numeric', month: 'short'/'long' }` (e.g. "14 Sep"),
  which is unambiguous regardless of locale since the month is spelled out —
  those are untouched. The few bare `formatDate(dateStr)` calls (trip date
  range and booking start/end dates on `TripDetail.tsx`, booking/itinerary
  dates on `Search.tsx`) fell through to `toLocaleDateString(undefined)`,
  which renders a full numeric date in whatever format the device/browser
  locale dictates — `9/28/2026` on a US-locale device, `28/09/2026` on a
  UK one. `formatDate()` now builds the no-`opts` case manually as
  `dd/mm/yyyy`, so it's fixed regardless of device locale. **Also removed
  `shareItinerary.ts`'s own `formatDateDDMMYYYY()`** — a near-identical
  hand-rolled dd/mm/yyyy formatter that existed specifically because
  `formatDate()` used to be locale-dependent; now that `formatDate()`'s
  bare-call behaviour is the same fixed format, the PDF header calls
  `formatDate()` directly instead. `APP_VERSION` bumped to v1.27.4.

- **Local vs home time on itinerary items (28 Sep 2026)**: Missing Features
  #16 — a booking/itinerary-item time now shows a small home-equivalent
  ("09:30 UK") underneath it whenever the destination is in a different
  timezone, so a Vietnam/Canada trip doesn't leave you doing the maths
  yourself to work out what time it is back home. **No new schema/column**:
  rather than adding a `timezone` field (which would need another manual
  Supabase SQL step), `src/lib/timezone.ts`'s `resolveEntryTimezone()`
  derives it from coordinates that already exist —
  `booking.destination_lat`/`lng` or `itinerary_item.destination_lat`/`lng`
  for that specific leg of a multi-city trip, falling back to the trip's own
  single anchor point (`trip.destination_lat`/`lng`) — the exact same
  fields and fallback the weather feature already relies on
  (`findLocationForDate`/`findItineraryLocationForDate` in `weather.ts`).
  The `tz-lookup` package (new dependency, ~30KB gzipped, pure JS/offline —
  a static lat/lng-to-IANA-zone lookup table, no network call) turns
  coordinates into an IANA zone name; "home" is hardcoded as
  `Europe/London` rather than read from the device, so the label means the
  same thing whether Mark checks it from his UK phone before leaving or
  from the destination itself. `convertWallTime()` does the actual
  timezone maths — a two-pass DST-aware wall-clock conversion using
  `Intl.DateTimeFormat` offsets (no date library needed) — and returns a
  day offset too, so a time that lands on the previous/next day at home
  shows "(-1 day)"/"(+1 day)" rather than a bare time that looks wrong.
  `homeTimeLabel()` returns `null` outright when the resolved zone matches
  home, which is the common case today since most bookings/itinerary items
  have no coordinates backfilled at all yet (same limitation the weather
  feature already has — see "the `destination_lat`/`lng` fields
  themselves still have no in-app edit UI" above). Wired into three spots
  that already render a time: `TripDetail.tsx`'s Itinerary tab (both
  itinerary items and booking begin/end markers, via a shared
  `homeTimeFor()` helper), and the Dashboard's `NextUpCard` — arguably the
  single most useful spot for it, since that's the moment you're most
  likely to actually be confused about what time it is. `NextUpCard` now
  takes a `trip` prop (previously just `tripId`/`entry`) to have the
  fallback coordinates available. `APP_VERSION` bumped to v1.27.5.
  **Bug fix, same day (v1.27.6) — dropped the trip-level fallback
  entirely.** Mark reported the taxi-to-airport itinerary item and the
  outbound UK→Canada flight's own departure marker were both showing a
  Canada-equivalent time even though they're physically in the UK. Cause:
  `resolveEntryTimezone()`'s fallback to `trip.destination_lat`/`lng`
  (mirroring the weather feature's fallback) was applying the trip's
  overall destination to any booking/itinerary_item with no coordinates
  of its own — fine for weather (a wrong day's forecast is a minor miss),
  wrong here (an outright mislabelled time). Flights in particular are
  deliberately left with NO coordinates at all (see weather.ts's own
  comment — a single lat/lng can't represent both ends of a journey), so
  every flight's begin/end markers, and anything else uncoordinated,
  were silently inheriting the trip's destination timezone regardless of
  where that specific leg actually was. Fix: `resolveEntryTimezone()` no
  longer takes a `trip` argument or falls back to it at all — only an
  entry's own `destination_lat`/`lng` is used, so an uncoordinated entry
  now correctly shows no home-time label rather than a wrong one.
  `NextUpCard` no longer needs its `trip` prop either (reverted back to
  just `tripId`/`entry`, and `Dashboard.tsx`'s `nextUp` state back to not
  carrying the trip). **Trade-off accepted**: fewer labels appear overall
  now (an itinerary item genuinely at the destination but missing its own
  coordinates won't get one either) — deliberately fewer-but-correct over
  more-but-sometimes-wrong. `APP_VERSION` bumped to v1.27.6.

- **Shared `AttachModePicker`, and a latent cancelled-items bug fixed by
  adopting it (29 Sep 2026)**: `src/components/AttachModePicker.tsx` pulls
  the Trip/Booking/Itinerary-item "Attach to" toggle-plus-dropdown out of
  `Upload.tsx`, `AddLink.tsx`, and `AddExpense.tsx`, which had each grown
  their own near-identical copy. All three now render this one component.
  Doing so fixed a real bug that existed in all three copies: none of them
  filtered *cancelled* bookings/itinerary items out of the dropdown, so a
  new document/link/expense could be attached to a cancelled booking or
  itinerary item — which then never shows on the Costs tab at all
  (`buildCostLines()` excludes cancelled lines outright, not just via the
  "hide cancelled" display toggle) and, for a cancelled itinerary item, is
  visually struck through and easy to miss on the Itinerary tab too.
  `AttachModePicker` filters cancelled bookings/itinerary items out of both
  dropdowns; a `currentBookingId`/`currentItineraryItemId` prop keeps an
  *already*-selected item visible (labelled "(cancelled)") even if it's
  since been cancelled, so editing something already attached to one
  doesn't silently blank out the selection.

- **Edit Expense — full field edit + re-point at a different
  booking/itinerary item, Missing Features #55's other half (29 Sep
  2026)**: ad hoc expenses previously had no edit at all, only long-press
  Delete. `AddExpense.tsx` now doubles as Edit Expense via `?id=<uuid>`
  (same doubling pattern as `EditItineraryItem.tsx`) — every field
  (label/amount/currency/date paid) plus the attach-point (Trip/Booking/
  Itinerary item) is editable. Reachable via a new "Edit" long-press action
  on `CostsTab.tsx`'s expense lines, alongside the existing "Delete".
  Several non-obvious things had to be handled for re-pointing
  specifically, not just field edits:
  - **Costless new target**: the Costs tab only renders a card for a
    booking/itinerary item with a non-null `cost` — an expense nests under
    that card. Moving an expense onto a target that's never had a cost
    would make it vanish from the Costs tab entirely (still in the DB,
    just with nowhere to render). `ensureCostBearing()` (extracted from the
    zero-cost-backfill logic `AddExpense.tsx` already had for the *create*
    flow) now also runs against the *new* target on a re-point.
  - **Currency change re-locks the rate immediately** (not lazily, unlike
    bookings/itinerary items) — an expense is always "paid", so there's no
    later Costs-tab visit that would otherwise pick up an unlocked rate the
    way `ensureLockedRates()` does for bookings/itinerary items. Amount
    changes in the *same* currency leave the existing locked rate alone
    (same simplification the rest of the app already has: `fetchGbpRate()`
    only ever returns the latest rate, not a rate for a specific date, so
    there was never date-accurate historical locking to preserve here).
  - **Receipts follow the expense when it moves**: a receipt is linked to
    its specific expense via `document.expense_id` (independent of
    `booking_id`/`itinerary_item_id` on the document — see the ad hoc
    expenses section above), but those two fields are *also* kept in sync
    on the document row for the Documents tab's own grouping. New
    `repointExpenseDocuments()` in `api.ts` updates every document with
    that `expense_id` to carry the expense's new `booking_id`/
    `itinerary_item_id`, so a moved receipt doesn't end up showing
    correctly next to its expense in Costs but under the *wrong* group on
    the Documents tab.
  - **Orphaned zero-cost stub, flagged rather than auto-deleted**: moving
    the last expense off a booking/itinerary item that only had a cost
    because of the zero-cost-backfill trick leaves that card behind as an
    empty "£0.00 Paid" line with nothing nested under it. There's no column
    marking "this cost was synthetic" (a real, deliberately-entered £0.00
    GBP paid line with rate 1 would look identical), so
    `looksLikeBackfillStub()` in `AddExpense.tsx` is a heuristic — cost is
    exactly 0, currency GBP, paid, rate exactly 1, and (checked
    separately) no expenses remain attached to it after the move. When it
    matches, the save flow shows an inline prompt naming the now-empty
    booking/itinerary item and offering to clear its cost fields back to
    `null`, rather than silently deleting anything or silently leaving
    clutter behind.
  - Locked-trip banner (same wording pattern as `EditBooking`/
    `EditItineraryItem`) warns that amount/currency edits won't retroactively
    update the cached total, but explicitly notes that *moving* an expense
    to a different booking/itinerary item within the same trip doesn't
    affect the total at all (the Grand total sums every line regardless of
    which card it's nested under), so re-pointing is left fully available
    even on a locked trip.

- **Document/Link re-point, Missing Features #55 (29 Sep 2026)**: the
  other half of #55 — moving a Document or Link to a different Trip/
  Booking/Itinerary item without re-uploading/recreating it, descoped from
  the original long-press-delete build (Fixed #54) to ship delete first.
  New `src/components/MoveAttachmentModal.tsx` (a small modal, not a full
  page — always within the current trip, so unlike Upload/AddLink/
  AddExpense's version of `AttachModePicker` there's no Trip selector)
  wraps the same shared `AttachModePicker`. A "Move to…" long-press action
  sits alongside the existing Rename/Delete actions everywhere a document
  already has them (`DocumentGroup.tsx`, every `AttachedItems.tsx`
  instance) and alongside Delete everywhere a link does (`AttachedItems.tsx`,
  the flat Links-tab list in `TripDetail.tsx`). `TripDetail.tsx` owns one
  shared `movingAttachment` state (`{ kind: 'document' | 'link', item }` or
  `null`) and renders a single `MoveAttachmentModal` instance driven by it,
  rather than one modal per call site. New `updateLink()` in `api.ts`
  (didn't exist before — only `createLink`/`deleteLink` did); `updateDocument()`'s
  update type widened from title-only to also accept `booking_id`/
  `itinerary_item_id`. Neither accepts `trip_id` — a repoint always stays
  within the same trip.

- **Map pin data (schema v2, 1 Oct 2026)**: `booking` and `itinerary_item` each
  have `address` (text), `pin_lat` and `pin_lng`. These are deliberately separate
  from `destination_lat`/`lng`, which are a coarse per-city weather anchor
  (e.g. "Montreal") and would put pins in the wrong place if reused. Only
  place-like rows carry an address; flights, cruise ships, sea days, taxis,
  transfers and car hire are left null on purpose. The address is free text
  copied from the confirmation (or a searchable "Venue, City" string where the
  confirmation gave none). `scripts/geocode-pins.mjs` fills `pin_lat`/`pin_lng`
  from OpenStreetMap Nominatim: dry run by default, `--write` to save, and rows
  that only matched after dropping the venue name are held back unless
  `--include-fallback` is passed. It signs in with the household login
  (`GEOCODE_EMAIL`/`GEOCODE_PASSWORD` in the gitignored `.env`) so RLS applies as
  normal, and needs `NOMINATIM_CONTACT` because Nominatim's usage policy requires
  an identifying contact. Nominatim blocks automated fetches from cloud sandboxes,
  so geocoding has to run from the laptop. No edit-screen field or map UI exists
  yet; the Map tab (see next bullet) reads `pin_lat`/`pin_lng`.

- **Map tab and Dashboard swipe (v1.29.0)**: `src/components/MapTab.tsx` (Leaflet +
  OpenStreetMap tiles, no API key) is a trip tab after Itinerary, loaded with
  `React.lazy` so Leaflet only ships when the tab is opened. `src/lib/mapPins.ts`
  turns bookings/itinerary items that have `pin_lat`/`pin_lng` into pins; items
  at identical coordinates collapse into one marker with a count (every La Cala
  round shares one place), and tapping a marker lists its items, each with a
  "View →" that reuses `handleJumpTo()` to switch to the Bookings/Itinerary tab
  and highlight the card. A day-chip row filters pins: an itinerary item shows
  only on its own date, a booking on every day its start/end dates cover. The
  tapped pin's card opens as an overlay at the top of the map (not below it, where
  the fixed bottom nav hid it on a phone), scrolls internally for a place with
  many items, and the map is nudged (`panInside`) so the pin isn't under it.
  The map's height is measured to fill the space between its top edge and the
  bottom nav rather than a fixed share of the screen, so its bottom edge and the
  required OpenStreetMap attribution are never behind the nav; the wrapper is
  `isolate` so Leaflet's z-index 400-1000 panes can't poke through the sticky
  header or nav. Zoom buttons are bottom-right for the same reason. Markers
  are `L.divIcon`s, not Leaflet's default image icons, which break under Vite's
  asset handling. Respects the "hide cancelled" setting, not the payment filter.
  Tiles need a connection, so the map is blank offline (Missing Features #15).
  `TripCard.tsx`: swipe left (>= 60px, mostly horizontal) opens
  `/trips/:id?tab=map`. It uses Pointer Events (touch, pen and mouse drag),
  `touch-action: pan-y` so vertical scrolling still works, ignores gestures that
  start within 24px of either screen edge (Android's Back gesture), and
  suppresses the click that follows a completed swipe. Swipe inside a trip was
  deliberately not built: it clashes with panning the map and with horizontal
  scrolling of the tab bar and filter pills.

## Ready to build / open items

- The installable icon is SVG-only (see above) — a real PNG icon set is a good
  follow-up, not required for functionality.
