import { supabase } from './supabase'

type InviteEmailPayload = {
  projectId: string
  token: string
  clientName: string
  clientEmail: string
  agencyName: string
}

type CompletedEmailPayload = {
  projectId: string
}

export async function sendProjectInviteEmail(payload: InviteEmailPayload) {
  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: payload,
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}

export async function sendProjectCompletedEmail(payload: CompletedEmailPayload) {
  const { data, error } = await supabase.functions.invoke('send-project-completed-notification', {
    body: payload,
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}

export async function sendProjectReminderEmail(payload: {
  projectId: string
  token: string
  clientEmail: string
  clientName: string
  agencyName: string
}) {
  if (
    !payload.projectId ||
    !payload.token ||
    !payload.clientEmail ||
    !payload.clientName ||
    !payload.agencyName
  ) {
    throw new Error('Payload incomplet pour la relance email.')
  }

  const reminderPayload = {
    token: payload.token,
    clientEmail: payload.clientEmail,
    clientName: payload.clientName,
    agencyName: payload.agencyName,
    projectId: payload.projectId,
    mode: 'reminder' as const,
  }
  console.log('Payload envoyé à la Edge Function:', reminderPayload)

  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: reminderPayload,
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}
