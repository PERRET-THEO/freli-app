import { describe, expect, it } from 'vitest'
import {
  getScheduleProvider,
  isFreliPortalUrl,
  isScheduleBookingMessage,
  toScheduleEmbedUrl,
} from './scheduleEmbed'

describe('getScheduleProvider', () => {
  it('détecte Calendly et Cal.com', () => {
    expect(getScheduleProvider('https://calendly.com/agence/kickoff')).toBe('calendly')
    expect(getScheduleProvider('calendly.com/agence/kickoff')).toBe('calendly')
    expect(getScheduleProvider('https://cal.com/agence/30min')).toBe('calcom')
    expect(getScheduleProvider('https://app.cal.com/agence/30min')).toBe('calcom')
  })

  it('classe le reste en other', () => {
    expect(getScheduleProvider('https://calendar.google.com/appointments/x')).toBe('other')
    expect(getScheduleProvider('')).toBe('other')
    expect(getScheduleProvider('pas-une-url')).toBe('other')
  })
})

describe('toScheduleEmbedUrl', () => {
  it('prépare une URL Calendly embarquable', () => {
    const embed = toScheduleEmbedUrl('https://calendly.com/agence/kickoff')
    expect(embed).toContain('https://calendly.com/agence/kickoff')
    expect(embed).toContain('hide_gdpr_banner=1')
    expect(embed).toContain('embed_type=Inline')
  })

  it('prépare une URL Cal.com embarquable', () => {
    const embed = toScheduleEmbedUrl('https://cal.com/agence/30min')
    expect(embed).toContain('embed=true')
  })

  it('refuse les fournisseurs non embarquables', () => {
    expect(toScheduleEmbedUrl('https://calendar.google.com/appointments/x')).toBeNull()
    expect(toScheduleEmbedUrl('')).toBeNull()
  })
})

describe('isFreliPortalUrl', () => {
  it('détecte un lien /p/…', () => {
    expect(isFreliPortalUrl('http://localhost:5173/p/cfe4e261-7f24-41c9-8cdf-bc6bbd879436')).toBe(
      true,
    )
    expect(isFreliPortalUrl('https://app.freli.fr/p/abc')).toBe(true)
  })

  it('laisse passer Calendly', () => {
    expect(isFreliPortalUrl('https://calendly.com/agence/kickoff')).toBe(false)
  })
})

describe('isScheduleBookingMessage', () => {
  it('reconnaît Calendly', () => {
    expect(isScheduleBookingMessage({ event: 'calendly.event_scheduled' })).toBe(true)
  })

  it('reconnaît Cal.com', () => {
    expect(
      isScheduleBookingMessage({ originator: 'CAL', type: 'bookingSuccessfulV2' }),
    ).toBe(true)
    expect(isScheduleBookingMessage({ type: 'bookingSuccessful' })).toBe(true)
  })

  it('ignore le bruit', () => {
    expect(isScheduleBookingMessage(null)).toBe(false)
    expect(isScheduleBookingMessage({ event: 'resize' })).toBe(false)
    expect(isScheduleBookingMessage('calendly.event_scheduled')).toBe(false)
  })
})
