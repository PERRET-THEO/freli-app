import { describe, expect, it } from 'vitest'
import {
  isStoragePath,
  storagePathFromPdfUrl,
} from './contractStorage'
import {
  normalizeReminderDelayHours,
  reminderDelayLabel,
} from './reminderSettings'
import { normalizeBrandColor } from './agencyBranding'

describe('contractStorage', () => {
  it('detects storage paths vs public URLs', () => {
    expect(isStoragePath('templates/agency/file.pdf')).toBe(true)
    expect(isStoragePath('https://example.com/file.pdf')).toBe(false)
  })

  it('extracts storage path from legacy public URL', () => {
    const url = 'https://x.supabase.co/storage/v1/object/public/contracts/templates/a/b.pdf'
    expect(storagePathFromPdfUrl(url)).toBe('templates/a/b.pdf')
  })
})

describe('reminderSettings', () => {
  it('normalizes invalid delay to default', () => {
    expect(normalizeReminderDelayHours(null)).toBe(48)
    expect(normalizeReminderDelayHours(5)).toBe(48)
    expect(normalizeReminderDelayHours(72)).toBe(72)
  })

  it('formats delay labels', () => {
    expect(reminderDelayLabel(48)).toContain('48')
    expect(reminderDelayLabel(168)).toContain('7')
  })
})

describe('agencyBranding', () => {
  it('normalizes brand color hex', () => {
    expect(normalizeBrandColor('#AABBCC')).toBe('#aabbcc')
    expect(normalizeBrandColor('invalid')).toBe('#5b6ef5')
  })
})
