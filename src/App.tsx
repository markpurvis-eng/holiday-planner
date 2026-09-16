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
import AllCosts from './pages/AllCosts'
import AddExpense from './pages/AddExpense'

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fdf8f3]">
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
        <Route
          path="/costs"
          element={
            <ProtectedRoute>
              <Shell>
                <AllCosts />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-expense"
          element={
            <ProtectedRoute>
              <Shell>
                <AddExpense />
              </Shell>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  )
}
