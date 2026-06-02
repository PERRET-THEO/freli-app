import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardLayout } from '../components/DashboardLayout'
import { Button, Card, Input } from '../components/ui'
import { getOrCreateAgency } from '../lib/agency'
import { supabase } from '../lib/supabase'
import { SUPPORT_EMAIL, supportMailto } from '../lib/support'

type AgencyRecord = {
  id: string
  name: string
  logo_url: string | null
  plan: string | null
}

type SectionFeedback = { type: 'success' | 'error'; text: string } | null

function SectionMessage({ feedback }: { feedback: SectionFeedback }) {
  if (!feedback) return null
  return (
    <p
      className={`text-sm font-body ${
        feedback.type === 'success' ? 'text-[var(--mint)]' : 'text-[var(--amber)]'
      }`}
    >
      {feedback.text}
    </p>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [agency, setAgency] = useState<AgencyRecord | null>(null)
  const [agencyName, setAgencyName] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [accountEmail, setAccountEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [agencyFeedback, setAgencyFeedback] = useState<SectionFeedback>(null)
  const [passwordFeedback, setPasswordFeedback] = useState<SectionFeedback>(null)
  const [agencySaving, setAgencySaving] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        setPageLoading(false)
        return
      }
      setUserId(userData.user.id)
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
      setPageLoading(false)
    }

    loadSettings()
  }, [])

  const uploadLogo = async (agencyId: string, currentLogoUrl: string | null): Promise<string | null> => {
    if (!logoFile) return currentLogoUrl

    const fileExt = logoFile.name.split('.').pop() || 'png'
    const filePath = `${agencyId}/logo-${Date.now()}.${fileExt}`
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(filePath, logoFile, { upsert: true })
    if (uploadError) {
      throw new Error("Impossible d'uploader le logo.")
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(filePath)
    return data.publicUrl
  }

  const handleSaveAgency = async () => {
    setAgencyFeedback(null)
    const trimmedName = agencyName.trim()
    if (!trimmedName) {
      setAgencyFeedback({ type: 'error', text: 'Le nom de l’agence est obligatoire.' })
      return
    }
    if (!userId) {
      setAgencyFeedback({ type: 'error', text: 'Session invalide. Reconnectez-vous.' })
      return
    }

    setAgencySaving(true)
    try {
      if (agency?.id) {
        const logoUrl = await uploadLogo(agency.id, agency.logo_url)
        const { error: updateError } = await supabase
          .from('agencies')
          .update({ name: trimmedName, logo_url: logoUrl })
          .eq('id', agency.id)

        if (updateError) {
          setAgencyFeedback({ type: 'error', text: updateError.message })
          return
        }

        setAgency({ ...agency, name: trimmedName, logo_url: logoUrl })
        setLogoFile(null)
        setAgencyFeedback({ type: 'success', text: 'Paramètres agence enregistrés.' })
        return
      }

      const createdBase = await getOrCreateAgency(userId, trimmedName)
      if (!createdBase?.id) {
        setAgencyFeedback({
          type: 'error',
          text: 'Impossible de créer votre agence.',
        })
        return
      }

      const { data: created, error: updateNameError } = await supabase
        .from('agencies')
        .update({ name: trimmedName })
        .eq('id', createdBase.id)
        .select('id, name, logo_url, plan')
        .single()

      if (updateNameError || !created) {
        setAgencyFeedback({
          type: 'error',
          text: updateNameError?.message ?? 'Impossible de créer votre agence.',
        })
        return
      }

      let logoUrl = created.logo_url as string | null
      if (logoFile) {
        logoUrl = await uploadLogo(created.id, null)
        await supabase.from('agencies').update({ logo_url: logoUrl }).eq('id', created.id)
      }

      const record: AgencyRecord = {
        id: created.id,
        name: trimmedName,
        logo_url: logoUrl,
        plan: created.plan ?? null,
      }
      setAgency(record)
      setLogoFile(null)
      setAgencyFeedback({ type: 'success', text: 'Agence créée et enregistrée.' })
    } catch (reason) {
      setAgencyFeedback({
        type: 'error',
        text: reason instanceof Error ? reason.message : 'Erreur lors de l’enregistrement.',
      })
    } finally {
      setAgencySaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPasswordFeedback(null)
    if (!password || password !== passwordConfirm) {
      setPasswordFeedback({ type: 'error', text: 'Les mots de passe ne correspondent pas.' })
      return
    }
    if (password.length < 6) {
      setPasswordFeedback({
        type: 'error',
        text: 'Le mot de passe doit contenir au moins 6 caractères.',
      })
      return
    }

    setPasswordSaving(true)
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    setPasswordSaving(false)

    if (passwordError) {
      setPasswordFeedback({ type: 'error', text: passwordError.message })
      return
    }
    setPassword('')
    setPasswordConfirm('')
    setPasswordFeedback({ type: 'success', text: 'Mot de passe mis à jour.' })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/signin', { replace: true })
  }

  if (pageLoading) {
    return (
      <DashboardLayout title="Paramètres" subtitle="Agence & compte" maxWidth="4xl">
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement des paramètres…</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Paramètres" subtitle="Agence & compte" maxWidth="4xl">
      <div className="space-y-4">
        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">
            {agency ? 'Mon agence' : 'Créer mon agence'}
          </h2>
          <p className="mt-1 text-sm font-body text-[var(--ink-muted)]">
            {agency
              ? 'Nom et logo affichés sur vos espaces clients.'
              : 'Configurez votre agence pour utiliser Freli.'}
          </p>
          <div className="mt-4 space-y-3">
            {agency?.logo_url ? (
              <img
                src={agency.logo_url}
                alt="Logo de l'agence"
                className="h-14 w-14 rounded-[var(--radius-sm)] border border-[var(--border)] object-cover"
              />
            ) : null}
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
            <Button onClick={handleSaveAgency} disabled={agencySaving}>
              {agencySaving ? 'Enregistrement…' : agency ? 'Enregistrer' : 'Créer mon agence'}
            </Button>
            <SectionMessage feedback={agencyFeedback} />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Mon compte</h2>
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
            <Button onClick={handleChangePassword} disabled={passwordSaving}>
              {passwordSaving ? 'Mise à jour…' : 'Changer le mot de passe'}
            </Button>
            <SectionMessage feedback={passwordFeedback} />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Votre accès Freli</h2>
          <p className="mt-2 text-sm font-body leading-relaxed text-[var(--ink-muted)]">
            Freli est une application payante. Votre accès a été activé par l&apos;équipe Freli sur
            invitation — sans action de votre part, aucun compte ne peut être créé.
          </p>
          <p className="mt-3 text-sm font-body text-[var(--ink-soft)]">
            Pour toute question sur votre abonnement ou votre accès, contactez le support.
          </p>
          <a
            href={supportMailto}
            className="mt-4 inline-flex rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)] px-5 py-2.5 text-sm font-body font-medium text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Contacter le support ({SUPPORT_EMAIL})
          </a>
        </Card>

        <Card>
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Documents</h2>
          <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
            Modèles de contrats et signature électronique pour vos projets clients.
          </p>
          <div className="mt-4">
            <Link to="/dashboard/templates">
              <Button variant="secondary">Gérer mes contrats</Button>
            </Link>
          </div>
        </Card>

        <Card className="border border-[var(--amber)]/40 bg-[rgba(245,166,35,0.04)]">
          <h2 className="font-display text-xl font-semibold text-[var(--ink)]">Session</h2>
          <p className="mt-2 text-sm font-body text-[var(--ink-muted)]">
            Vous serez redirigé vers la page de connexion. La suppression de compte est gérée
            uniquement par l&apos;équipe Freli sur demande au support.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[13px] font-body text-[var(--ink-soft)]">Fin de session sur cet appareil</p>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-[var(--radius-sm)] border border-[var(--amber)] bg-[var(--amber-soft)] px-5 py-2.5 text-sm font-body font-medium text-[var(--amber)] transition hover:brightness-95"
            >
              Se déconnecter
            </button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  )
}
