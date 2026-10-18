import { describe, expect, it } from 'vitest'
import {
  serviceIconCategoryOrder,
  resolveDynamicIconName,
  searchServiceIconOptions,
  serviceIconOptions,
} from '@/features/services/icons'

describe('service icon helpers', () => {
  it('resolves icon names from multiple input formats', () => {
    expect(resolveDynamicIconName('ArrowDown')).toBe('arrow-down')
    expect(resolveDynamicIconName('arrow-down')).toBe('arrow-down')
    expect(resolveDynamicIconName('arrow_down')).toBe('arrow-down')
    expect(resolveDynamicIconName('Star')).toBe('star')
    expect(resolveDynamicIconName('ArrowUpRight')).toBe('arrow-up-right')
  })

  it.each(['constructor', '__proto__', 'toString'])('rejects inherited icon names: %s', (name) => {
    expect(resolveDynamicIconName(name)).toBeNull()
  })

  it.each([
    ['Building2', 'building-2'],
    ['ArrowDownAZ', 'arrow-down-a-z'],
  ])('resolves historical labels with numbers and abbreviations: %s', (label, key) => {
    expect(resolveDynamicIconName(label)).toBe(key)
    expect(resolveDynamicIconName(`  ${label.toLowerCase()}  `)).toBe(key)
  })

  it('round-trips every displayed catalog label and preserves every canonical key', () => {
    for (const { label, loaderKey } of serviceIconOptions) {
      expect(resolveDynamicIconName(label), label).toBe(loaderKey)
      expect(resolveDynamicIconName(loaderKey), loaderKey).toBe(loaderKey)
    }
  })

  it('keeps the icon catalog unique', () => {
    expect(new Set(serviceIconOptions.map((option) => option.loaderKey)).size).toBe(
      serviceIconOptions.length
    )
  })

  it('stores search text for both kebab-case and spaced lookups', () => {
    const arrowDown = serviceIconOptions.find((option) => option.loaderKey === 'arrow-down')

    expect(arrowDown?.searchText).toContain('arrow-down')
    expect(arrowDown?.searchText).toContain('arrow down')
    expect(arrowDown?.searchText).toContain('arrowdown')
  })

  it('prioritizes curated Chinese aliases for common icons', () => {
    const settingResults = searchServiceIconOptions('设置')
      .slice(0, 3)
      .map((option) => option.loaderKey)
    const albumResults = searchServiceIconOptions('相册')
      .slice(0, 4)
      .map((option) => option.loaderKey)

    expect(settingResults[0]).toBe('settings')
    expect(settingResults).toContain('settings-2')
    expect(albumResults).toEqual(expect.arrayContaining(['image', 'images']))
  })

  it('assigns browse categories to common icons', () => {
    const database = serviceIconOptions.find((option) => option.loaderKey === 'database')
    const folderOpen = serviceIconOptions.find((option) => option.loaderKey === 'folder-open')
    const image = serviceIconOptions.find((option) => option.loaderKey === 'image')

    expect(database?.categories).toEqual(expect.arrayContaining(['development', 'files']))
    expect(folderOpen?.categories).toContain('files')
    expect(image?.categories).toContain('media')
  })

  it('supports generic category keywords in search', () => {
    const developmentResults = searchServiceIconOptions('开发')
      .slice(0, 20)
      .map((option) => option.loaderKey)
    const fileResults = searchServiceIconOptions('文件')
      .slice(0, 20)
      .map((option) => option.loaderKey)

    expect(developmentResults).toEqual(expect.arrayContaining(['code', 'bug', 'bot']))
    expect(fileResults).toEqual(expect.arrayContaining(['file', 'file-code']))
  })

  it('matches chinese infrastructure keywords without a full manual icon map', () => {
    expect(searchServiceIconOptions('数据库')[0]?.loaderKey).toBe('database')
    expect(searchServiceIconOptions('终端')[0]?.loaderKey).toBe('square-terminal')
    expect(searchServiceIconOptions('硬盘')[0]?.loaderKey).toBe('hard-drive')
  })

  it('keeps the category registry stable', () => {
    expect(serviceIconCategoryOrder).toEqual([
      'system',
      'files',
      'media',
      'development',
      'network',
      'security',
      'communication',
    ])
  })
})
