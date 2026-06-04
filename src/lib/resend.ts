import { supabase } from './supabase'

type CompletedEmailPayload = {
  projectId: string
}

export async function sendProjectInviteEmail(payload: { projectId: string }) {
  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: { projectId: payload.projectId, mode: 'invite' },
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

export async function sendProjectReminderEmail(payload: { projectId: string }) {
  if (!payload.projectId) {
    throw new Error('projectId requis pour la relance email.')
  }

  const { data, error } = await supabase.functions.invoke('send-project-invite', {
    body: {
      projectId: payload.projectId,
      mode: 'reminder',
      source: 'manual',
    },
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(String(data.error))
}
