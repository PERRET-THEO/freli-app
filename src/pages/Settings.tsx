import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Input } from '../components/ui'
import { supabase } from '../lib/supabase'

type AgencyRecord = {
  id: string
  name: string
  logo_url: string | null
  plan: string | null
}

export function Settings() {
  const [agency, setAgency] = useState<AgencyRecord | null>(null)
  const [agencyName, setAgencyName] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const loadSettings = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return
      setAccountEmail(userData.user.email ?? '')

      const { data: agencyData } = await supabase
        .from('agencies')
        .select('id, name, logo_url, plan')
        .eq('user_id', userData.user.id)
        .maybeSingle()

      if (agencyData) {
        setAgency(agencyData as AgencyRecord)
        setAgencyName(agencyData.name ?? '')
      }
    }

    loadSettings()
  }, [])

  const handleSaveAgency = async () => {
    setError(null)
    setMessage(null)
    if (!agency) {
      setError("Aucune agence n'a été trouvée.")
      return
    }

    let logoUrl = agency.logo_url
    if (logoFile) {
      const fileExt = logoFile.name.split('.').pop() || 'png'
      const filePath = `${agency.id}/logo-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, logoFile, { upsert: true })
      if (uploadError) {
        setError("Impossible d'uploader le logo.")
        return
      }
      const { data } = supabase.storage.from('logos').getPublicUrl(filePath)
      logoUrl = data.publicUrl
    }

    const { error: updateError } = await supabase
      .from('agencies')
      .update({ name: agencyName.trim(), logo_url: logoUrl })
      .eq('id', agency.id)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setAgency((current) => (current ? { ...current, name: agencyName.trim(), logo_url: logoUrl } : current))
    setMessage('Paramètres agence sauvegardés.')
  }

  const handleChangePassword = async () => {
    setError(null)
    setMessage(null)
    if (!password || password !== passwordConfirm) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      setError(passwordError.message)
      return
    }
    setPassword('')
    setPasswordConfirm('')
    setMessage('Mot de passe mis à jour.')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'SUPPRIMER') return
    setDeleting(true)
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm font-body text-[var(--ink-muted)] hover:text-[var(--accent)]"
        >
          ← Dashboard
        </Link>

        <div className="mt-4 space-y-4">
          <Card>
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">Mon agence</h2>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="Nom de l'agence"
                value={agencyName}
                onChange={(event) => setAgencyName(event.target.value)}
              />
              <label className="block text-sm font-body text-[var(--ink-soft)]">
                Logo de l&apos;agence
                <input
                  type="file"
                  accept="image/*"
                  className="mt-2 block w-full text-sm font-body"
                  onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <Button onClick={handleSaveAgency}>Sauvegarder</Button>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">Mon compte</h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">{accountEmail}</p>
            <div className="mt-4 space-y-3">
              <Input
                type="password"
                placeholder="Nouveau mot de passe"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <Input
                type="password"
                placeholder="Confirmer le mot de passe"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
              <Button onClick={handleChangePassword}>Changer le mot de passe</Button>
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">Mon abonnement</h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              Plan actuel : {agency?.plan ?? 'starter'}
            </p>
            <Button variant="secondary" className="mt-4" disabled>
              Passer au Pro — Bientôt disponible
            </Button>
          </Card>

          <Card>
            <h2 className="font-display text-2xl font-semibold text-[var(--ink)]">
              Signature électronique
            </h2>
            <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
              Vos contrats sont sécurisés et juridiquement valides grâce à la signature électronique intégrée.
            </p>
            <div className="mt-4">
              <Link to="/dashboard/templates">
                <Button variant="secondary">Gérer mes contrats</Button>
              </Link>
            </div>
          </Card>

          {message ? <p className="text-sm font-body text-[var(--mint)]">{message}</p> : null}
          {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}

          <hr className="border-[var(--border)]" />

          <h2 className="font-display text-xl font-bold text-[var(--ink)]">Session &amp; Compte</h2>

          <div className="rounded-[var(--radius-md)] border border-[var(--amber)] bg-[rgba(245,166,35,0.05)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-base font-semibold text-[var(--ink)]">Se déconnecter</p>
                <p className="mt-0.5 text-[13px] font-body text-[var(--ink-muted)]">
                  Vous serez redirigé vers la page d&apos;accueil
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-[var(--radius-sm)] border border-[var(--amber)] bg-[var(--amber-soft)] px-5 py-2.5 text-sm font-body font-medium text-[var(--amber)] transition hover:brightness-95"
              >
                Se déconnecter
              </button>
            </div>

            <hr className="my-5 border-[var(--amber)]/30" />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-base font-semibold text-[#EF4444]">Supprimer mon compte</p>
                <p className="mt-0.5 text-[13px] font-body text-[var(--ink-muted)]">
                  Cette action est irréversible. Toutes vos données seront supprimées.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="rounded-[var(--radius-sm)] border border-[#EF4444] bg-[#FEF2F2] px-5 py-2.5 text-sm font-body font-medium text-[#EF4444] transition hover:bg-[#FEE2E2]"
              >
                Supprimer le compte
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/50 px-4">
          <Card className="w-full max-w-md">
            <h2 className="font-display text-xl font-bold text-[var(--ink)]">⚠️ Supprimer votre compte ?</h2>
            <p className="mt-3 text-sm font-body text-[var(--ink-muted)]">
              Cette action supprimera définitivement tous vos projets, clients et contrats. Cette action est irréversible.
            </p>
            <div className="mt-4">
              <Input
                placeholder='Tapez SUPPRIMER pour confirmer'
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
              />
            </div>
            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDeleteConfirmText('')
                }}
              >
                Annuler
              </Button>
              <button
                type="button"
                disabled={deleteConfirmText !== 'SUPPRIMER' || deleting}
                onClick={handleDeleteAccount}
                className="rounded-[var(--radius-sm)] bg-[#EF4444] px-5 py-2.5 text-sm font-body font-medium text-white transition hover:bg-[#DC2626] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
