export type ContractSignatureValue = {
  status?: 'pending_generation' | 'pending'
  template_id?: string
  generated_document_id?: string
}

export function parseContractSignatureValue(value: string | null): ContractSignatureValue | null {
  if (!value) return null
  try {
    return JSON.parse(value) as ContractSignatureValue
  } catch {
    return null
  }
}

export function getTemplateIdFromSignatureValue(value: string | null): string | null {
  return parseContractSignatureValue(value)?.template_id ?? null
}

export function getGeneratedDocumentIdFromSignatureValue(value: string | null): string | null {
  return parseContractSignatureValue(value)?.generated_document_id ?? null
}

export function isContractPendingGeneration(value: string | null): boolean {
  return parseContractSignatureValue(value)?.status === 'pending_generation'
}

export function buildFinalizedGeneratedContractValue(generatedDocumentId: string): string {
  return JSON.stringify({ generated_document_id: generatedDocumentId, status: 'pending' })
}

export function buildPendingTemplateContractValue(templateId: string): string {
  return JSON.stringify({ template_id: templateId, status: 'pending' })
}
