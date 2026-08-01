import { describe, expect, it } from 'vitest'
import { parseAppConfig, parseAppConfigText } from '@/features/config/appConfig'

describe('appConfig helpers', () => {
  it('fills missing app config sections with defaults', () => {
    expect(parseAppConfig({})).toEqual({
      system: {
        appName: 'Smart Harbor',
        darkMode: false,
        clickOpenTarget: 'self',
        middleClickOpenTarget: 'blank',
        defaultSearchEngine: 'google',
        customSearchEngines: [],
        networkProbe: {
          lanProtocol: 'http',
          lanHost: '',
          wanProtocol: 'https',
          wanHost: '',
        },
        webdavBackup: {
          url: '',
          username: '',
          password: '',
          remotePath: '/smart-harbor',
          autoBackup: false,
          intervalDays: 7,
          maxVersions: 10,
        },
      },
      navigation: {
        defaultSceneId: 'default',
        bookmarks: [],
        scenes: [
          {
            id: 'default',
            name: '默认',
            protected: false,
            groups: [],
          },
        ],
      },
    })
  })

  it('treats blank config text as defaults', () => {
    expect(parseAppConfigText('   ')).toEqual(parseAppConfig({}))
  })
})
