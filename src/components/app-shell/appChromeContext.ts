import { useContext, createContext } from 'react'

export type NavTheme = 'dark' | 'light'

export type AppChromeContextValue = {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  navTheme: NavTheme
  setNavTheme: (theme: NavTheme) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  toggleCommand: () => void
}

export const AppChromeContext = createContext<AppChromeContextValue | null>(null)

export function useAppChrome() {
  const ctx = useContext(AppChromeContext)
  if (!ctx) {
    throw new Error('useAppChrome must be used within AppChromeProvider')
  }
  return ctx
}
