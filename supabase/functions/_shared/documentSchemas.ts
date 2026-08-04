/**
 * Schémas JSON stricts (Mistral json_schema) et listes de champs par type de document.
 */

export const DOCUMENT_FIELD_LISTS: Record<string, string[]> = {
  identity: [
    'document_subtype',
    'last_name',
    'first_name',
    'birth_date',
    'document_number',
    'expiry_date',
    'nationality',
    'address',
  ],
  kbis: [
    'company_name',
    'legal_form',
    'siren',
    'siret',
    'rcs_city',
    'registered_address',
    'share_capital',
    'main_activity',
    'legal_representative_name',
    'registration_date',
  ],
  rib: ['account_holder', 'iban', 'bic', 'bank_name'],
}

const nullableString = { type: ['string', 'null'] as const }

export const CLASSIFICATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_type', 'confidence'],
  properties: {
    document_type: {
      type: 'string',
      enum: ['identity', 'kbis', 'rib', 'unknown'],
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
    },
    detected_language: nullableString,
  },
}

function fieldsSchema(fieldNames: string[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const name of fieldNames) {
    if (name === 'document_subtype') {
      properties[name] = {
        anyOf: [
          { type: 'string', enum: ['cni', 'passport'] },
          { type: 'null' },
        ],
      }
    } else {
      properties[name] = { type: ['string', 'null'] }
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: fieldNames,
    properties,
  }
}

export const EXTRACTION_JSON_SCHEMAS: Record<string, Record<string, unknown>> = {
  identity: {
    type: 'object',
    additionalProperties: false,
    required: ['document_type', 'fields'],
    properties: {
      document_type: { type: 'string', enum: ['identity'] },
      fields: fieldsSchema(DOCUMENT_FIELD_LISTS.identity),
    },
  },
  kbis: {
    type: 'object',
    additionalProperties: false,
    required: ['document_type', 'fields'],
    properties: {
      document_type: { type: 'string', enum: ['kbis'] },
      fields: fieldsSchema(DOCUMENT_FIELD_LISTS.kbis),
    },
  },
  rib: {
    type: 'object',
    additionalProperties: false,
    required: ['document_type', 'fields'],
    properties: {
      document_type: { type: 'string', enum: ['rib'] },
      fields: fieldsSchema(DOCUMENT_FIELD_LISTS.rib),
    },
  },
}

export const REMINDER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['subject', 'body'],
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
}

export const STRUCTURE_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['document_kind', 'tone_description', 'sections', 'recurring_clauses'],
  properties: {
    document_kind: { type: 'string', enum: ['contrat', 'proposition', 'autre'] },
    tone_description: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'purpose'],
        properties: {
          heading: { type: 'string' },
          purpose: { type: 'string' },
        },
      },
    },
    recurring_clauses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
        },
      },
    },
    layout_hints: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title_style: { type: 'string', enum: ['uppercase', 'titlecase', 'numbered'] },
        numbered_sections: { type: 'boolean' },
        compact_spacing: { type: 'boolean' },
        has_tables: { type: 'boolean' },
        section_order: { type: 'array', items: { type: 'string' } },
      },
    },
    typography: {
      type: 'object',
      additionalProperties: false,
      properties: {
        heading_size: { type: 'string', enum: ['small', 'medium', 'large'] },
        body_density: { type: 'string', enum: ['compact', 'normal', 'spacious'] },
        accent_muted: { type: 'boolean' },
      },
    },
    header_footer_style: {
      type: 'object',
      additionalProperties: false,
      properties: {
        header_content: { type: ['string', 'null'] },
        footer_content: { type: ['string', 'null'] },
        has_logo: { type: 'boolean' },
      },
    },
  },
}

export const CONTRACT_DRAFT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'sections'],
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'content', 'origin', 'needs_legal_review'],
        properties: {
          heading: { type: 'string' },
          content: { type: 'string' },
          origin: { type: 'string', enum: ['brief', 'model', 'library', 'ai_generated'] },
          needs_legal_review: { type: 'boolean' },
        },
      },
    },
  },
}

/** Enveloppe json_schema pour l'API Mistral. */
export function mistralJsonSchema(name: string, schema: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    json_schema: {
      name,
      strict: true,
      schema,
    },
  }
}
