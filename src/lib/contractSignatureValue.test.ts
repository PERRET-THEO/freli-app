import { describe, expect, it } from 'vitest'
import {
  buildFinalizedGeneratedContractValue,
  buildPendingTemplateContractValue,
  getGeneratedDocumentIdFromSignatureValue,
  getTemplateIdFromSignatureValue,
  isContractPendingGeneration,
  parseContractSignatureValue,
} from './contractSignatureValue'

describe('contractSignatureValue', () => {
  it('parse les valeurs template et document généré', () => {
    expect(parseContractSignatureValue(JSON.stringify({ template_id: 't1', status: 'pending' }))).toEqual({
      template_id: 't1',
      status: 'pending',
    })
    expect(
      parseContractSignatureValue(
        JSON.stringify({ generated_document_id: 'g1', status: 'pending' }),
      ),
    ).toEqual({
      generated_document_id: 'g1',
      status: 'pending',
    })
  })

  it('extrait les identifiants et détecte pending_generation', () => {
    expect(getTemplateIdFromSignatureValue(JSON.stringify({ template_id: 'abc' }))).toBe('abc')
    expect(
      getGeneratedDocumentIdFromSignatureValue(
        JSON.stringify({ generated_document_id: 'doc-1' }),
      ),
    ).toBe('doc-1')
    expect(isContractPendingGeneration(JSON.stringify({ status: 'pending_generation' }))).toBe(true)
    expect(isContractPendingGeneration(JSON.stringify({ status: 'pending' }))).toBe(false)
  })

  it('construit les payloads sérialisés', () => {
    expect(buildPendingTemplateContractValue('tpl')).toBe(
      JSON.stringify({ template_id: 'tpl', status: 'pending' }),
    )
    expect(buildFinalizedGeneratedContractValue('gen')).toBe(
      JSON.stringify({ generated_document_id: 'gen', status: 'pending' }),
    )
  })
})
