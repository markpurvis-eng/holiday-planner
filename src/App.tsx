import type { ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider, ProtectedRoute } from './lib/auth'
import { BottomNav } from './components/BottomNav'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TripDetail from './pages/TripDetail'
import Upload from './pages/Upload'
import AddLink from './pages/AddLink'
import Settings from './pages/Settings'

function Shell({ children }: { children: ReactNode }) {
  return (
    // overflow-x-hidden is a deliberate defensive guard: a flex child
    // anywhere in the tree missing min-w-0 can force the page wider than
    // the viewport (this bit TripDetail's itinerary cards — see
    // AttachedItems.tsx / TripDetail.tsx fixes), and mobile Safari/Chrome
    // are known to mishandle position: fixed/sticky when that happens —
    // BottomNav becomes only reachable by scrolling, sticky headers stop
    // sticking. Desktop browsers don't show the same breakage (plenty of
    // window width to absorb it), which is why this class of bug is easy
    // to miss without testing on an actual phone.
    <div className="min-h-screen overflow-x-hidden bg-[#fdf8f3]">
      {children}
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Shell>
                <Dashboard />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trips/:id"
          element={
            <ProtectedRoute>
              <Shell>
                <TripDetail />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <ProtectedRoute>
              <Shell>
                <Upload />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-link"
          element={
            <ProtectedRoute>
              <Shell>
                <AddLink />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Shell>
                <Settings />
              </Shell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
