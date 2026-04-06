import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Input } from '../components/ui'
import { supabase } from '../lib/supabase'

type ClientRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  industry: string | null
  created_at: string
}

type ProjectCountRow = {
  client_id: string
}

const INDUSTRIES = [
  'Web & Digital', 'E-commerce', 'Immobilier', 'Industrie', 'Santé',
  'Education', 'Restauration', 'Mode & Luxe', 'Autre',
]

export function Clients() {
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<(ClientRow & { projectCount: number })[]>([])
  const [search, setSearch] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        navigate('/auth', { replace: true })
        return
      }

      const { data: agency } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (!agency?.id) {
        setLoading(false)
        return
      }

      const { data: clientRows } = await supabase
        .from('clients')
        .select('id, first_name, last_name, email, phone, company_name, industry, created_at')
        .eq('agency_id', agency.id)
        .order('created_at', { ascending: false })

      const all = (clientRows ?? []) as ClientRow[]
      if (!all.length) {
        setClients([])
        setLoading(false)
        return
      }

      const clientIds = all.map((c) => c.id)
      const { data: projectRows } = await supabase
        .from('projects')
        .select('client_id')
        .in('client_id', clientIds)

      const countMap = new Map<string, number>()
      for (const row of (projectRows ?? []) as ProjectCountRow[]) {
        if (row.client_id) countMap.set(row.client_id, (countMap.get(row.client_id) ?? 0) + 1)
      }

      setClients(all.map((c) => ({ ...c, projectCount: countMap.get(c.id) ?? 0 })))
      setLoading(false)
    }
    load()
  }, [navigate])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clients.filter((c) => {
      const matchSearch =
        !q ||
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.company_name ?? '').toLowerCase().includes(q)
      const matchIndustry = !industryFilter || c.industry === industryFilter
      return matchSearch && matchIndustry
    })
  }, [clients, search, industryFilter])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <Link to="/dashboard" className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]">← Dashboard</Link>

        <header className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--ink)]">Clients</h1>
          <Link to="/dashboard/new">
            <button
              type="button"
              className="rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 py-2.5 text-sm font-body font-medium text-[var(--white)] transition hover:brightness-95"
            >
              + Nouveau client
            </button>
          </Link>
        </header>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Rechercher par nom, email ou entreprise..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] focus:border-[var(--accent)] focus:outline-none"
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
          >
            <option value="">Tous les secteurs</option>
            {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <Card className="mt-8 flex flex-col items-center justify-center py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-soft)] text-2xl">
              👥
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-[var(--ink)]">
              {clients.length === 0 ? 'Aucun client' : 'Aucun résultat'}
            </h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              {clients.length === 0
                ? 'Créez un projet pour ajouter votre premier client.'
                : 'Essayez un autre filtre ou recherche.'}
            </p>
          </Card>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--white)]">
            <table className="w-full text-left text-sm font-body">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                  <th className="px-4 py-3 font-display font-semibold text-[var(--ink)]">Nom</th>
                  <th className="hidden px-4 py-3 font-display font-semibold text-[var(--ink)] sm:table-cell">Entreprise</th>
                  <th className="hidden px-4 py-3 font-display font-semibold text-[var(--ink)] md:table-cell">Email</th>
                  <th className="px-4 py-3 text-center font-display font-semibold text-[var(--ink)]">Projets</th>
                  <th className="hidden px-4 py-3 font-display font-semibold text-[var(--ink)] lg:table-cell">Créé le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-b border-[var(--border)] transition hover:bg-[var(--surface)]"
                    onClick={() => navigate(`/dashboard/client/${c.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-display font-bold text-[var(--white)]">
                          {c.first_name[0]?.toUpperCase()}{c.last_name[0]?.toUpperCase()}
                        </div>
                        <span className="font-medium text-[var(--ink)]">{c.first_name} {c.last_name}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-[var(--ink-muted)] sm:table-cell">{c.company_name ?? '—'}</td>
                    <td className="hidden px-4 py-3 text-[var(--ink-muted)] md:table-cell">{c.email}</td>
                    <td className="px-4 py-3 text-center text-[var(--ink)]">{c.projectCount}</td>
                    <td className="hidden px-4 py-3 text-[var(--ink-muted)] lg:table-cell">{new Date(c.created_at).toLocaleDateString('fr-FR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
