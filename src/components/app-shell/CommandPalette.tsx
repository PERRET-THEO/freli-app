import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { useAgencySession } from '../../contexts/AgencyContext'
import { commandItemValue } from '../../lib/commandPaletteValues'
import { getRecentProjects, type RecentProject } from '../../lib/recentProjects'
import { supabase } from '../../lib/supabase'
import { useAppChrome } from './appChromeContext'
import { allNavigableDestinations, NAV_ICONS, NEW_PROJECT_NAV } from './navConfig'
import { NavIcon } from './NavIcon'

type ClientHit = {
  id: string
  first_name: string
  last_name: string
  email: string
  company_name: string | null
  siret: string | null
}

type ProjectHit = {
  id: string
  name: string | null
  client_name: string | null
}

type SearchAgencyResult = {
  clients?: ClientHit[] | null
  projects?: ProjectHit[] | null
}

function normalizeMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function matchesQuery(haystack: string, query: string): boolean {
  if (!query) return true
  return normalizeMatch(haystack).includes(normalizeMatch(query))
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const { agency } = useAgencySession()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<ClientHit[]>([])
  const [projects, setProjects] = useState<ProjectHit[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchSettled, setSearchSettled] = useState(false)
  const [selected, setSelected] = useState('')
  const [recents] = useState<RecentProject[]>(() => getRecentProjects())
  const requestIdRef = useRef(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!agency?.id) return

    const q = query.trim()
    if (q.length < 2) {
      requestIdRef.current += 1
      setClients([])
      setProjects([])
      setSearchLoading(false)
      setSearchSettled(false)
      return
    }

    const requestId = ++requestIdRef.current
    setSearchLoading(true)
    setSearchSettled(false)

    const timer = window.setTimeout(() => {
      void (async () => {
        // RPC: unaccent + SIRET sans espaces (SECURITY INVOKER / RLS).
        const { data, error } = await supabase.rpc('search_agency', { p_query: q })

        if (requestId !== requestIdRef.current) return

        if (error) {
          setClients([])
          setProjects([])
        } else {
          const payload = (data ?? {}) as SearchAgencyResult
          setClients(Array.isArray(payload.clients) ? payload.clients : [])
          setProjects(Array.isArray(payload.projects) ? payload.projects : [])
        }
        setSearchLoading(false)
        setSearchSettled(true)
      })()
    }, 180)

    return () => {
      window.clearTimeout(timer)
    }
  }, [agency?.id, query])

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  const qTrim = query.trim()
  const searching = qTrim.length >= 2

  const navItems = useMemo(() => {
    return allNavigableDestinations()
      .filter((d) => d.id !== 'new-project')
      .filter((item) => matchesQuery(item.label, qTrim))
  }, [qTrim])

  const actionVisible = matchesQuery(`créer ${NEW_PROJECT_NAV.label}`, qTrim)
  const visibleRecents = useMemo(() => {
    return recents.filter((project) => matchesQuery(project.name, qTrim))
  }, [recents, qTrim])

  const visibleClients = searching && searchSettled ? clients : []
  const visibleProjects = searching && searchSettled ? projects : []

  const firstSelectableValue = useMemo(() => {
    if (actionVisible) return commandItemValue('action', NEW_PROJECT_NAV.id)
    if (navItems[0]) return commandItemValue('nav', navItems[0].id)
    if (visibleProjects[0]) return commandItemValue('project', visibleProjects[0].id)
    if (visibleRecents[0]) return commandItemValue('recent', visibleRecents[0].id)
    if (visibleClients[0]) return commandItemValue('client', visibleClients[0].id)
    return ''
  }, [actionVisible, navItems, visibleProjects, visibleRecents, visibleClients])

  useEffect(() => {
    setSelected(firstSelectableValue)
  }, [firstSelectableValue])

  const showEmpty =
    searching &&
    searchSettled &&
    !searchLoading &&
    !actionVisible &&
    navItems.length === 0 &&
    visibleProjects.length === 0 &&
    visibleRecents.length === 0 &&
    visibleClients.length === 0

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(13,15,20,0.55)]"
        aria-label="Fermer la palette"
        onClick={onClose}
      />
      <div className="relative mx-auto mt-0 flex h-dvh w-full max-w-none flex-col overflow-hidden bg-[var(--white)] shadow-2xl sm:mt-[12vh] sm:h-auto sm:max-h-[min(80dvh,40rem)] sm:w-[min(100%-1.5rem,32rem)] sm:rounded-[var(--radius-md)] sm:border sm:border-[var(--border)]">
        <Command
          label="Palette de commandes"
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 pt-safe sm:pt-0">
            <NavIcon icon={NAV_ICONS.search} className="text-[var(--ink-muted)]" />
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Aller à… créer… client, entreprise ou projet"
              className="h-12 w-full border-0 bg-transparent font-body text-base text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
            />
            <button
              type="button"
              onClick={onClose}
              className="touch-target flex items-center justify-center text-[var(--ink-muted)] sm:hidden"
              aria-label="Fermer"
            >
              ×
            </button>
            <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 font-body text-[10px] text-[var(--ink-muted)] sm:inline">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-none flex-1 overflow-y-auto overscroll-contain p-2 pb-[max(0.5rem,var(--safe-bottom))] sm:max-h-80 sm:pb-2">
            {searchLoading ? (
              <p className="px-3 py-3 font-body text-sm text-[var(--ink-muted)]" role="status">
                Recherche…
              </p>
            ) : null}

            {showEmpty ? (
              <p className="px-3 py-6 text-center font-body text-sm text-[var(--ink-muted)]">
                Aucun résultat pour « {qTrim} »
              </p>
            ) : null}

            {actionVisible ? (
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
              >
                <Command.Item
                  value={commandItemValue('action', NEW_PROJECT_NAV.id)}
                  onSelect={() => go(NEW_PROJECT_NAV.to)}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2.5 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                >
                  <NavIcon icon={NEW_PROJECT_NAV.icon} className="text-[var(--accent)]" />
                  {NEW_PROJECT_NAV.label}
                </Command.Item>
              </Command.Group>
            ) : null}

            {navItems.length > 0 ? (
              <Command.Group
                heading="Navigation"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
              >
                {navItems.map((item) => (
                  <Command.Item
                    key={item.id}
                    value={commandItemValue('nav', item.id)}
                    onSelect={() => go(item.to)}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2.5 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                  >
                    <NavIcon icon={item.icon} className="text-[var(--ink-muted)]" />
                    {item.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {visibleProjects.length > 0 ? (
              <Command.Group
                heading="Projets"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
              >
                {visibleProjects.map((project) => {
                  const label = project.name?.trim() || project.client_name || 'Projet'
                  return (
                    <Command.Item
                      key={project.id}
                      value={commandItemValue('project', project.id)}
                      onSelect={() => go(`/dashboard/project/${project.id}`)}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2.5 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                    >
                      <NavIcon icon={NAV_ICONS.project} className="text-[var(--ink-muted)]" />
                      <span className="truncate">{label}</span>
                      {project.client_name && project.name ? (
                        <span className="ml-auto truncate text-xs text-[var(--ink-muted)]">
                          {project.client_name}
                        </span>
                      ) : null}
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ) : null}

            {visibleRecents.length > 0 ? (
              <Command.Group
                heading="Projets récents"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
              >
                {visibleRecents.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={commandItemValue('recent', project.id)}
                    onSelect={() => go(`/dashboard/project/${project.id}`)}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2.5 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                  >
                    <NavIcon icon={NAV_ICONS.history} className="text-[var(--ink-muted)]" />
                    {project.name}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {visibleClients.length > 0 ? (
              <Command.Group
                heading="Clients"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
              >
                {visibleClients.map((client) => {
                  const name =
                    [client.first_name, client.last_name].filter(Boolean).join(' ') ||
                    client.company_name ||
                    client.email
                  const subtitle = [client.company_name, client.email].filter(Boolean).join(' · ')
                  return (
                    <Command.Item
                      key={client.id}
                      value={commandItemValue('client', client.id)}
                      onSelect={() => go(`/dashboard/client/${client.id}`)}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2.5 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                    >
                      <NavIcon icon={NAV_ICONS.client} className="shrink-0 text-[var(--ink-muted)]" />
                      <span className="truncate">{name}</span>
                      <span className="ml-auto truncate text-xs text-[var(--ink-muted)]">
                        {subtitle}
                      </span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}

export function CommandPalette() {
  const { commandOpen, setCommandOpen } = useAppChrome()
  if (!commandOpen) return null
  return <CommandPaletteDialog onClose={() => setCommandOpen(false)} />
}
