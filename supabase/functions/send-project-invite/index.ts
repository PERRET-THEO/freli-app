import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { getResendFrom, assertResendOk } from '../_shared/email.ts'
import {
  buildClientOnboardingEmail,
  isValidProjectToken,
  type PendingChecklistItem,
} from '../_shared/clientEmailHtml.ts'
import { formatDisplayName, stripSireneAcronym } from '../_shared/formatPersonName.ts'
import { getClientPendingActions } from '../_shared/clientPendingActions.ts'
import { renderPortalWelcomeHtml } from '../_shared/portalWelcomeTemplate.ts'
import {
  buildProjectPayload,
  fireOutgoingWebhooks,
  getAgencyUserId,
} from '../_shared/outgoingWebhooks.ts'
import {
  assertUserIsAgencyMember,
  corsHeaders,
  getAuthenticatedUser,
  isInternalRequest,
  jsonResponse,
} from '../_shared/functionAuth.ts'
import { finalizeAutoReminder } from '../_shared/reminderClaim.ts'
import {
  formatRetryAfterMessage,
  isValidInviteEmail,
} from '../_shared/inviteResend.ts'

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void }

type InviteBody = {
  projectId?: string
  projectToken?: string
  token?: string
  clientName?: string
  clientEmail?: string
  agencyName?: string
  reminder?: boolean
  mode?: 'reminder' | 'invite'
  source?: 'auto' | 'manual'
  /** Cron / internal retry: skip 30s rate limit. */
  force?: boolean
  /** Renvoi manuel depuis la fiche projet (synchrone). */
  resend?: boolean
  /** Log déjà claimé par claim_auto_reminder (batch auto uniquement). */
  claimLogId?: string
}

