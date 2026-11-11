import { describe, expect, it } from 'vitest'
import {
  afterAiGeneration,
  afterAiSend,
  planDueReminder,
  runWithConcurrency,
  usesAiReminders,
} from './autoReminderRouting.ts'

describe('usesAiReminders', () => {
  it('IA activée + add-on actif → batch IA', () => {
    expect(usesAiReminders({ ai_reminders_enabled: true, auto_reminders_enabled: true }, true)).toBe(true)
  })
  it('IA désactivée → classique', () => {
    expect(usesAiReminders({ ai_reminders_enabled: false, auto_reminders_enabled: true }, true)).toBe(false)
  })
  it('IA activée mais add-on inactif → classique (plus de trou)', () => {
    expect(usesAiReminders({ ai_reminders_enabled: true, auto_reminders_enabled: true }, false)).toBe(false)
  })
  it('réglages absents → classique', () => {
    expect(usesAiReminders(null, true)).toBe(false)
  })
})

describe('planDueReminder', () => {
  it('1ère relance IA jamais validée → classique', () => {
    expect(planDueReminder({ autoSend: true, hasPriorAiSent: false, hasSendableDraft: true })).toBe('classic')
  })
  it('envoi auto IA désactivé → classique', () => {
    expect(planDueReminder({ autoSend: false, hasPriorAiSent: true, hasSendableDraft: true })).toBe('classic')
  })
  it('IA autonome avec brouillon prêt → envoi du brouillon', () => {
    expect(planDueReminder({ autoSend: true, hasPriorAiSent: true, hasSendableDraft: true })).toBe('ai_send_draft')
  })
  it('IA autonome sans brouillon → génération puis envoi', () => {
    expect(planDueReminder({ autoSend: true, hasPriorAiSent: true, hasSendableDraft: false })).toBe(
      'ai_generate_then_send',
    )
  })
})

describe('après la génération IA', () => {
  it('brouillon généré → on l’envoie', () => {
    expect(afterAiGeneration({ ok: true, timedOut: false, reminderId: 'r1' })).toBe('send_draft')
  })
  it('timeout Gemini → classique sur la même réservation', () => {
    expect(afterAiGeneration({ ok: false, timedOut: true, reminderId: null })).toBe('classic_same_claim')
  })
  it('erreur ou crédits épuisés → classique', () => {
    expect(afterAiGeneration({ ok: false, timedOut: false, reminderId: null })).toBe('classic_same_claim')
    expect(afterAiGeneration({ ok: true, timedOut: false, reminderId: null })).toBe('classic_same_claim')
  })
})

describe('après l’envoi IA', () => {
  it('envoyé → terminé', () => {
    expect(afterAiSend({ ok: true, timedOut: false })).toBe('done')
  })
  it('timeout de l’envoi → ne rien renvoyer (évite le doublon)', () => {
    expect(afterAiSend({ ok: false, timedOut: true })).toBe('stop_uncertain')
  })
  it('erreur d’envoi → nouvelle réservation puis classique', () => {
    expect(afterAiSend({ ok: false, timedOut: false })).toBe('classic_new_claim')
  })
})

describe('runWithConcurrency', () => {
  it('borne la concurrence et traite tout', async () => {
    let active = 0
    let peak = 0
    const done: number[] = []
    const left = await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, () => true, async (n) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 5))
      done.push(n)
      active -= 1
    })
    expect(left).toBe(0)
    expect(peak).toBe(3)
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
  it('arrêt doux : compte les tâches non démarrées', async () => {
    let started = 0
    const left = await runWithConcurrency([1, 2, 3, 4, 5], 2, () => started < 2, async () => {
      started += 1
    })
    expect(started).toBe(2)
    expect(left).toBe(3)
  })
})
