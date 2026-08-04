import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AgencySessionProvider, useAgencySession } from './contexts/AgencyContext'
import { AppChromeProvider } from './components/app-shell/AppChromeProvider'
import { RequireBillingAccess } from './components/billing/RequireBillingAccess'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MarketingPageTransition } from './components/layout/MarketingPageTransition'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { resolveAuthCallbackPath } from './lib/authCallbackRoute'
import { supabase } from './lib/supabase'
import { ConfirmEmail } from './pages/ConfirmEmail'
import { ForgotPassword } from './pages/ForgotPassword'
import { Landing } from './pages/Landing'
import { NotFound } from './pages/NotFound'
import { ResetPassword } from './pages/ResetPassword'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'

const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const Demo = lazy(() => import('./pages/Demo').then((m) => ({ default: m.Demo })))
const Faq = lazy(() => import('./pages/Faq').then((m) => ({ default: m.Faq })))
const Pricing = lazy(() => import('./pages/Pricing').then((m) => ({ default: m.Pricing })))
const ComparisonsHub = lazy(() =>
  import('./pages/Comparisons').then((m) => ({ default: m.ComparisonsHub })),
)
const ComparisonDetail = lazy(() =>
  import('./pages/Comparisons').then((m) => ({ default: m.ComparisonDetail })),
)
const LegalNotice = lazy(() =>
  import('./pages/LegalNotice').then((m) => ({ default: m.LegalNotice })),
)
const PrivacyPolicy = lazy(() =>
  import('./pages/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })),
)
const TermsOfUse = lazy(() =>
  import('./pages/TermsOfUse').then((m) => ({ default: m.TermsOfUse })),
)

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const NewProject = lazy(() =>
  import('./pages/NewProject').then((m) => ({ default: m.NewProject })),
)
const ProjectDetail = lazy(() =>
  import('./pages/ProjectDetail').then((m) => ({ default: m.ProjectDetail })),
)
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const Templates = lazy(() => import('./pages/Templates').then((m) => ({ default: m.Templates })))
const Clients = lazy(() => import('./pages/Clients').then((m) => ({ default: m.Clients })))
const ClientDetail = lazy(() =>
  import('./pages/ClientDetail').then((m) => ({ default: m.ClientDetail })),
)
const Integrations = lazy(() =>
  import('./pages/Integrations').then((m) => ({ default: m.Integrations })),
)
const ClientPortal = lazy(() =>
  import('./pages/ClientPortal').then((m) => ({ default: m.ClientPortal })),
)
const PortalPreview = lazy(() =>
  import('./pages/PortalPreview').then((m) => ({ default: m.PortalPreview })),
)

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--surface)]">
      <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
    </div>
  )
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>
}

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
    return <RouteFallback />
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/signin" replace />
}

function BillingGateOutlet() {
  const { loading, agency } = useAgencySession()

  if (loading) {
    return <RouteFallback />
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
    return <RouteFallback />
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
          <Route
            path="/demo"
            element={
              <LazyPage>
                <Demo />
              </LazyPage>
            }
          />
          <Route
            path="/a-propos"
            element={
              <LazyPage>
                <About />
              </LazyPage>
            }
          />
          <Route
            path="/faq"
            element={
              <LazyPage>
                <Faq />
              </LazyPage>
            }
          />
          <Route
            path="/tarifs"
            element={
              <LazyPage>
                <Pricing />
              </LazyPage>
            }
          />
          <Route
            path="/comparatifs"
            element={
              <LazyPage>
                <ComparisonsHub />
              </LazyPage>
            }
          />
          <Route
            path="/vs/:slug"
            element={
              <LazyPage>
                <ComparisonDetail />
              </LazyPage>
            }
          />
          <Route
            path="/mentions-legales"
            element={
              <LazyPage>
                <LegalNotice />
              </LazyPage>
            }
          />
          <Route
            path="/confidentialite"
            element={
              <LazyPage>
                <PrivacyPolicy />
              </LazyPage>
            }
          />
          <Route
            path="/conditions-utilisation"
            element={
              <LazyPage>
                <TermsOfUse />
              </LazyPage>
            }
          />
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
          <Route
            element={
              <AgencySessionProvider>
                <Outlet />
              </AgencySessionProvider>
            }
          >
            <Route
              element={
                <AppChromeProvider>
                  <BillingGateOutlet />
                </AppChromeProvider>
              }
            >
              <Route
                path="/dashboard"
                element={
                  <LazyPage>
                    <Dashboard />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/new"
                element={
                  <LazyPage>
                    <NewProject />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/project/:id"
                element={
                  <LazyPage>
                    <ProjectDetail />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/settings"
                element={
                  <LazyPage>
                    <Settings />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/templates"
                element={
                  <LazyPage>
                    <Templates />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/clients"
                element={
                  <LazyPage>
                    <Clients />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/client/:id"
                element={
                  <LazyPage>
                    <ClientDetail />
                  </LazyPage>
                }
              />
              <Route
                path="/dashboard/integrations"
                element={
                  <LazyPage>
                    <Integrations />
                  </LazyPage>
                }
              />
            </Route>
          </Route>
        </Route>
        <Route
          path="/p/:token"
          element={
            <LazyPage>
              <ClientPortal />
            </LazyPage>
          }
        />
        <Route
          path="/portal-preview"
          element={
            <LazyPage>
              <PortalPreview />
            </LazyPage>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