type ProjectInviteRow = {
  id: string
  token: string
  name: string | null
  client_name: string
  client_email: string
  client_id: string | null
  agency_id: string
  status: string | null
  price: number | null
  payment_status: string | null
  invite_status: string | null
  invite_sent_at: string | null
  invite_attempts: number | null
  invite_last_attempt_at: string | null
  agencies:
    | {
        id?: string
        name?: string
        portal_welcome_message?: string | null
      }
    | {
        id?: string
        name?: string
        portal_welcome_message?: string | null
      }[]
    | null
  clients:
    | { first_name?: string | null; company_name?: string | null }
    | { first_name?: string | null; company_name?: string | null }[]
    | null
}

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
const appUrl = (Deno.env.get('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '')

const supabase = createClient(supabaseUrl, serviceRoleKey)
const resend = new Resend(resendApiKey)

const RESEND_COOLDOWN_MS = 30_000

function agencyNameFrom(rel: ProjectInviteRow['agencies'], fallback: string): string {
  const row = Array.isArray(rel) ? rel[0] : rel
  return row?.name?.trim() || fallback
}

function agencyWelcomeFrom(rel: ProjectInviteRow['agencies']): string | null {
  const row = Array.isArray(rel) ? rel[0] : rel
  return row?.portal_welcome_message ?? null
}

function clientJoinFrom(rel: ProjectInviteRow['clients']): {
  first_name?: string | null
  company_name?: string | null
} | null {
  if (!rel) return null
  return Array.isArray(rel) ? rel[0] ?? null : rel
}

function buildInviteWelcomeHtml(projectRow: ProjectInviteRow, agencyName: string): string {
  const client = clientJoinFrom(projectRow.clients)
  const firstRaw =
    client?.first_name?.trim() ||
    projectRow.client_name.trim().split(/\s+/)[0] ||
    ''
  const companyRaw = stripSireneAcronym(client?.company_name ?? '')
  return renderPortalWelcomeHtml(agencyWelcomeFrom(projectRow.agencies), {
    'client.prenom': formatDisplayName(firstRaw),
    'client.entreprise': companyRaw,
    'projet.nom': projectRow.name?.trim() || projectRow.client_name.trim() || 'votre projet',
    'agence.nom': agencyName,
  })
}

async function markInviteAttempt(projectId: string): Promise<void> {
  const { data } = await supabase
    .from('projects')
    .select('invite_attempts')
    .eq('id', projectId)
    .single()
  const attempts = Number(data?.invite_attempts ?? 0) + 1
  await supabase
    .from('projects')
    .update({
      invite_status: 'pending',
      invite_error: null,
      invite_attempts: attempts,
      invite_last_attempt_at: new Date().toISOString(),
    })
    .eq('id', projectId)
}

async function markInviteSent(projectId: string): Promise<void> {
  await supabase
    .from('projects')
    .update({
      invite_status: 'sent',
      invite_sent_at: new Date().toISOString(),
      invite_error: null,
    })
    .eq('id', projectId)
}

async function markInviteFailed(projectId: string, error: string): Promise<void> {
  await supabase
    .from('projects')
    .update({
      invite_status: 'failed',
      invite_error: error.slice(0, 500),
    })
    .eq('id', projectId)
}

async function deliverInviteEmail(opts: {
  projectId: string
  token: string
  clientName: string
  clientEmail: string
  agencyId: string
  agencyName: string
  projectRow: ProjectInviteRow
  isDev: boolean
  /** Sujet alternatif (renvoi manuel). */
  subject?: string
  fireCreatedWebhook?: boolean
}): Promise<{ inviteSentAt: string }> {
  const portalUrl = `${appUrl}/p/${opts.token}`
  const displayClientName = formatDisplayName(opts.clientName) || opts.clientName
  const welcomeHtml = buildInviteWelcomeHtml(opts.projectRow, opts.agencyName)
  const subject =
    opts.subject ?? `${opts.agencyName} vous invite à compléter votre onboarding`

  if (opts.isDev) {
    console.log('MODE DEV — Email simulé pour:', opts.clientEmail, portalUrl)
    const inviteSentAt = new Date().toISOString()
    await supabase
      .from('projects')
      .update({
        invite_status: 'sent',
        invite_sent_at: inviteSentAt,
        invite_error: null,
      })
      .eq('id', opts.projectId)
    return { inviteSentAt }
  }

  const html = buildClientOnboardingEmail({
    mode: 'invite',
    clientName: displayClientName,
    agencyName: opts.agencyName,
    portalUrl,
    pendingItems: [],
    welcomeHtml,
  })

  const result = await resend.emails.send({
    from: getResendFrom(),
    to: opts.clientEmail,
    subject,
    html,
  })
  console.log('Resend response:', JSON.stringify(result))
  assertResendOk(result)

  const resendEmailId = (result.data as { id?: string } | null)?.id
  if (resendEmailId) {
    await supabase.from('email_events').insert({
      project_id: opts.projectId,
      resend_email_id: resendEmailId,
      event_type: 'sent',
    })
  }

  const inviteSentAt = new Date().toISOString()
  await supabase
    .from('projects')
    .update({
      invite_status: 'sent',
      invite_sent_at: inviteSentAt,
      invite_error: null,
    })
    .eq('id', opts.projectId)

  if (opts.fireCreatedWebhook !== false) {
    const userId = await getAgencyUserId(supabase, opts.agencyId)
    if (userId) {
      fireOutgoingWebhooks(
        supabase,
        userId,
        'project.created',
        buildProjectPayload(
          opts.projectRow,
          { id: opts.agencyId, name: opts.agencyName },
          { meta: { source: 'invite', portal_url: portalUrl } },
        ),
      )
    }
  }

  return { inviteSentAt }
}

async function insertInviteResentEvent(opts: {
  agencyId: string
  clientId: string
  projectId: string
  actorEmail: string | null
  actorUserId: string
  recipientEmail: string
  outcome: 'sent' | 'failed'
  error?: string
}): Promise<void> {
  const actor = opts.actorEmail?.trim() || 'un membre de l’agence'
  await supabase.from('client_activity_events').insert({
    agency_id: opts.agencyId,
    client_id: opts.clientId,
    project_id: opts.projectId,
    event_type: 'invite.resent',
    title: `Invitation renvoyée par ${actor}`,
    metadata: {
      actor_user_id: opts.actorUserId,
      actor_email: opts.actorEmail,
      recipient_email: opts.recipientEmail,
      outcome: opts.outcome,
      ...(opts.error ? { error: opts.error.slice(0, 500) } : {}),
    },
  })
}

function translateInviteError(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Le service d’email est temporairement saturé. Réessayez dans quelques minutes.'
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Adresse email invalide.'
  }
  return raw.slice(0, 300) || 'Envoi impossible.'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let body: InviteBody
    try {
      const rawBody = await req.text()
      if (!rawBody || rawBody.trim() === '') {
        return jsonResponse({ error: 'Body vide reçu' }, 400)
      }
      body = JSON.parse(rawBody) as InviteBody
    } catch (e) {
      const parseMessage = e instanceof Error ? e.message : String(e)
      return jsonResponse({ error: `JSON invalide: ${parseMessage}` }, 400)
    }

    const isDev = appUrl.includes('localhost')
    const isReminderMode = body.mode === 'reminder' || body.reminder === true
    const emailMode: 'invite' | 'reminder' = isReminderMode ? 'reminder' : 'invite'
    const reminderSource = body.source === 'manual' ? 'manual' : 'auto'
    const internal = isInternalRequest(req)
    const force = Boolean(body.force) || internal

    const projectId = body.projectId
    if (!projectId) {
      return jsonResponse({ error: 'Missing projectId' }, 400)
    }

    // Single project fetch (auth + payload) — no duplicate select.
    const { data: projectData, error: projectError } = await supabase
      .from('projects')
      .select(
        'id, token, name, client_name, client_email, client_id, agency_id, status, price, payment_status, invite_status, invite_sent_at, invite_attempts, invite_last_attempt_at, agencies(id, name, portal_welcome_message), clients(first_name, company_name)',
      )
      .eq('id', projectId)
      .single()

    if (projectError || !projectData) {
      return jsonResponse({ error: 'Project not found' }, 404)
    }

    const projectRow = projectData as ProjectInviteRow
    const isManualResend = Boolean(body.resend) && !isReminderMode

    let authUser: { id: string; email?: string } | null = null
    if (!internal) {
      authUser = await getAuthenticatedUser(req)
      if (authUser) {
        const denied = await assertUserIsAgencyMember(supabase, authUser.id, projectRow.agency_id)
        if (denied) return jsonResponse({ error: denied.error }, denied.status)
      } else if (isManualResend) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      } else if (body.projectToken || body.token) {
        const projectToken = body.projectToken ?? body.token ?? ''
        if (projectRow.token !== projectToken) {
          return jsonResponse({ error: 'Forbidden' }, 403)
        }
      } else {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    }

    // --- Renvoi manuel synchrone ---
    if (isManualResend) {
      if (!authUser) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      if (projectRow.status === 'completed') {
        return jsonResponse(
          { error: 'completed', message: 'Ce projet est terminé.' },
          400,
        )
      }

      // Valider l'email AVANT le claim (pas de write, pas de burn du cooldown).
      const requestedEmail =
        typeof body.clientEmail === 'string' ? body.clientEmail.trim().toLowerCase() : ''
      const emailWillChange =
        Boolean(requestedEmail) &&
        requestedEmail !== projectRow.client_email.trim().toLowerCase()
      if (emailWillChange) {
        if (!isValidInviteEmail(requestedEmail)) {
          return jsonResponse(
            { error: 'invalid_email', message: 'Adresse email invalide.' },
            400,
          )
        }
        let dupQuery = supabase
          .from('clients')
          .select('id')
          .eq('agency_id', projectRow.agency_id)
          .ilike('email', requestedEmail)
          .limit(1)
        if (projectRow.client_id) {
          dupQuery = dupQuery.neq('id', projectRow.client_id)
        }
        const { data: dup } = await dupQuery.maybeSingle()
        if (dup?.id) {
          return jsonResponse(
            {
              error: 'email_taken',
              message:
                'Un autre client de votre agence utilise déjà cette adresse email.',
            },
            400,
          )
        }
      }

      const { data: claimRaw, error: claimError } = await supabase.rpc(
        'claim_invite_manual_resend',
        { p_project_id: projectId },
      )
      if (claimError) {
        console.error('claim_invite_manual_resend:', claimError.message)
        return jsonResponse({ error: 'claim_failed', message: claimError.message }, 500)
      }
      const claim = claimRaw as {
        ok?: boolean
        error?: string
        message?: string
        retry_after_ms?: number
        client_id?: string | null
      }
      if (!claim?.ok) {
        const retryAfterMs = Number(claim?.retry_after_ms ?? 60_000)
        return jsonResponse(
          {
            error: claim?.error ?? 'rate_limited',
            message: claim?.message ?? formatRetryAfterMessage(retryAfterMs),
            retry_after_ms: retryAfterMs,
          },
          429,
        )
      }

      // Mise à jour email uniquement après claim réussi.
      let recipientEmail = projectRow.client_email
      if (emailWillChange) {
        await supabase
          .from('projects')
          .update({ client_email: requestedEmail })
          .eq('id', projectId)
        if (projectRow.client_id) {
          await supabase
            .from('clients')
            .update({ email: requestedEmail })
            .eq('id', projectRow.client_id)
            .eq('agency_id', projectRow.agency_id)
        }
        recipientEmail = requestedEmail
        projectRow.client_email = requestedEmail
      }

      const token = projectRow.token
      const clientName = formatDisplayName(projectRow.client_name) || projectRow.client_name
      const agencyName = agencyNameFrom(projectRow.agencies, body.agencyName ?? 'Mon Agence')
      if (!token || !clientName || !recipientEmail) {
        return jsonResponse({ error: 'Missing invite payload' }, 400)
      }
      if (!isValidProjectToken(token)) {
        return jsonResponse({ error: 'Invalid project token' }, 400)
      }

      const actorEmail = authUser.email?.trim() ?? null
      const clientIdForEvent = projectRow.client_id ?? claim.client_id ?? null

      try {
        const { inviteSentAt } = await deliverInviteEmail({
          projectId,
          token,
          clientName,
          clientEmail: recipientEmail,
          agencyId: projectRow.agency_id,
          agencyName,
          projectRow,
          isDev,
          subject: `Rappel : votre espace d'onboarding ${agencyName}`,
          fireCreatedWebhook: false,
        })

        if (clientIdForEvent) {
          await insertInviteResentEvent({
            agencyId: projectRow.agency_id,
            clientId: clientIdForEvent,
            projectId,
            actorEmail,
            actorUserId: authUser.id,
            recipientEmail,
            outcome: 'sent',
          })
        } else {
          console.warn('invite.resent skipped: project without client_id', projectId)
        }

        return jsonResponse({
          status: 'sent',
          invite_sent_at: inviteSentAt,
          recipient: recipientEmail,
        })
      } catch (err) {
        const message = translateInviteError(
          err instanceof Error ? err.message : String(err),
        )
        console.error('Manual invite resend failed:', message)
        await markInviteFailed(projectId, message)
        if (clientIdForEvent) {
          await insertInviteResentEvent({
            agencyId: projectRow.agency_id,
            clientId: clientIdForEvent,
            projectId,
            actorEmail,
            actorUserId: authUser.id,
            recipientEmail,
            outcome: 'failed',
            error: message,
          })
        } else {
          console.warn('invite.resent failed event skipped: no client_id', projectId)
        }
        return jsonResponse({ error: 'send_failed', message }, 400)
      }
    }

    const token = projectRow.token
    const clientName = formatDisplayName(projectRow.client_name) || projectRow.client_name
    const clientEmail = projectRow.client_email
    const agencyId = projectRow.agency_id
    const agencyName = agencyNameFrom(projectRow.agencies, body.agencyName ?? 'Mon Agence')

    if (!token || !clientName || !clientEmail) {
      throw new Error('Missing invite payload')
    }
    if (!isValidProjectToken(token)) {
      throw new Error('Invalid project token')
    }

    // --- Invite mode: 202 + background delivery ---
    if (!isReminderMode) {
      if (!force && projectRow.invite_last_attempt_at) {
        const elapsed = Date.now() - new Date(projectRow.invite_last_attempt_at).getTime()
        if (elapsed < RESEND_COOLDOWN_MS) {
          return jsonResponse(
            {
              error: 'rate_limited',
              message: 'Attendez quelques secondes avant de renvoyer.',
              retry_after_ms: RESEND_COOLDOWN_MS - elapsed,
            },
            429,
          )
        }
      }

      await markInviteAttempt(projectId)

      const background = (async () => {
        try {
          await deliverInviteEmail({
            projectId,
            token,
            clientName,
            clientEmail,
            agencyId,
            agencyName,
            projectRow,
            isDev,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('Invite delivery failed:', message)
          await markInviteFailed(projectId, message)
        }
      })()

      try {
        EdgeRuntime.waitUntil(background)
      } catch {
        // Local / older runtimes without EdgeRuntime: still run in background
        void background
      }

      return jsonResponse({ accepted: true, invite_status: 'pending' }, 202)
    }

    // --- Reminder mode: keep synchronous path ---
    const portalUrl = `${appUrl}/p/${token}`
    const claimLogId =
      typeof body.claimLogId === 'string' && body.claimLogId.trim()
        ? body.claimLogId.trim()
        : null
    // Claim = envoi auto batch ; sinon source manuelle (ou legacy auto sans claim).
    const effectiveSource = claimLogId ? 'auto' : reminderSource === 'manual' ? 'manual' : 'auto'

    let pendingItems: PendingChecklistItem[] = []
    const { data: allRows } = await supabase
      .from('checklist_items')
      .select('label, type, completed, value, review_note, review_status, config, order_index')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })

    // Uniquement les actions côté client (pas les « à valider » agence).
    pendingItems = getClientPendingActions(allRows ?? []).map((row) => ({
      label: String(row.label ?? ''),
      reviewNote: row.review_status === 'rejected' ? (row.review_note as string | null) : null,
    }))

    if (pendingItems.length === 0) {
      if (claimLogId) await finalizeAutoReminder(supabase, claimLogId, 'failed')
      return jsonResponse({ error: 'Aucune action client en attente' }, 400)
    }

    const needsCorrection = pendingItems.some((item) => item.reviewNote?.trim())
    const subject = needsCorrection
      ? `${agencyName} — quelques éléments à corriger`
      : `${agencyName} — rappel : votre onboarding est en attente`

    const html = buildClientOnboardingEmail({
      mode: emailMode,
      clientName,
      agencyName,
      portalUrl,
      pendingItems,
    })

    if (isDev) {
      console.log('MODE DEV — Email simulé pour:', clientEmail, portalUrl)
      if (claimLogId) {
        await finalizeAutoReminder(supabase, claimLogId, 'sent')
      } else {
        await supabase
          .from('projects')
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq('id', projectId)
        await supabase.from('project_reminder_logs').insert({
          project_id: projectId,
          agency_id: agencyId,
          source: effectiveSource,
          recipient_email: clientEmail,
          status: 'sent',
        })
      }
      return jsonResponse({
        success: true,
        message: 'Email simulé en développement',
        recipient: clientEmail,
        portalUrl,
      })
    }

    try {
      const result = await resend.emails.send({
        from: getResendFrom(),
        to: clientEmail,
        subject,
        html,
      })
      console.log('Resend response:', JSON.stringify(result))
      assertResendOk(result)

      const resendEmailId = (result.data as { id?: string } | null)?.id
      if (resendEmailId) {
        await supabase.from('email_events').insert({
          project_id: projectId,
          resend_email_id: resendEmailId,
          event_type: 'sent',
        })
      }

      if (claimLogId) {
        await finalizeAutoReminder(supabase, claimLogId, 'sent')
      } else {
        await supabase
          .from('projects')
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq('id', projectId)
        await supabase.from('project_reminder_logs').insert({
          project_id: projectId,
          agency_id: agencyId,
          source: effectiveSource,
          recipient_email: clientEmail,
          status: 'sent',
        })
      }

      const userId = await getAgencyUserId(supabase, agencyId)
      if (userId) {
        fireOutgoingWebhooks(
          supabase,
          userId,
          'project.reminder_sent',
          buildProjectPayload(
            projectRow,
            { id: agencyId, name: agencyName },
            { meta: { source: effectiveSource, portal_url: portalUrl } },
          ),
        )
      }

      return jsonResponse({ success: true })
    } catch (sendError) {
      if (claimLogId) await finalizeAutoReminder(supabase, claimLogId, 'failed')
      throw sendError
    }
  } catch (error) {
    console.error('Error:', (error as Error).message)
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})
