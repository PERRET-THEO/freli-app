import { useCallback, useEffect, useState } from 'react'
import { Button, Input } from '../ui'
import {
  inviteAgencyMember,
  listAgencyMembers,
  removeAgencyMember,
  type AgencyMemberRow,
} from '../../lib/agencyMembership'

type TeamMembersPanelProps = {
  agencyId: string
  currentUserId: string
  isOwner: boolean
}

export function TeamMembersPanel({ agencyId, currentUserId, isOwner }: TeamMembersPanelProps) {
  const [members, setMembers] = useState<AgencyMemberRow[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setMembers(await listAgencyMembers(agencyId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger l’équipe.')
    } finally {
      setLoading(false)
    }
  }, [agencyId])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleInvite = async () => {
    if (!isOwner) return
    setInviting(true)
    setFeedback(null)
    setError(null)
    try {
      await inviteAgencyMember(email)
      setEmail('')
      setFeedback('Invitation envoyée.')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invitation impossible.')
    } finally {
      setInviting(false)
    }
  }

  const handleRemove = async (member: AgencyMemberRow) => {
    if (!isOwner || member.role === 'owner' || member.user_id === currentUserId) return
    setError(null)
    try {
      await removeAgencyMember(member.id)
      setFeedback('Membre retiré.')
      await reload()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression impossible.')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-body text-[var(--ink-muted)]">
        Invitez des collaborateurs pour partager le dashboard, les clients et les onboardings.
        Les intégrations Stripe et Google Drive restent rattachées au compte propriétaire.
      </p>

      {loading ? (
        <p className="text-sm font-body text-[var(--ink-muted)]">Chargement…</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--white)]">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-body"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-[var(--ink)]">
                  {member.user_id === currentUserId
                    ? `Vous${member.email ? ` · ${member.email}` : ''}`
                    : member.email ?? 'Collaborateur'}
                </p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {member.role === 'owner' ? 'Propriétaire' : 'Membre'}
                </p>
              </div>
              {isOwner && member.role !== 'owner' ? (
                <button
                  type="button"
                  onClick={() => void handleRemove(member)}
                  className="shrink-0 text-xs font-semibold text-[var(--amber)] hover:underline"
                >
                  Retirer
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="flex-1"
            type="email"
            placeholder="collaborateur@agence.fr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button onClick={() => void handleInvite()} disabled={inviting || !email.trim()}>
            {inviting ? 'Invitation…' : 'Inviter'}
          </Button>
        </div>
      ) : (
        <p className="text-xs font-body text-[var(--ink-muted)]">
          Seul le propriétaire peut inviter ou retirer des membres.
        </p>
      )}

      {feedback ? <p className="text-sm font-body text-[var(--mint)]">{feedback}</p> : null}
      {error ? <p className="text-sm font-body text-[var(--amber)]">{error}</p> : null}
    </div>
  )
}
