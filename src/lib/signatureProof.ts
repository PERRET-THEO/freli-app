import { supabase } from './supabase'

export type SignatureProof = {
  id: string
  checklist_item_id: string | null
  signer_name: string | null
  signer_email: string | null
  signed_at: string
  ip_address: string | null
  user_agent: string | null
  document_sha256: string | null
}

export async function fetchProjectSignatureProofs(
  projectId: string,
): Promise<Record<string, SignatureProof>> {
  const { data, error } = await supabase
    .from('contract_signature_events')
    .select(
      'id, checklist_item_id, signer_name, signer_email, signed_at, ip_address, user_agent, document_sha256',
    )
    .eq('project_id', projectId)
    .order('signed_at', { ascending: false })

  if (error) {
    console.warn('fetchProjectSignatureProofs:', error.message)
    return {}
  }

  // La plus récente par étape gagne : une re-signature remplace la preuve.
  const byItem: Record<string, SignatureProof> = {}
  for (const row of (data ?? []) as SignatureProof[]) {
    if (!row.checklist_item_id) continue
    if (byItem[row.checklist_item_id]) continue
    byItem[row.checklist_item_id] = row
  }
  return byItem
}

/** Empreinte abrégée, lisible sans perdre sa valeur de comparaison. */
export function shortHash(hash: string | null): string {
  if (!hash) return '—'
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`
}

/** Résumé navigateur/appareil à partir du user-agent, sans librairie. */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Appareil inconnu'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Navigateur'
  const platform = /iPhone|iPad|iPod/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return platform ? `${browser} · ${platform}` : browser
}
