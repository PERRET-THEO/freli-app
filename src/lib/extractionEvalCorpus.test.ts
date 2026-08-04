import { describe, expect, it } from 'vitest'
import { EXTRACTION_EVAL_CORPUS, scoreFieldAccuracy } from './extractionEvalCorpus'

describe('extractionEvalCorpus', () => {
  it('contient au moins 3 fixtures FR', () => {
    expect(EXTRACTION_EVAL_CORPUS.length).toBeGreaterThanOrEqual(3)
  })

  it('scoreFieldAccuracy mesure le match exact', () => {
    const score = scoreFieldAccuracy(
      { siren: '732829320', siret: '73282932000074' },
      { siren: '732 829 320', siret: 'wrong' },
    )
    expect(score.matched).toBe(1)
    expect(score.total).toBe(2)
    expect(score.ratio).toBe(0.5)
  })
})
