import { beforeEach, describe, expect, it } from 'vitest'
import { HOME_TAB, useTabStore } from './tabStore'

const freshState = () => {
  useTabStore.setState({ tabs: [HOME_TAB], activeTabId: HOME_TAB.id })
}

describe('tabStore', () => {
  beforeEach(() => {
    localStorage.clear()
    freshState()
  })

  it('starts with the non-closable Dashboard tab', () => {
    const { tabs, activeTabId } = useTabStore.getState()
    expect(tabs).toHaveLength(1)
    expect(tabs[0].closable).toBe(false)
    expect(activeTabId).toBe('/')
  })

  it('adds a tab keyed by its route path and activates it', () => {
    const id = useTabStore.getState().addTab({ title: 'Lineage', path: '/lineage', icon: 'network' })

    expect(id).toBe('/lineage')
    const { tabs, activeTabId } = useTabStore.getState()
    expect(tabs).toHaveLength(2)
    expect(activeTabId).toBe('/lineage')
  })

  it('reuses an existing tab for the same path instead of duplicating', () => {
    useTabStore.getState().addTab({ title: 'Models', path: '/models' })
    useTabStore.getState().closeTab('/models')
    useTabStore.setState({ activeTabId: HOME_TAB.id })

    const id = useTabStore.getState().addTab({ title: 'Models', path: '/models' })
    const second = useTabStore.getState().addTab({ title: 'Models again', path: '/models' })

    expect(second).toBe(id)
    expect(useTabStore.getState().tabs.filter((t) => t.path === '/models')).toHaveLength(1)
  })

  it('refuses to add beyond the max tab count', () => {
    const paths = ['/models', '/lineage', '/sql', '/runs', '/schedules', '/environments', '/version-control', '/file-editor', '/docs', '/settings', '/plugins/installed']
    paths.forEach((p, i) => useTabStore.getState().addTab({ title: p, path: p }))

    expect(useTabStore.getState().tabs.length).toBeLessThanOrEqual(10)
  })

  it('closing the active tab activates the neighbour', () => {
    useTabStore.getState().addTab({ title: 'Models', path: '/models' })
    useTabStore.getState().addTab({ title: 'Lineage', path: '/lineage' })
    expect(useTabStore.getState().activeTabId).toBe('/lineage')

    useTabStore.getState().closeTab('/lineage')

    expect(useTabStore.getState().activeTabId).toBe('/models')
    expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(['/', '/models'])
  })

  it('closing a non-active tab keeps the active tab', () => {
    useTabStore.getState().addTab({ title: 'Models', path: '/models' })
    useTabStore.getState().setActiveTab('/')

    useTabStore.getState().closeTab('/models')

    expect(useTabStore.getState().activeTabId).toBe('/')
    expect(useTabStore.getState().tabs).toHaveLength(1)
  })

  it('cannot close the home tab', () => {
    useTabStore.getState().closeTab('/')

    expect(useTabStore.getState().tabs).toHaveLength(1)
    expect(useTabStore.getState().activeTabId).toBe('/')
  })

  it('reorders tabs', () => {
    useTabStore.getState().addTab({ title: 'Models', path: '/models' })
    useTabStore.getState().addTab({ title: 'Lineage', path: '/lineage' })

    useTabStore.getState().reorderTabs(2, 1)

    expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(['/', '/lineage', '/models'])
  })
})
