import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, Input } from '../components/ui'
import { supabase } from '../lib/supabase'

type ClientRecord = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  company_type: string | null
  siret: string | null
  vat_number: string | null
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_country: string | null
  website: string | null
  industry: string | null
  company_size: string | null
  notes: string | null
  created_at: string
}

type ProjectRow = {
  id: string
  client_name: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
}

export function ClientDetail() {
  const { id } = useParams()
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<ClientRecord>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    const load = async () => {
      const { data: c } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (c) {
        setClient(c as ClientRecord)
        setForm(c as ClientRecord)
      }

      const { data: p } = await supabase
        .from('projects')
        .select('id, client_name, status, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })

      setProjects((p ?? []) as ProjectRow[])
      setLoading(false)
    }
    load()
  }, [id])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    const { error } = await supabase
      .from('clients')
      .update({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || null,
        company_name: form.company_name || null,
        company_type: form.company_type || null,
        siret: form.siret || null,
        vat_number: form.vat_number || null,
        address_street: form.address_street || null,
        address_city: form.address_city || null,
        address_postal_code: form.address_postal_code || null,
        address_country: form.address_country || null,
        website: form.website || null,
        industry: form.industry || null,
        company_size: form.company_size || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (!error) {
      setClient({ ...client, ...form } as ClientRecord)
      setEditing(false)
    }
    setSaving(false)
  }

  const set = (key: keyof ClientRecord, val: string) => setForm((prev) => ({ ...prev, [key]: val }))

  const initials = client
    ? `${(client.first_name?.[0] ?? '').toUpperCase()}${(client.last_name?.[0] ?? '').toUpperCase()}`
    : '?'

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement...</p>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <Link to="/dashboard/clients" className="text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]">← Clients</Link>
          <p className="mt-4 text-sm font-body text-[var(--amber)]">Client introuvable.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link to="/dashboard/clients" className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]">← Clients</Link>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] font-display text-xl font-bold text-[var(--white)]">
            {initials}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[var(--ink)]">{client.first_name} {client.last_name}</h1>
            <p className="text-sm font-body text-[var(--ink-muted)]">{client.email}{client.phone ? ` · ${client.phone}` : ''}</p>
          </div>
          <div className="flex gap-2">
            {client.company_type && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-body font-medium text-[var(--accent)]">
                {client.company_type}
              </span>
            )}
            {client.industry && (
              <span className="rounded-full bg-[var(--surface-warm)] px-2.5 py-0.5 text-xs font-body text-[var(--ink-muted)]">
                {client.industry}
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Informations</h2>
              {!editing ? (
                <Button variant="secondary" onClick={() => setEditing(true)}>Modifier la fiche</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setEditing(false); setForm(client) }} disabled={saving}>Annuler</Button>
                  <Button onClick={handleSave} disabled={saving}>{saving ? 'Sauvegarde...' : 'Sauvegarder'}</Button>
                </div>
              )}
            </div>
            <div className="mt-4 space-y-3">
              {editing ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input placeholder="Prénom" value={form.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} />
                    <Input placeholder="Nom" value={form.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input type="email" placeholder="Email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
                    <Input type="tel" placeholder="Téléphone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
                  </div>
                  <Input placeholder="Entreprise" value={form.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} />
                  <Input placeholder="Site web" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
                  <Input placeholder="Rue" value={form.address_street ?? ''} onChange={(e) => set('address_street', e.target.value)} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input placeholder="CP" value={form.address_postal_code ?? ''} onChange={(e) => set('address_postal_code', e.target.value)} />
                    <Input placeholder="Ville" value={form.address_city ?? ''} onChange={(e) => set('address_city', e.target.value)} />
                    <Input placeholder="Pays" value={form.address_country ?? ''} onChange={(e) => set('address_country', e.target.value)} />
                  </div>
                  <textarea
                    placeholder="Notes"
                    value={form.notes ?? ''}
                    onChange={(e) => set('notes', e.target.value)}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-4 py-3 text-sm font-body text-[var(--ink)] placeholder-[var(--ink-muted)] focus:border-[var(--accent)] focus:outline-none"
                    rows={3}
                  />
                </>
              ) : (
                <dl className="space-y-2 text-sm font-body">
                  {client.company_name && <InfoRow label="Entreprise" value={client.company_name} />}
                  {client.phone && <InfoRow label="Téléphone" value={client.phone} />}
                  {client.website && <InfoRow label="Site web" value={client.website} />}
                  {client.siret && <InfoRow label="SIRET" value={client.siret} />}
                  {client.vat_number && <InfoRow label="TVA" value={client.vat_number} />}
                  {(client.address_street || client.address_city) && (
                    <InfoRow
                      label="Adresse"
                      value={[client.address_street, client.address_postal_code, client.address_city, client.address_country].filter(Boolean).join(', ')}
                    />
                  )}
                  {client.company_size && <InfoRow label="Taille" value={client.company_size} />}
                  {client.notes && <InfoRow label="Notes" value={client.notes} />}
                  <InfoRow label="Créé le" value={new Date(client.created_at).toLocaleDateString('fr-FR')} />
                </dl>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Projets ({projects.length})</h2>
              <Link to={`/dashboard/new?clientId=${client.id}`}>
                <Button variant="secondary">Nouveau projet</Button>
              </Link>
            </div>
            {projects.length === 0 ? (
              <p className="mt-4 text-sm font-body text-[var(--ink-muted)]">Aucun projet pour ce client.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/dashboard/project/${p.id}`}
                      className="flex items-center justify-between rounded-[var(--radius-sm)] border border-[var(--border)] p-3 transition hover:border-[var(--accent)]"
                    >
                      <div>
                        <p className="text-sm font-body font-medium text-[var(--ink)]">{p.client_name}</p>
                        <p className="text-xs font-body text-[var(--ink-muted)]">{new Date(p.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <Badge variant={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-[var(--ink-muted)]">{label}</dt>
      <dd className="text-[var(--ink)]">{value}</dd>
    </div>
  )
}
