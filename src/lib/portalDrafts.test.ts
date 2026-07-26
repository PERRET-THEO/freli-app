import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllDrafts,
  clearDraft,
  countRestorableDrafts,
  mergeDraftsIntoValues,
  pruneDrafts,
  readDrafts,
  saveDraft,
  type DraftStorage,
} from './portalDrafts'

function memoryStorage(): DraftStorage & { dump: () => Record<string, string> } {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  }
}

const TOKEN = 'a1b2c3d4-1111-4222-8333-444455556666'
const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

let storage: ReturnType<typeof memoryStorage>

beforeEach(() => {
  storage = memoryStorage()
})

describe('saveDraft / readDrafts', () => {
  it('conserve puis relit une saisie en cours', () => {
    saveDraft(TOKEN, 'item-1', 'Mon brief en cours', storage, NOW)
    expect(readDrafts(TOKEN, storage, NOW)).toEqual({
      'item-1': { value: 'Mon brief en cours', savedAt: NOW },
    })
  })

  it('supprime le brouillon quand la saisie est vidée', () => {
    saveDraft(TOKEN, 'item-1', 'texte', storage, NOW)
    saveDraft(TOKEN, 'item-1', '   ', storage, NOW)
    expect(readDrafts(TOKEN, storage, NOW)).toEqual({})
  })

  it('isole les brouillons par token de portail', () => {
    saveDraft(TOKEN, 'item-1', 'A', storage, NOW)
    saveDraft('autre-token', 'item-1', 'B', storage, NOW)
    expect(readDrafts(TOKEN, storage, NOW)['item-1'].value).toBe('A')
    expect(readDrafts('autre-token', storage, NOW)['item-1'].value).toBe('B')
  })

  it('vide la clé de stockage quand il ne reste aucun brouillon', () => {
    saveDraft(TOKEN, 'item-1', 'texte', storage, NOW)
    clearDraft(TOKEN, 'item-1', storage, NOW)
    expect(storage.dump()).toEqual({})
  })

  it('renvoie un objet vide sur contenu illisible', () => {
    storage.setItem('freli:portal-draft:' + TOKEN, 'pas du json')
    expect(readDrafts(TOKEN, storage, NOW)).toEqual({})
  })

  it('ne casse pas sans stockage disponible', () => {
    expect(readDrafts(TOKEN, null, NOW)).toEqual({})
    expect(() => saveDraft(TOKEN, 'item-1', 'x', null, NOW)).not.toThrow()
  })
})

describe('pruneDrafts', () => {
  it('écarte les brouillons expirés', () => {
    const drafts = {
      frais: { value: 'récent', savedAt: NOW - DAY },
      vieux: { value: 'périmé', savedAt: NOW - 31 * DAY },
    }
    expect(Object.keys(pruneDrafts(drafts, NOW))).toEqual(['frais'])
  })

  it('écarte les entrées malformées', () => {
    const drafts = {
      ok: { value: 'bon', savedAt: NOW },
      sansValeur: { savedAt: NOW } as unknown as { value: string; savedAt: number },
      sansDate: { value: 'x', savedAt: Number.NaN },
      vide: { value: '   ', savedAt: NOW },
    }
    expect(Object.keys(pruneDrafts(drafts, NOW))).toEqual(['ok'])
  })
})

describe('mergeDraftsIntoValues', () => {
  const drafts = {
    ouvert: { value: 'brouillon local', savedAt: NOW },
    transmis: { value: 'ancienne saisie', savedAt: NOW },
  }

  it('restaure le brouillon sur une étape encore ouverte', () => {
    const merged = mergeDraftsIntoValues({ ouvert: '' }, drafts, new Set(['ouvert']))
    expect(merged.ouvert).toBe('brouillon local')
  })

  it('ne réécrit pas une étape déjà transmise', () => {
    const merged = mergeDraftsIntoValues(
      { transmis: 'valeur validée' },
      drafts,
      new Set(['ouvert']),
    )
    expect(merged.transmis).toBe('valeur validée')
  })

  it('laisse la valeur serveur si le brouillon est identique', () => {
    const merged = mergeDraftsIntoValues(
      { ouvert: 'brouillon local' },
      drafts,
      new Set(['ouvert']),
    )
    expect(merged.ouvert).toBe('brouillon local')
  })
})

describe('countRestorableDrafts', () => {
  it('ne compte que les brouillons qui changent quelque chose', () => {
    const drafts = {
      nouveau: { value: 'texte', savedAt: NOW },
      identique: { value: 'déjà envoyé', savedAt: NOW },
      ferme: { value: 'texte', savedAt: NOW },
    }
    const count = countRestorableDrafts(
      { identique: 'déjà envoyé' },
      drafts,
      new Set(['nouveau', 'identique']),
    )
    expect(count).toBe(1)
  })
})

describe('clearAllDrafts', () => {
  it('supprime tous les brouillons du portail', () => {
    saveDraft(TOKEN, 'item-1', 'A', storage, NOW)
    saveDraft(TOKEN, 'item-2', 'B', storage, NOW)
    clearAllDrafts(TOKEN, storage)
    expect(readDrafts(TOKEN, storage, NOW)).toEqual({})
  })
})
