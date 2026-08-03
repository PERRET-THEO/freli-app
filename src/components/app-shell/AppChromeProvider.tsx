import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  NAV_THEME_COOKIE,
  SIDEBAR_COOKIE,
  SIDEBAR_COOKIE_MAX_AGE,
} from './navConfig'
import {
  AppChromeContext,
  type NavTheme,
} from './appChromeContext'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`
}

function readInitialCollapsed(): boolean {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-sidebar')
    if (attr === 'collapsed') return true
    if (attr === 'expanded') return false
  }
  return readCookie(SIDEBAR_COOKIE) === '1'
}

function readInitialTheme(): NavTheme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-nav-theme')
    if (attr === 'light' || attr === 'dark') return attr
  }
  const cookie = readCookie(NAV_THEME_COOKIE)
  return cookie === 'light' ? 'light' : 'dark'
}

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(readInitialCollapsed)
  const [navTheme, setNavThemeState] = useState<NavTheme>(readInitialTheme)
  const [commandOpen, setCommandOpen] = useState(false)

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value)
    document.documentElement.setAttribute('data-sidebar', value ? 'collapsed' : 'expanded')
    writeCookie(SIDEBAR_COOKIE, value ? '1' : '0')
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed)
  }, [collapsed, setCollapsed])

  const setNavTheme = useCallback((theme: NavTheme) => {
    setNavThemeState(theme)
    document.documentElement.setAttribute('data-nav-theme', theme)
    writeCookie(NAV_THEME_COOKIE, theme)
  }, [])

  const toggleCommand = useCallback(() => {
    setCommandOpen((open) => !open)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-sidebar', collapsed ? 'collapsed' : 'expanded')
    document.documentElement.setAttribute('data-nav-theme', navTheme)
  }, [collapsed, navTheme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((open) => !open)
        return
      }

      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '[') {
        event.preventDefault()
        setCollapsedState((prev) => {
          const next = !prev
          document.documentElement.setAttribute('data-sidebar', next ? 'collapsed' : 'expanded')
          writeCookie(SIDEBAR_COOKIE, next ? '1' : '0')
          return next
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed,
      navTheme,
      setNavTheme,
      commandOpen,
      setCommandOpen,
      toggleCommand,
    }),
    [
      collapsed,
      setCollapsed,
      toggleCollapsed,
      navTheme,
      setNavTheme,
      commandOpen,
      toggleCommand,
    ],
  )

  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>
}

