import { describe, expect, it } from 'vitest'
import {
  buildSearchUrl,
  createSearchEngineId,
  getDefaultSearchEngine,
} from '@/config/searchEngines'
import { systemConfigSchema } from '@/config/schema'

describe('search engine helpers', () => {
  it('uses google as fallback when default engine is missing', () => {
    const engine = getDefaultSearchEngine('missing-engine')

    expect(engine.id).toBe('google')
    expect(engine.name).toBe('Google')
  })

  it('builds encoded search urls from the template', () => {
    const url = buildSearchUrl(
      {
        id: 'google',
        name: 'Google',
        urlTemplate: 'https://www.google.com/search?q={keyword}',
      },
      'hello world'
    )

    expect(url).toBe('https://www.google.com/search?q=hello%20world')
  })

  it('generates unique ids for duplicate custom engines', () => {
    const id = createSearchEngineId('Google', ['google', 'google-2'])

    expect(id).toBe('google-3')
  })
})

describe('systemConfigSchema', () => {
  it('fills search engine defaults for legacy configs', () => {
    const config = systemConfigSchema.parse({
      appName: 'HarborDeck',
    })

    expect(config.defaultSearchEngine).toBe('google')
    expect(config.customSearchEngines).toEqual([])
    expect(config.darkMode).toBe(false)
    expect(config.networkProbe).toEqual({
      lanProtocol: 'http',
      lanHost: '',
      wanProtocol: 'https',
      wanHost: '',
    })
  })

  it('rejects invalid network probe hosts', () => {
    expect(() =>
      systemConfigSchema.parse({
        appName: 'HarborDeck',
        networkProbe: {
          lanProtocol: 'http',
          lanHost: 'https://192.168.1.10/api/health',
          wanProtocol: 'https',
          wanHost: 'harbor.example.com',
        },
      })
    ).toThrow('不要包含协议或路径')
  })

  it('rejects invalid custom search templates', () => {
    expect(() =>
      systemConfigSchema.parse({
        appName: 'HarborDeck',
        defaultSearchEngine: 'google',
        customSearchEngines: [
          {
            id: 'custom',
            name: 'Custom',
            urlTemplate: 'https://example.com/search',
          },
        ],
      })
    ).toThrow('{keyword}')
  })

  it('rejects custom search templates with executable protocols', () => {
    expect(() =>
      systemConfigSchema.parse({
        appName: 'HarborDeck',
        defaultSearchEngine: 'custom',
        customSearchEngines: [
          {
            id: 'custom',
            name: 'Custom',
            urlTemplate: 'javascript:alert({keyword})',
          },
        ],
      })
    ).toThrow('{keyword}')
  })

  it('rejects missing default search engine ids', () => {
    expect(() =>
      systemConfigSchema.parse({
        appName: 'HarborDeck',
        defaultSearchEngine: 'custom-engine',
      })
    ).toThrow('默认搜索引擎不存在')
  })
})
