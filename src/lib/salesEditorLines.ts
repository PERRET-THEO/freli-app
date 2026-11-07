import { newLineId, parseDecimalInput, type DraftLineInput } from './salesDocuments'

/** Ligne en cours d'édition : les nombres restent des chaînes jusqu'à validation. */
export type EditorLine = {
  id: string
  description: string
  quantity: string
  unit: string
  unit_price_ht: string
  vat_rate: number
  discount_percent: string
}

const numberToInput = (n: number) =>
  Number.isFinite(n) ? String(n).replace('.', ',') : ''

export function toEditorLine(line: DraftLineInput): EditorLine {
  return {
    id: line.id,
    description: line.description,
    quantity: numberToInput(line.quantity),
    unit: line.unit ?? '',
    unit_price_ht: numberToInput(line.unit_price_ht),
    vat_rate: line.vat_rate,
    discount_percent: line.discount_percent ? numberToInput(line.discount_percent) : '',
  }
}

export function toDraftLine(line: EditorLine): DraftLineInput {
  const discount = line.discount_percent.trim() === '' ? 0 : parseDecimalInput(line.discount_percent)
  return {
    id: line.id,
    description: line.description,
    quantity: parseDecimalInput(line.quantity),
    unit: line.unit.trim() || null,
    unit_price_ht: parseDecimalInput(line.unit_price_ht),
    vat_rate: line.vat_rate,
    discount_percent: discount,
  }
}

export function newEditorLine(vatRate: number): EditorLine {
  return {
    id: newLineId(),
    description: '',
    quantity: '1',
    unit: '',
    unit_price_ht: '',
    vat_rate: vatRate,
    discount_percent: '',
  }
}
