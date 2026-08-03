import { afterEach, describe, expect, it } from 'vitest'
import { getRecentProjects, pushRecentProject } from '../lib/recentProjects'

describe('recentProjects', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('stores newest project first and caps at five', () => {
    for (let i = 1; i <= 6; i += 1) {
      pushRecentProject(`id-${i}`, `Client ${i}`)
    }
    const recents = getRecentProjects()
    expect(recents).toHaveLength(5)
    expect(recents[0]).toMatchObject({ id: 'id-6', name: 'Client 6' })
    expect(recents.map((item) => item.id)).not.toContain('id-1')
  })

  it('dedupes by moving an existing project to the front', () => {
    pushRecentProject('a', 'Alpha')
    pushRecentProject('b', 'Beta')
    pushRecentProject('a', 'Alpha updated')
    const recents = getRecentProjects()
    expect(recents[0]).toMatchObject({ id: 'a', name: 'Alpha updated' })
    expect(recents.filter((item) => item.id === 'a')).toHaveLength(1)
  })
})
