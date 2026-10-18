import { supabase } from './supabase'
import type { ChecklistItemConfig } from './checklistFields'

export type RevealedCredentials =
  | { username: string; password: string; loginUrl?: string }
  | { legacy: string }

async function readInvokeError(
  error: unknown,
): Promise<{ error?: string; code?: string; status?: number } | null> {
  const ctx = (error as { context?: Response })?.context
  if (!ctx) return null
  const status = ctx.status
  try {
    const body = (await ctx.json()) as { error?: string; code?: string }
    return { ...body, status }
  } catch {
    return { status }
  }
}

export class CredentialsApiError extends Error {
  readonly code?: string
  readonly status: number
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function portalSubmitCredentials(params: {
  projectToken: string
  itemId: string
  username: string
  password: string
  loginUrl?: string
}): Promise<{
  item: {
    id: string
    label: string
    type: string
    completed: boolean
    value: string | null
    review_status: string | null
    review_note: string | null
    config: ChecklistItemConfig | null
  }
  projectStatus: string
  projectJustCompleted: boolean
}> {
  const { data, error } = await supabase.functions.invoke('portal-submit-credentials', {
    body: {
      projectToken: params.projectToken,
      itemId: params.itemId,
      username: params.username,
      password: params.password,
      loginUrl: params.loginUrl || undefined,
    },
  })
  if (error) {
    const body = await readInvokeError(error)
    throw new CredentialsApiError(
      body?.status ?? 500,
      body?.error ?? error.message,
      body?.code,
    )
  }
  if (data?.error) {
    throw new CredentialsApiError(400, String(data.error), data.code)
  }
  return {
    item: data.item,
    projectStatus: data.projectStatus,
    projectJustCompleted: Boolean(data.projectJustCompleted),
  }
}

export async function revealChecklistCredentials(params: {
  itemId: string
  action: 'reveal' | 'copy'
}): Promise<RevealedCredentials> {
  const { data, error } = await supabase.functions.invoke('reveal-checklist-credentials', {
    body: params,
  })
  if (error) {
    const body = await readInvokeError(error)
    throw new CredentialsApiError(
      body?.status ?? 500,
      body?.error ?? error.message,
      body?.code,
    )
  }
  if (data?.error) {
    throw new CredentialsApiError(410, String(data.error), data.code)
  }
  return data.credentials as RevealedCredentials
}

export async function approveOrClearCredentials(params: {
  itemId: string
  action: 'approve' | 'clear'
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke('approve-or-clear-credentials', {
    body: params,
  })
  if (error) {
    const body = await readInvokeError(error)
    throw new CredentialsApiError(
      body?.status ?? 500,
      body?.error ?? error.message,
      body?.code,
    )
  }
  if (data?.error) throw new CredentialsApiError(400, String(data.error), data.code)
}

export async function convertTextToCredentials(itemId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('convert-checklist-text-to-credentials', {
    body: { itemId },
  })
  if (error) {
    const body = await readInvokeError(error)
    throw new CredentialsApiError(
      body?.status ?? 500,
      body?.error ?? error.message,
      body?.code,
    )
  }
  if (data?.error) throw new CredentialsApiError(400, String(data.error), data.code)
}

export function formatRevealedCredentials(creds: RevealedCredentials): string {
  if ('legacy' in creds) return creds.legacy
  const lines = [`Identifiant : ${creds.username}`, `Mot de passe : ${creds.password}`]
  if (creds.loginUrl) lines.push(`URL : ${creds.loginUrl}`)
  return lines.join('\n')
}

export function isSafeDisplayLoginUrl(url: string | undefined): boolean {
  if (!url?.trim()) return false
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
