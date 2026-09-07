import { NavLink } from 'react-router-dom'

export function BottomNav() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium ${
      isActive ? 'text-teal-700' : 'text-stone-400'
    }`

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <NavLink to="/" className={linkClass} end>
        <span className="text-xl">🏝️</span>
        Trips
      </NavLink>
      <NavLink to="/upload" className={linkClass}>
        <span className="text-xl">📤</span>
        Upload
      </NavLink>
      <NavLink to="/add-link" className={linkClass}>
        <span className="text-xl">🔗</span>
        Link
      </NavLink>
      <NavLink to="/settings" className={linkClass}>
        <span className="text-xl">⚙️</span>
        Settings
      </NavLink>
    </nav>
  )
}
