// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { navigationConfigSchema } from '../src/config/schema'
import { promoteManagedQuickRecord, updateManagedBookmark } from './bookmarkManagementService'
import { promoteQuickRecords } from '../src/features/services/promoteQuickRecords'

function fixture() {
  return navigationConfigSchema.parse({
    _revision: 'r1',
    defaultSceneId: 'main',
    bookmarks: [
      {
        slug: 'shared',
        name: 'Saved',
        primaryUrl: 'https://example.com/',
        note: 'Original',
        icon: 'ArrowUpRight',
      },
    ],
    scenes: [
      {
        id: 'main',
        name: 'Main',
        groups: [
          { id: 'a', name: 'A', bookmarkIds: ['shared'] },
          { id: 'b', name: 'B', bookmarkIds: [] },
        ],
        quickRecords: [
          {
            id: 'q',
            name: 'Saved',
            primaryUrl: 'https://example.com/',
            note: 'Unique',
            icon: 'arrow-up-right',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      { id: 'other', name: 'Other', groups: [{ id: 'a', name: 'A', bookmarkIds: ['shared'] }] },
    ],
  })
}
const placements = [{ sceneId: 'main', groupId: 'b' }]
describe('promotion protects source content and shared references', () => {
  it.each([
    { name: 'Unique name' },
    { note: 'Unique note' },
    { secondaryUrl: 'https://backup.example.com/' },
    { primaryUrl: 'https://example.com/#section' },
    { icon: 'Star' },
  ])('rejects silent reuse of different source content: %j', (patch) => {
    const navigation = fixture()
    Object.assign(navigation.scenes[0].quickRecords[0], { note: 'Original' }, patch)
    const original = structuredClone(navigation)
    expect(() => promoteQuickRecords(navigation, 'main', ['q'], 'b')).toThrow('记录已保留')
    expect(() =>
      promoteManagedQuickRecord(navigation, 'main', 'q', { placements, reuseExistingByUrl: true })
    ).toThrow('记录已保留')
    expect(navigation).toEqual(original)
  })
  it('requires a decision even when the existing note is empty', () => {
    const nav = fixture()
    delete nav.bookmarks[0].note
    expect(() => promoteQuickRecords(nav, 'main', ['q'], 'b')).toThrow('备注')
  })
  it('reuses identical content and moves only the selected scene', () => {
    const nav = fixture()
    nav.scenes[0].quickRecords[0].note = 'Original'
    const out = promoteQuickRecords(nav, 'main', ['q'], 'b')
    expect(out._revision).toBe('r1')
    expect(out.scenes[0].groups.map((g) => g.bookmarkIds)).toEqual([[], ['shared']])
    expect(out.scenes[1]).toEqual(nav.scenes[1])
    expect(out.bookmarks).toEqual(nav.bookmarks)
    expect(out.scenes[0].quickRecords).toEqual([])
  })
  it('retains the whole batch when a later record conflicts, including duplicates within the batch', () => {
    const nav = fixture()
    nav.scenes[0].quickRecords.unshift({
      ...nav.scenes[0].quickRecords[0],
      id: 'first',
      name: 'New',
      primaryUrl: 'https://new.example.com/',
    })
    const original = structuredClone(nav)
    expect(() => promoteQuickRecords(nav, 'main', ['first', 'q'], 'b')).toThrow()
    expect(nav).toEqual(original)
    nav.bookmarks = []
    nav.scenes[0].groups[0].bookmarkIds = []
    nav.scenes[1].groups[0].bookmarkIds = []
    nav.scenes[0].quickRecords[1].primaryUrl = 'https://new.example.com/'
    expect(() => promoteQuickRecords(nav, 'main', ['first', 'q'], 'b')).toThrow()
    expect(nav.scenes[0].quickRecords).toHaveLength(2)
  })
  it('supports explicit separate creation or explicit discard without modifying the shared bookmark', () => {
    const nav = fixture()
    const separate = promoteManagedQuickRecord(nav, 'main', 'q', {
      placements,
      reuseExistingByUrl: false,
    })
    expect(separate.result.bookmark.note).toBe('Unique')
    expect(separate.result.bookmark.icon).toBe('arrow-up-right')
    expect(separate.navigation.bookmarks[0]).toEqual(nav.bookmarks[0])
    const reused = promoteManagedQuickRecord(nav, 'main', 'q', {
      placements,
      reuseExistingByUrl: true,
      discardConflictingFields: true,
    })
    expect(reused.navigation.bookmarks).toEqual(nav.bookmarks)
    expect(reused.navigation.scenes[0].quickRecords).toEqual([])
    expect(reused.navigation.scenes[1]).toEqual(nav.scenes[1])
  })
  it('updates notes on legacy UI icons without dropping the icon, and still rejects unknown new icons', () => {
    const nav = fixture()
    expect(updateManagedBookmark(nav, 'shared', { note: 'Changed' }).result.bookmark).toMatchObject(
      { icon: 'arrow-up-right', note: 'Changed' }
    )
    expect(() => updateManagedBookmark(nav, 'shared', { icon: 'not-an-icon' })).toThrow('不支持')
  })
})
