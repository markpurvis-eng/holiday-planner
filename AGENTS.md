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
