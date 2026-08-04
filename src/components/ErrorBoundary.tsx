import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from './ui'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-[var(--surface)] px-4">
          <Card className="max-w-md text-center">
            <h1 className="font-display text-xl font-bold text-[var(--ink)]">Une erreur est survenue</h1>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              Rechargez la page ou revenez à l&apos;accueil. Si le problème persiste, contactez le support.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button type="button" onClick={() => window.location.reload()}>
                Recharger
              </Button>
              <Link to="/dashboard">
                <Button type="button" variant="secondary" className="w-full sm:w-auto">
                  Retour au tableau de bord
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
