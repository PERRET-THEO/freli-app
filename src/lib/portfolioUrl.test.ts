import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTFOLIO_LABEL,
  isValidPortfolioUrl,
  normalizePortfolioUrl,
  resolvePortfolioLabel,
} from './portfolioUrl'

describe('portfolioUrl', () => {
  it('accepts https urls', () => {
    expect(normalizePortfolioUrl('https://studio.fr')).toBe('https://studio.fr/')
    expect(normalizePortfolioUrl('studio.fr')).toBe('https://studio.fr/')
  })

  it('rejects http and dangerous schemes', () => {
    expect(normalizePortfolioUrl('http://studio.fr')).toBeNull()
    expect(normalizePortfolioUrl('javascript:alert(1)')).toBeNull()
    expect(isValidPortfolioUrl('http://x.com')).toBe(false)
    expect(isValidPortfolioUrl('')).toBe(true)
  })

  it('resolves label default', () => {
    expect(resolvePortfolioLabel(null)).toBe(DEFAULT_PORTFOLIO_LABEL)
    expect(resolvePortfolioLabel('  Mon site  ')).toBe('Mon site')
  })
})
