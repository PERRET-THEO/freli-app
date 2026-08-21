import { describe, expect, it } from 'vitest'

// Ces modules ciblent Deno ; le runner Node doit fournir le global avant import.
;(globalThis as { Deno?: unknown }).Deno ??= { env: { get: () => undefined } }

const { buildClientOnboardingEmail, buildWaitlistConfirmationEmail, isValidProjectToken } = await import('./clientEmailHtml.ts')

const BASE = {
  clientName: 'Marie Dupont',
  agencyName: 'Studio Nord',
  portalUrl: 'https://app.freli.fr/p/abc',
}

describe('isValidProjectToken', () => {
  it('accepte un UUID v4', () => {
    expect(isValidProjectToken('a1b2c3d4-1111-4222-8333-444455556666')).toBe(true)
  })

  it('rejette les jetons malformés', () => {
    expect(isValidProjectToken('abc')).toBe(false)
    expect(isValidProjectToken('')).toBe(false)
  })
})

describe('buildClientOnboardingEmail — relance item-level', () => {
  it('nomme chaque étape restante', () => {
    const html = buildClientOnboardingEmail({
      ...BASE,
      mode: 'reminder',
      pendingItems: [{ label: 'Logo vectoriel' }, { label: 'Brief créatif' }],
    })
    expect(html).toContain('Logo vectoriel')
    expect(html).toContain('Brief créatif')
    expect(html).toContain('Il reste 2 étapes')
  })

  it('accorde le compteur au singulier', () => {
    const html = buildClientOnboardingEmail({
      ...BASE,
      mode: 'reminder',
      pendingItems: [{ label: 'Logo vectoriel' }],
    })
    expect(html).toContain('Il reste 1 étape')
    expect(html).not.toContain('Il reste 1 étapes')
  })

  it('affiche le motif de correction et bascule le ton', () => {
    const html = buildClientOnboardingEmail({
      ...BASE,
      mode: 'reminder',
      pendingItems: [{ label: 'Kbis', reviewNote: 'Document illisible, merci de rescanner.' }],
    })
    expect(html).toContain('À corriger : Document illisible, merci de rescanner.')
    expect(html).toContain('à ajuster')
    expect(html).toContain('Reprendre mon dossier')
  })

  it('échappe le HTML des libellés et motifs', () => {
    const html = buildClientOnboardingEmail({
      ...BASE,
      mode: 'reminder',
      pendingItems: [{ label: '<script>x</script>', reviewNote: 'a & b' }],
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
  })

  it('retombe sur le bloc générique sans étape fournie', () => {
    const html = buildClientOnboardingEmail({ ...BASE, mode: 'reminder' })
    expect(html).toContain('Checklist personnalisée')
    expect(html).toContain('Compléter mon onboarding')
  })
})

describe('buildClientOnboardingEmail — invitation', () => {
  it("garde le bloc de présentation à l'invitation", () => {
    const html = buildClientOnboardingEmail({ ...BASE, mode: 'invite' })
    expect(html).toContain('Checklist personnalisée')
    expect(html).toContain('Accéder à mon espace')
  })

  it('échappe le nom du client', () => {
    const html = buildClientOnboardingEmail({
      ...BASE,
      clientName: 'Marie & Co <b>',
      mode: 'invite',
    })
    expect(html).toContain('Marie &amp; Co &lt;b&gt;')
  })
})

describe('buildWaitlistConfirmationEmail', () => {
  it('personnalise le prénom et inclut le lien de désinscription', () => {
    const html = buildWaitlistConfirmationEmail({
      firstName: 'Camille',
      unsubscribeUrl: 'https://lancement.freli.fr/desinscription?token=abc',
      siteUrl: 'https://www.freli.fr',
    })
    expect(html).toContain('Camille')
    expect(html).toContain('https://lancement.freli.fr/desinscription?token=abc')
    expect(html).toContain('se désinscrire')
  })

  it('échappe le prénom', () => {
    const html = buildWaitlistConfirmationEmail({
      firstName: '<script>x</script>',
      unsubscribeUrl: 'https://lancement.freli.fr/desinscription?token=abc',
      siteUrl: 'https://www.freli.fr',
    })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
