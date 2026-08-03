import { z } from 'zod'
import { isValidContactEmail, normalizeContactPhone } from './contactLinks'

export type ClientRecord = {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  company_name: string | null
  company_type: string | null
  siret: string | null
  siren: string | null
  code_naf: string | null
  vat_number: string | null
  address_street: string | null
  address_city: string | null
  address_postal_code: string | null
  address_country: string | null
  website: string | null
  industry: string | null
  company_size: string | null
  notes: string | null
  iban: string | null
  bic: string | null
  source_donnees_legales: 'api_gouv' | 'saisie_manuelle' | null
  created_at: string
  updated_at?: string
}

export type ClientPatch = Partial<
  Omit<ClientRecord, 'id' | 'created_at' | 'updated_at'>
>

const emptyToNull = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export const clientFieldSchemas = {
  first_name: z.string().trim().min(1, 'Le prénom est requis').max(100),
  last_name: z.string().trim().min(1, 'Le nom est requis').max(100),
  email: z
    .string()
    .trim()
    .refine(isValidContactEmail, 'Email invalide'),
  phone: z
    .string()
    .trim()
    .transform((v) => emptyToNull(v))
    .refine((v) => v === null || normalizeContactPhone(v) !== null, 'Téléphone invalide')
    .transform((v) => (v ? normalizeContactPhone(v) : null)),
  company_name: z.string().trim().max(200).transform(emptyToNull),
  company_type: z.string().trim().max(120).transform(emptyToNull),
  website: z
    .string()
    .trim()
    .transform(emptyToNull)
    .refine(
      (v) => v === null || /^https?:\/\//i.test(v) || /^[\w.-]+\.[\w.-]+/.test(v),
      'URL invalide',
    ),
  siret: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ''))
    .transform(emptyToNull)
    .refine((v) => v === null || /^\d{14}$/.test(v), 'SIRET : 14 chiffres'),
  siren: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s/g, ''))
    .transform(emptyToNull)
    .refine((v) => v === null || /^\d{9}$/.test(v), 'SIREN : 9 chiffres'),
  code_naf: z.string().trim().max(16).transform(emptyToNull),
  vat_number: z.string().trim().max(32).transform(emptyToNull),
  address_street: z.string().trim().max(200).transform(emptyToNull),
  address_city: z.string().trim().max(120).transform(emptyToNull),
  address_postal_code: z.string().trim().max(20).transform(emptyToNull),
  address_country: z.string().trim().max(80).transform(emptyToNull),
  industry: z.string().trim().max(120).transform(emptyToNull),
  company_size: z.string().trim().max(40).transform(emptyToNull),
  notes: z.string().trim().max(5000).transform(emptyToNull),
} as const

export type ClientScalarField = keyof typeof clientFieldSchemas

export const addressPatchSchema = z.object({
  address_street: clientFieldSchemas.address_street,
  address_city: clientFieldSchemas.address_city,
  address_postal_code: clientFieldSchemas.address_postal_code,
  address_country: clientFieldSchemas.address_country,
})

export function parseClientScalarField(
  field: ClientScalarField,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = clientFieldSchemas[field]
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Valeur invalide' }
  }
  return { ok: true, value: result.data }
}
