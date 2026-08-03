import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { useAgencySession } from '../../contexts/AgencyContext'
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
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const { agency } = useAgencySession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState<ClientHit[]>([])
  const [recents] = useState<RecentProject[]>(() => getRecentProjects())

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!agency?.id) return

    const q = query.trim()
    if (q.length < 2) return

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data } = await supabase
          .from('clients')
          .select('id, first_name, last_name, email, company_name')
          .eq('agency_id', agency.id)
          .or(
            `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%`,
          )
          .limit(8)

        if (!cancelled) setClients((data ?? []) as ClientHit[])
      })()
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [agency?.id, query])

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  const visibleClients = query.trim().length < 2 ? [] : clients

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(13,15,20,0.55)]"
        aria-label="Fermer la palette"
        onClick={onClose}
      />
      <div className="relative mx-auto mt-[12vh] w-[min(100%-1.5rem,32rem)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)] shadow-2xl">
        <Command label="Palette de commandes">
          <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
            <NavIcon icon={NAV_ICONS.search} className="text-[var(--ink-muted)]" />
            <Command.Input
              value={query}
              onValueChange={(value) => {
                setQuery(value)
                if (value.trim().length < 2) setClients([])
              }}
              placeholder="Aller à… créer… chercher un client"
              className="h-12 w-full border-0 bg-transparent font-body text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
            />
            <kbd className="hidden rounded border border-[var(--border)] px-1.5 py-0.5 font-body text-[10px] text-[var(--ink-muted)] sm:inline">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center font-body text-sm text-[var(--ink-muted)]">
              Aucun résultat
            </Command.Empty>

            <Command.Group
              heading="Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
            >
              <Command.Item
                value={`créer ${NEW_PROJECT_NAV.label}`}
                onSelect={() => go(NEW_PROJECT_NAV.to)}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
              >
                <NavIcon icon={NEW_PROJECT_NAV.icon} className="text-[var(--accent)]" />
                {NEW_PROJECT_NAV.label}
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Navigation"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
            >
              {allNavigableDestinations()
                .filter((d) => d.id !== 'new-project')
                .map((item) => (
                  <Command.Item
                    key={item.id}
                    value={item.label}
                    onSelect={() => go(item.to)}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                  >
                    <NavIcon icon={item.icon} className="text-[var(--ink-muted)]" />
                    {item.label}
                  </Command.Item>
                ))}
            </Command.Group>

            {recents.length > 0 ? (
              <Command.Group
                heading="Projets récents"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--ink-muted)]"
              >
                {recents.map((project) => (
                  <Command.Item
                    key={project.id}
                    value={`projet ${project.name}`}
                    onSelect={() => go(`/dashboard/project/${project.id}`)}
                    className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
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
                  return (
                    <Command.Item
                      key={client.id}
                      value={`client ${name} ${client.email}`}
                      onSelect={() => go(`/dashboard/client/${client.id}`)}
                      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-2 font-body text-sm text-[var(--ink)] aria-selected:bg-[var(--accent-soft)]"
                    >
                      <span className="truncate">{name}</span>
                      <span className="ml-auto truncate text-xs text-[var(--ink-muted)]">
                        {client.email}
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
