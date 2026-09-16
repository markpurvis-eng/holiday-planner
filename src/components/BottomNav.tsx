import { NavLink, useLocation } from 'react-router-dom'

export function BottomNav() {
  const location = useLocation()
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium ${
      isActive ? 'text-teal-700' : 'text-stone-400'
    }`

  // Carries the current trip context through to Upload/Add Link so it's
  // pre-selected there instead of defaulting to the first trip in the list.
  // Two sources, since either page can be "where we are": a trip page
  // itself (/trips/:id), or already being on Upload/Add Link with a
  // ?trip= param from getting here the same way a moment ago — without
  // this second check, Upload (which carries ?trip=) navigating to Link
  // would lose it, since /upload isn't a /trips/:id pathname.
  const tripFromPath = location.pathname.match(/^\/trips\/([^/]+)/)?.[1]
  const tripFromQuery = new URLSearchParams(location.search).get('trip')
  const currentTripId = tripFromPath ?? tripFromQuery
  const tripSuffix = currentTripId ? `?trip=${currentTripId}` : ''

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <NavLink to="/" className={linkClass} end>
        <span className="text-xl">🏝️</span>
        Trips
      </NavLink>
      <NavLink to={`/upload${tripSuffix}`} className={linkClass}>
        <span className="text-xl">📤</span>
        Upload
      </NavLink>
      <NavLink to={`/add-link${tripSuffix}`} className={linkClass}>
        <span className="text-xl">🔗</span>
        Link
      </NavLink>
      <NavLink to="/costs" className={linkClass}>
        <span className="text-xl">💰</span>
        Costs
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        <span className="text-xl">⚙️</span>
        Settings
      </NavLink>
    </nav>
  )
}
