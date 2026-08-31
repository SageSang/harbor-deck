import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasStoredCollapsedGroupKeys,
  readCollapsedGroupKeys,
} from './groupPreference'

const COLLAPSED_GROUPS_STORAGE_KEY = 'harbordeck-collapsed-groups'

describe('group collapse preferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('distinguishes no preference from an explicitly empty preference', () => {
    expect(hasStoredCollapsedGroupKeys()).toBe(false)
    expect(readCollapsedGroupKeys()).toEqual([])

    window.localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, '[]')

    expect(hasStoredCollapsedGroupKeys()).toBe(true)
    expect(readCollapsedGroupKeys()).toEqual([])
  })
})
