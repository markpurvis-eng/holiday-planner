# Holiday Planner

A mobile-first, installable PWA that acts as a trip companion for a family's holiday
bookings — trips, bookings, itineraries, documents (confirmations, photos, receipts,
guides), useful links, and to-dos, all in one place.

## Tech stack

- [Vite](https://vite.dev/) + [React](https://react.dev/) + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) (v4, via `@tailwindcss/vite`)
- [Supabase](https://supabase.com/) — Postgres database, auth, and storage
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — installable PWA with service worker
- [react-router-dom](https://reactrouter.com/) — client-side routing
- Deployed as a static site on [Netlify](https://www.netlify.com/)

## Running locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon
   (public) key:

   ```bash
   cp .env.example .env
   ```

3. Set up the database: open the Supabase SQL editor for your project and run the
   contents of [`supabase/schema.sql`](supabase/schema.sql) once. This creates all
   tables, seeds starter trip types, enables row-level security with a permissive
   policy for authenticated users, and creates the `documents` storage bucket. The
   script is idempotent (`create table if not exists`, `add column if not exists`),
   so it's also safe to re-run after pulling schema changes.

4. Create at least one user in Supabase Auth (Authentication → Users → Add user) —
   this app uses a single shared household login rather than per-user accounts.

5. Start the dev server:

   ```bash
   npm run dev
   ```

## Building / deploying

The site is a static build deployed to Netlify:

- Build command: `npm run build`
- Publish directory: `dist`

These are already configured in `netlify.toml`, along with a catch-all redirect so
client-side routing (react-router) works on Netlify. Set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` as environment variables in the Netlify site dashboard for
production builds (the `.env` file is not committed).

## Data model

See [`supabase/schema.sql`](supabase/schema.sql) for the full schema: `trip_type`,
`trip`, `booking`, `payment`, `itinerary_item`, `document`, `link`, and `todo`.

Documents and links can attach at three levels: the whole trip, a specific booking
(`booking_id`), or a specific itinerary item (`itinerary_item_id`) — e.g. a
screenshot of a restaurant confirmation attached to that one dinner reservation
rather than the trip as a whole.
