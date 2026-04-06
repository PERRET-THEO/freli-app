import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { Auth } from './pages/Auth'
import { ClientPortal } from './pages/ClientPortal'
import { Dashboard } from './pages/Dashboard'
import { Demo } from './pages/Demo'
import { Landing } from './pages/Landing'
import { NewProject } from './pages/NewProject'
import { NotFound } from './pages/NotFound'
import { ProjectDetail } from './pages/ProjectDetail'
import { Settings } from './pages/Settings'
import { Templates } from './pages/Templates'
import { Clients } from './pages/Clients'
import { ClientDetail } from './pages/ClientDetail'
import { Integrations } from './pages/Integrations'

function RequireAuth() {
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setIsAuthenticated(Boolean(data.session))
      setLoading(false)
    })
    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/auth" replace />
}

function RedirectIfAuthenticated() {
  const [loading, setLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      setIsAuthenticated(Boolean(data.session))
      setLoading(false)
    })
    return () => {
      isMounted = false
    }
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </div>
    )
  }

  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Outlet />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/demo" element={<Demo />} />
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/auth" element={<Auth />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/new" element={<NewProject />} />
        <Route path="/dashboard/project/:id" element={<ProjectDetail />} />
        <Route path="/dashboard/settings" element={<Settings />} />
        <Route path="/dashboard/templates" element={<Templates />} />
        <Route path="/dashboard/clients" element={<Clients />} />
        <Route path="/dashboard/client/:id" element={<ClientDetail />} />
        <Route path="/dashboard/integrations" element={<Integrations />} />
      </Route>
      <Route path="/p/:token" element={<ClientPortal />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
