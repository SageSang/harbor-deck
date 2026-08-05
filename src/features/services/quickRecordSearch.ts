interface SearchableQuickRecord {
  name: string
  primaryUrl: string
  secondaryUrl?: string
  note?: string
}

export function quickRecordMatchesSearch(record: SearchableQuickRecord, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return false

  return [record.name, record.primaryUrl, record.secondaryUrl ?? '', record.note ?? '']
    .join('\n')
    .toLocaleLowerCase()
    .includes(normalizedQuery)
}
