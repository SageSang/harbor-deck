import { resolveDynamicIconName } from './iconNames.js'

interface RecordContent {
  name: string
  primaryUrl: string
  secondaryUrl?: string
  note?: string
  icon?: string
}

const labels = {
  name: '名称 / name',
  primaryUrl: '主地址 / primary URL',
  secondaryUrl: '备用地址 / secondary URL',
  note: '备注 / note',
  icon: '图标 / icon',
}
function value(key: keyof RecordContent, text: string | undefined) {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return ''
  if (key === 'icon') return resolveDynamicIconName(trimmed) ?? trimmed
  if (key === 'primaryUrl' || key === 'secondaryUrl') {
    try {
      return new URL(trimmed).toString()
    } catch {
      return trimmed
    }
  }
  return trimmed
}

/** Only source content that would be discarded needs an explicit decision. */
export function quickRecordConflicts(source: RecordContent, existing: RecordContent) {
  return (Object.keys(labels) as Array<keyof RecordContent>)
    .filter(
      (key) => value(key, source[key]) && value(key, source[key]) !== value(key, existing[key])
    )
    .map((key) => labels[key])
}

export function promotionConflictMessage(name: string, fields: string[]) {
  return `“${name}”与已有书签的${fields.join('、')}不同。记录已保留，请单条编辑并选择另建书签或明确舍弃差异。 / Record retained: resolve the differing fields before reusing the bookmark.`
}
