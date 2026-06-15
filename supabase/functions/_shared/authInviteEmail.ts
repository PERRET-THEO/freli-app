import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'npm:resend'
import { buildUserInviteEmail } from './clientEmailHtml.ts'
import { assertResendOk, getAuthResendFrom, isDevMode } from './email.ts'

export async function sendUserInviteEmail(
  supabaseAdmin: SupabaseClient,
  resend: Resend,
  email: string,
  appUrl: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const redirectTo = `${appUrl.replace(/\/$/, '')}/signup`

  const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo },
  })

  if (linkError) {
    const msg = linkError.message.toLowerCase()
    if (msg.includes('already been registered') || msg.includes('already registered')) {
      return { ok: false, error: 'Cet email est déjà enregistré.', status: 409 }
    }
    return { ok: false, error: linkError.message, status: 400 }
  }

  const actionLink =
    data?.properties?.action_link ??
    (data as { action_link?: string } | null)?.action_link ??
    null

  if (!actionLink) {
    return { ok: false, error: 'Impossible de générer le lien d\u2019invitation.', status: 500 }
  }

  if (isDevMode()) {
    console.log('MODE DEV — Email invitation simulé pour:', email, actionLink)
    return { ok: true }
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!resendApiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not configured', status: 500 }
  }

  const html = buildUserInviteEmail({ inviteUrl: actionLink })
  const result = await resend.emails.send({
    from: getAuthResendFrom(),
    to: email,
    subject: 'Freli — créez votre compte',
    html,
  })

  try {
    assertResendOk(result)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason)
    const friendly =
      message.includes('only send testing emails') || message.includes('validation')
        ? 'Envoi email impossible : vérifiez la configuration Resend (domaine ou destinataire autorisé).'
        : 'Impossible d\u2019envoyer l\u2019email d\u2019invitation.'
    return { ok: false, error: friendly, status: 500 }
  }

  return { ok: true }
}

export function createAuthAdminClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
