/** Route auth callback vers signup (invitation) ou reset-password (recovery). */
export function resolveAuthCallbackPath(search: string, hash: string): '/signup' | '/reset-password' | null {
  const searchParams = new URLSearchParams(search)
  const hashParams = new URLSearchParams(hash.replace(/^#/, ''))
  const type = searchParams.get('type') ?? hashParams.get('type')

  if (type === 'invite' || type === 'signup') return '/signup'
  if (type === 'recovery') return '/reset-password'

  const hasAuthCallback =
    searchParams.has('code') ||
    searchParams.has('token_hash') ||
    hashParams.has('access_token')

  if (!hasAuthCallback) return null

  // PKCE sans type explicite : invitation (recovery doit viser /reset-password dans redirectTo).
  return '/signup'
}

export function hasAuthCallback(search: string, hash: string): boolean {
  return resolveAuthCallbackPath(search, hash) !== null
}
