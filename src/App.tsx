import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AgencySessionProvider, useAgencySession } from './contexts/AgencyContext'
import { AppChromeProvider } from './components/app-shell/AppChromeProvider'
import { RequireBillingAccess } from './components/billing/RequireBillingAccess'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MarketingPageTransition } from './components/layout/MarketingPageTransition'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { resolveAuthCallbackPath } from './lib/authCallbackRoute'
import { supabase } from './lib/supabase'
import { About } from './pages/About'
import { ComparisonDetail, ComparisonsHub } from './pages/Comparisons'
import { ClientPortal } from './pages/ClientPortal'
import { ConfirmEmail } from './pages/ConfirmEmail'
import { Dashboard } from './pages/Dashboard'
import { Demo } from './pages/Demo'
import { Faq } from './pages/Faq'
import { ForgotPassword } from './pages/ForgotPassword'
import { Landing } from './pages/Landing'
import { LegalNotice } from './pages/LegalNotice'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { TermsOfUse } from './pages/TermsOfUse'
import { NewProject } from './pages/NewProject'
import { NotFound } from './pages/NotFound'
import { ProjectDetail } from './pages/ProjectDetail'
import { ResetPassword } from './pages/ResetPassword'
import { Settings } from './pages/Settings'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { Templates } from './pages/Templates'
import { Clients } from './pages/Clients'
import { ClientDetail } from './pages/ClientDetail'
import { Integrations } from './pages/Integrations'
import { PortalPreview } from './pages/PortalPreview'
import { Pricing } from './pages/Pricing'

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

  return isAuthenticated ? <Outlet /> : <Navigate to="/signin" replace />
}

function BillingGateOutlet() {
  const { loading, agency } = useAgencySession()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </div>
    )
  }

  return (
    <RequireBillingAccess agencyId={agency?.id ?? null}>
      <Outlet />
    </RequireBillingAccess>
  )
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

function AppRoot() {
  const location = useLocation()
  const host = typeof window !== 'undefined' ? window.location.hostname : ''

  if (host === 'app.freli.fr') {
    const authPath = resolveAuthCallbackPath(location.search, location.hash)
    if (authPath) {
      return <Navigate to={`${authPath}${location.search}${location.hash}`} replace />
    }

    return <Navigate to={`/signin${location.search}${location.hash}`} replace />
  }

  return <LandingEntry />
}

function LandingEntry() {
  const location = useLocation()
  const hash = location.hash.replace(/^#/, '')
  const hashParams = new URLSearchParams(hash)
  const searchParams = new URLSearchParams(location.search)

  const hasRecoverableInviteSignal =
    searchParams.has('code') ||
    searchParams.has('token_hash') ||
    searchParams.get('type') === 'invite' ||
    hashParams.has('access_token') ||
    hashParams.get('type') === 'invite' ||
    hashParams.get('error_code') === 'otp_expired' ||
    (hashParams.has('error') && hashParams.has('access_token')) ||
    (searchParams.has('error') && searchParams.has('code'))

  if (hasRecoverableInviteSignal) {
    return <Navigate to={`/signup${location.search}${location.hash}`} replace />
  }

  return <Landing />
}

function App() {
  return (
    <ErrorBoundary>
      <ScrollToTop />
      <Routes>
      <Route element={<MarketingPageTransition />}>
        <Route path="/" element={<AppRoot />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/a-propos" element={<About />} />
        <Route path="/faq" element={<Faq />} />
        <Route path="/tarifs" element={<Pricing />} />
        <Route path="/comparatifs" element={<ComparisonsHub />} />
        <Route path="/vs/:slug" element={<ComparisonDetail />} />
        <Route path="/mentions-legales" element={<LegalNotice />} />
        <Route path="/confidentialite" element={<PrivacyPolicy />} />
        <Route path="/conditions-utilisation" element={<TermsOfUse />} />
      </Route>
      <Route element={<RedirectIfAuthenticated />}>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>
      <Route path="/signup" element={<SignUp />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/confirm" element={<ConfirmEmail />} />
      <Route path="/auth" element={<Navigate to="/signin" replace />} />
      <Route element={<RequireAuth />}>
        <Route element={<AgencySessionProvider><Outlet /></AgencySessionProvider>}>
        <Route
          element={
            <AppChromeProvider>
              <BillingGateOutlet />
            </AppChromeProvider>
          }
        >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/dashboard/new" element={<NewProject />} />
        <Route path="/dashboard/project/:id" element={<ProjectDetail />} />
        <Route path="/dashboard/settings" element={<Settings />} />
        <Route path="/dashboard/templates" element={<Templates />} />
        <Route path="/dashboard/clients" element={<Clients />} />
        <Route path="/dashboard/client/:id" element={<ClientDetail />} />
        <Route path="/dashboard/integrations" element={<Integrations />} />
        </Route>
        </Route>
      </Route>
      <Route path="/p/:token" element={<ClientPortal />} />
      <Route path="/portal-preview" element={<PortalPreview />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </ErrorBoundary>
  )
}

export default App
