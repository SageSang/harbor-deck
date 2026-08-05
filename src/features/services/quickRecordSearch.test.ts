import { describe, expect, it } from 'vitest'
import { quickRecordMatchesSearch } from './quickRecordSearch'

const record = {
  id: 'quick-deleted-keyword',
  name: 'Current title',
  primaryUrl: 'https://example.com/current',
  note: 'Current note',
  createdAt: 1,
  updatedAt: 1,
}

describe('quick-record search', () => {
  it('matches user-editable fields', () => {
    expect(quickRecordMatchesSearch(record, 'current title')).toBe(true)
    expect(quickRecordMatchesSearch(record, 'example.com')).toBe(true)
    expect(quickRecordMatchesSearch(record, 'current note')).toBe(true)
  })

  it('does not expose the internal record id as searchable text', () => {
    expect(quickRecordMatchesSearch(record, 'deleted-keyword')).toBe(false)
  })
})
